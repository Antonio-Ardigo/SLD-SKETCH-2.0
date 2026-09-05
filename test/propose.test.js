/* What the engine proposes for a row being added. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../src/core/model.js";
import { normalizeRows } from "../src/core/pipeline.js";
import { proposeRow, nextId, parseVoltage, formatVoltage, formatRatio, usualLvVolts, proposeVoltage } from "../src/core/propose.js";
import { normalizeView } from "../src/core/views.js";
import { draw } from "../src/core/pipeline.js";

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

test("a feeder dropped on an LV board takes its voltage and the board, and no device", () => {
  /* a feeder is the way out of a board — a placeholder to hang equipment on.
     Proposing a breaker for it would put two devices in series the moment a
     pump is attached, so its Protection is left for the surveyor to fill in. */
  const r = propose(SHEET, { type: "Feeder", targetId: "BB1" });
  assert.deepEqual([r.id, r.type, r.from, r.prot, r.voltage], ["F2", "Feeder", "BB1", "", "400 V"]);
  assert.deepEqual(r.proposed.sort(), ["from", "id", "voltage"]);
  assert.deepEqual([r.desc, r.rating, r.notes], ["", "", ""]);
  /* every other type keeps its usual device: a way of a board is a breaker,
     and a motor hung somewhere that is not a board is a contactor */
  assert.equal(propose(SHEET, { type: "MCC", targetId: "BB1" }).prot, "CB");
  assert.equal(propose(SHEET, { type: "Pump", targetId: "BB1" }).prot, "CB");
  assert.equal(propose(SHEET, { type: "Pump", targetId: "F1" }).prot, "Contactor");
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
  assert.equal(propose(SHEET, { type: "Pump", targetId: "MVB1" }).prot, "Fused contactor");
  assert.equal(propose(SHEET, { type: "Pump", targetId: "BB1" }).prot, "CB");
  assert.equal(propose(SHEET, { type: "Feeder", targetId: "MVB1" }).voltage, "11 kV");
  assert.equal(propose(SHEET, { type: "MCC", targetId: "BB1" }).voltage, "400 V");
});

test("a coupler dropped on one of two boards ties them; in any doubt it names one end", () => {
  const twin = SHEET.concat([
    { id: "TX2", type: "Transformer", voltage: "11/0.4 kV", from: "MVB1", prot: "CB" },
    { id: "BB2", type: "LV Busbar", voltage: "400 V", from: "TX2", prot: "CB" },
  ]);
  const tie = propose(twin, { type: "Bus Coupler", targetId: "BB2" });
  assert.deepEqual([tie.from, tie.prot, tie.voltage], ["BB1, BB2", "CB", "400 V"]);   /* sheet order, whichever end was dropped on */
  assert.equal(propose(twin, { type: "Bus Coupler" }).from, "BB1, BB2");                /* the palette click too */
  /* the only board and a genset: the changeover */
  const gen = SHEET.concat([{ id: "G1", type: "Generator", voltage: "400 V", from: "" }]);
  assert.equal(propose(gen, { type: "Bus Coupler", targetId: "BB1" }).from, "BB1, G1");
  /* two boards and a genset: nothing certain, one end */
  assert.equal(propose(twin.concat([{ id: "G1", type: "Generator", voltage: "400 V", from: "" }]), { type: "Bus Coupler", targetId: "BB1" }).from, "BB1");
  /* a distribution board under one of them is not a third end: the tie is still certain */
  assert.equal(propose(twin.concat([{ id: "DB1", type: "LV Busbar", voltage: "400 V", from: "F1", prot: "CB" }]), { type: "Bus Coupler", targetId: "BB1" }).from, "BB1, BB2");
  assert.equal(propose(twin.concat([{ id: "DB1", type: "LV Busbar", voltage: "400 V", from: "BB2", prot: "CB" }]), { type: "Bus Coupler", targetId: "BB1" }).from, "BB1, BB2");
  /* three main boards: nothing certain */
  assert.equal(propose(twin.concat([{ id: "TX3", type: "Transformer", voltage: "11/0.4 kV", from: "MVB1", prot: "CB" }, { id: "BB3", type: "LV Busbar", voltage: "400 V", from: "TX3", prot: "CB" }]), { type: "Bus Coupler", targetId: "BB1" }).from, "BB1");
  assert.equal(propose(SHEET, { type: "Bus Coupler", targetId: "BB1" }).from, "BB1");
  /* a generator behind its step-up is not a changeover's end */
  const su = SHEET.concat([{ id: "G1", type: "Generator", voltage: "400 V", from: "TX9" }, { id: "TX9", type: "Transformer", voltage: "0.4/11 kV", from: "G1" }]);
  assert.equal(propose(su, { type: "Bus Coupler", targetId: "BB1" }).from, "BB1");
});

test("what is dropped on a way is labelled and protected as if on the way's board", () => {
  const ways = SHEET.concat([
    { id: "W1", type: "Feeder", voltage: "11 kV", from: "MVB1" },
    { id: "RMU1", type: "RMU", voltage: "11 kV", from: "MV1", prot: "LBS" },
    { id: "W2", type: "Feeder", from: "RMU1" },
    { id: "MCC1", type: "MCC", voltage: "400 V", from: "BB1", prot: "CB" },
  ]);
  const P = (type, targetId) => { const r = propose(ways, { type, targetId }); return [r.prot, r.voltage]; };
  assert.deepEqual(P("Transformer", "W1"), ["CB", "11/0.4 kV"]);            /* the ratio the sheet uses, off the MV board's way */
  assert.deepEqual(P("Transformer", "W2"), ["Fuse-switch", "11/0.4 kV"]);   /* an RMU's tee-off */
  assert.deepEqual(P("Transformer", "F1"), ["CB", ""]);                      /* LV/LV: the ratio stays the surveyor's */
  assert.deepEqual(P("MCC", "F1"), ["CB", "400 V"]);
  /* a motor keeps its starter: fused on MV gear, a contactor on an LV way */
  assert.deepEqual(P("Pump", "W1"), ["Fused contactor", "11 kV"]);
  assert.deepEqual(P("Pump", "F1"), ["Contactor", "400 V"]);
  /* the motor ways of an MCC are fused contactors, as every field sheet wrote them */
  assert.deepEqual(P("Pump", "MCC1"), ["Fused contactor", "400 V"]);
  assert.equal(propose(ways, { type: "Pump" }).from, "MCC1");               /* and a palette click lands there first */
});

test("an RMU fed from two supplies gets a device per supply", () => {
  const r = propose(SHEET, { type: "RMU", targetId: "MV1, MV1" });
  assert.equal(r.prot, "LBS, LBS");
  assert.equal(propose(SHEET, { type: "RMU", targetId: "MV1" }).prot, "LBS");
});

test("with no target, the supply is the best one on the sheet for the type", () => {
  /* a feeder belongs on the LV board, a transformer on the MV gear — whatever the row above says */
  assert.equal(propose(SHEET, { type: "Feeder", sibling: { from: "MVB1" } }).from, "BB1");
  assert.equal(propose(SHEET, { type: "Feeder" }).voltage, "400 V");
  assert.equal(propose(SHEET, { type: "Transformer", sibling: { from: "BB1" } }).from, "MVB1");
  assert.equal(propose(SHEET, { type: "MCC" }).from, "BB1");
  assert.ok(propose(SHEET, { type: "Feeder" }).proposed.includes("from"));
  /* a root is proposed without a supply, and so is anything on an empty sheet */
  assert.deepEqual([propose(SHEET, { type: "MV Incomer" }).from, propose(SHEET, { type: "Generator" }).from], ["", ""]);
  const bare = propose([], { type: "Feeder" });
  assert.deepEqual([bare.from, bare.voltage], ["", ""]);
  assert.ok(!bare.proposed.includes("from"));
});

test("nothing is proposed for a row with no type yet, except the sibling's supply", () => {
  const r = propose(SHEET, { sibling: { from: "BB1" } });
  assert.deepEqual([r.id, r.type, r.prot, r.voltage], ["", "", "", ""]);
  assert.deepEqual(r.proposed, ["from"]);
  /* with no type to reason from and no row above, nothing at all */
  assert.deepEqual(propose(SHEET, {}).proposed, []);
});

test("a source is added with no supply, whatever it was dropped on", () => {
  /* a generator is fed from off the sheet; what it feeds is named in that
     item's own Feeds From, so nothing is written here (constitution §1) */
  for (const type of ["Generator", "Battery", "Inverter", "MV Incomer"]) {
    for (const opts of [{ targetId: "BB1" }, { targetId: "MVB1" }, {}, { sibling: { from: "BB1" } }]) {
      const r = propose(SHEET, { type, ...opts });
      assert.equal(r.from, "", `${type} ${JSON.stringify(opts)}`);
      assert.ok(!r.proposed.includes("from"), `${type} ${JSON.stringify(opts)}: from marked`);
      assert.equal(r.prot, "", `${type}: a source has no supply-side device`);
    }
  }
  /* the rest of the row still follows the item it was dropped on: the board a
     generator will feed decides its voltage, though it is not its supply */
  assert.deepEqual(propose(SHEET, { type: "Generator", targetId: "BB1" }).voltage, "400 V");
  assert.deepEqual(propose(SHEET, { type: "Generator", targetId: "MVB1" }).voltage, "11 kV");
  assert.deepEqual(propose(SHEET, { type: "Generator" }).voltage, "");
  assert.match(propose(SHEET, { type: "Generator", targetId: "BB1" }).id, /^G\d+$/);
});

test("a generator with no Feeds From is never warned about", () => {
  const rows = [
    { id: "G1", type: "Generator", desc: "Standby set", rating: "500 kVA", voltage: "400 V", from: "" },
    { id: "BB1", type: "LV Busbar", desc: "Main board", voltage: "400 V", from: "G1", prot: "CB" },
    { id: "F1", type: "Feeder", desc: "Lighting", voltage: "400 V", from: "BB1", prot: "CB" },
  ];
  const out = draw({ site: "gen" }, rows, { view: normalizeView({}) });
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.warnings, [], "a source with an empty Feeds From must say nothing");
  assert.deepEqual(out.diagnostics.map(d => d.code), []);
});

test("an unreadable or absent supply voltage proposes nothing", () => {
  const odd = SHEET.map(r => r.id === "BB1" ? { ...r, voltage: "low" } : r);
  assert.equal(propose(odd, { type: "Feeder", targetId: "BB1" }).voltage, "");
  assert.equal(propose(SHEET, { type: "Feeder", targetId: "NOPE" }).voltage, "");
  assert.equal(proposeVoltage(...model(SHEET), "Feeder", null), "");
});
