/* What the engine proposes for a row being added. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../src/core/model.js";
import { normalizeRows } from "../src/core/pipeline.js";
import { proposeRow, nextId, parseVoltage, formatVoltage, formatRatio, usualLvVolts, proposeVoltage } from "../src/core/propose.js";

const SHEET = [
  { id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" },
  { id: "MVB1", type: "MV Busbar", voltage: "11 kV", from: "MV1", prot: "CB" },
  { id: "TX1", type: "Transformer", voltage: "11/0.4 kV", from: "MVB1", prot: "CB" },
  { id: "BB1", type: "LV Busbar", voltage: "400 V", from: "TX1", prot: "CB" },
  { id: "F1", type: "Feeder", voltage: "400 V", from: "BB1", prot: "CB" },
];
const model = rows => { const { items, order } = buildModel(normalizeRows(rows)); return [items, order]; };
const propose = (rows, opts) => { const [items, order] = model(rows); return proposeRow(items, order, opts); };

test("parse and format a voltage", () => {
  assert.deepEqual(parseVoltage("11 kV"), { primary: 11000 });
  assert.deepEqual(parseVoltage("11/0.4 kV"), { primary: 11000, secondary: 400 });
  assert.deepEqual(parseVoltage("400 V"), { primary: 400 });
  assert.deepEqual(parseVoltage("400/230 V"), { primary: 400, secondary: 230 });
  assert.equal(parseVoltage("110 V DC").primary, 110);
  assert.equal(parseVoltage(""), null);
  assert.equal(parseVoltage("low voltage"), null);
  assert.equal(formatVoltage(400), "400 V");
  assert.equal(formatVoltage(11000), "11 kV");
  assert.equal(formatVoltage(3300), "3.3 kV");
  assert.equal(formatRatio(11000, 400), "11/0.4 kV");
  assert.equal(formatRatio(33000, 11000), "33/11 kV");
  assert.equal(formatRatio(400, 230), "400/230 V");
});

test("IDs are numbered from the type's prefix and skip the used ones", () => {
  assert.equal(nextId("Feeder", ["F1", "F2", "BB1"]), "F3");
  assert.equal(nextId("Feeder", ["f1", "F3"]), "F2");
  assert.equal(nextId("Transformer", []), "TX1");
  assert.equal(nextId("UPS", ["UPS1"]), "UPS2");
  assert.equal(nextId("Inverter", []), "INV1");
  assert.equal(nextId("Battery", []), "BAT1");
  assert.equal(nextId("DC Busbar", []), "DCB1");
  assert.equal(nextId("Nonsense", ["X1"]), "X2");
});

test("a feeder dropped on an LV board takes its voltage, a breaker and the board", () => {
  const r = propose(SHEET, { type: "Feeder", targetId: "BB1" });
  assert.deepEqual([r.id, r.type, r.from, r.prot, r.voltage], ["F2", "Feeder", "BB1", "CB", "400 V"]);
  assert.deepEqual(r.proposed.sort(), ["from", "id", "prot", "voltage"]);
  assert.deepEqual([r.desc, r.rating, r.notes], ["", "", ""]);
});

test("a transformer dropped on MV gear gets the ratio the sheet uses", () => {
  assert.equal(propose(SHEET, { type: "Transformer", targetId: "MVB1" }).voltage, "11/0.4 kV");
  assert.equal(propose(SHEET, { type: "Transformer", targetId: "MVB1" }).prot, "CB");
  /* the sheet's LV level is followed */
  const at690 = SHEET.map(r => r.id === "BB1" ? { ...r, voltage: "690 V" } : r);
  assert.equal(propose(at690, { type: "Transformer", targetId: "MVB1" }).voltage, "11/0.69 kV");
  /* a 33 kV board */
  const hv = [{ id: "HV", type: "MV Busbar", voltage: "33 kV", from: "" }].concat(SHEET);
  assert.equal(propose(hv, { type: "Transformer", targetId: "HV" }).voltage, "33/0.4 kV");
  assert.equal(usualLvVolts(...model(SHEET)), 400);
});

test("a board fed from a transformer takes the secondary", () => {
  assert.equal(propose(SHEET, { type: "LV Busbar", targetId: "TX1" }).voltage, "400 V");
  const tx33 = SHEET.map(r => r.id === "TX1" ? { ...r, voltage: "33/11 kV" } : r);
  assert.equal(propose(tx33, { type: "MV Busbar", targetId: "TX1" }).voltage, "11 kV");
});

test("MV loads and motors", () => {
  assert.equal(propose(SHEET, { type: "Pump", targetId: "MVB1" }).voltage, "11 kV");
  assert.equal(propose(SHEET, { type: "Pump", targetId: "MVB1" }).prot, "Fuse-contactor");
  assert.equal(propose(SHEET, { type: "Pump", targetId: "BB1" }).prot, "CB");
  assert.equal(propose(SHEET, { type: "Feeder", targetId: "MVB1" }).voltage, "11 kV");
  assert.equal(propose(SHEET, { type: "MCC", targetId: "BB1" }).voltage, "400 V");
});

test("an RMU fed from two supplies gets a device per supply", () => {
  const r = propose(SHEET, { type: "RMU", targetId: "MV1, MV1" });
  assert.equal(r.prot, "LBS, LBS");
  assert.equal(propose(SHEET, { type: "RMU", targetId: "MV1" }).prot, "LBS");
});

test("with no target, the supply comes from the row above", () => {
  const r = propose(SHEET, { type: "Feeder", sibling: { from: "BB1" } });
  assert.equal(r.from, "BB1");
  assert.equal(r.voltage, "400 V");
  const none = propose(SHEET, { type: "Feeder" });
  assert.deepEqual([none.from, none.voltage], ["", ""]);
  assert.ok(!none.proposed.includes("from"));
});

test("nothing is proposed for a row with no type yet, except the sibling's supply", () => {
  const r = propose(SHEET, { sibling: { from: "BB1" } });
  assert.deepEqual([r.id, r.type, r.prot, r.voltage], ["", "", "", ""]);
  assert.deepEqual(r.proposed, ["from"]);
});

test("an unreadable or absent supply voltage proposes nothing", () => {
  const odd = SHEET.map(r => r.id === "BB1" ? { ...r, voltage: "low" } : r);
  assert.equal(propose(odd, { type: "Feeder", targetId: "BB1" }).voltage, "");
  assert.equal(propose(SHEET, { type: "Feeder", targetId: "NOPE" }).voltage, "");
  assert.equal(proposeVoltage(...model(SHEET), "Feeder", null), "");
});
