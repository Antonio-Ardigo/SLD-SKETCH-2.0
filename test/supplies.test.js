/* The supply table: what can feed what, and in which order it is offered. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../src/core/model.js";
import { normalizeRows } from "../src/core/pipeline.js";
import { supplyRank, canSupply, supplyCandidates, defaultSupply, typeLabel, isRoot, USUAL_SUPPLIES } from "../src/core/supplies.js";
import { MV_INCOMER, RMU, MV_BUSBAR, TRANSFORMER, PUMP, GENERATOR, LV_BUSBAR,
         FEEDER, MCC, BUS_COUPLER, CAPACITOR, EARTHING, ARRESTER, TERMINALS, TYPE_LABELS } from "../src/core/types.js";

const SHEET = [
  { id: "MV1", type: "MV Incomer", desc: "Utility supply", voltage: "11 kV", from: "" },
  { id: "RMU1", type: "RMU", desc: "Ring main unit", voltage: "11 kV", from: "MV1", prot: "LBS" },
  { id: "TX1", type: "Transformer", desc: "Dyn11", voltage: "11/0.4 kV", from: "RMU1", prot: "Fuse-switch" },
  { id: "BB1", type: "LV Busbar", desc: "Main LV board", voltage: "400 V", from: "TX1", prot: "CB" },
  { id: "F1", type: "Feeder", desc: "Lighting", voltage: "400 V", from: "BB1", prot: "CB" },
];
const model = rows => { const { items, order } = buildModel(normalizeRows(rows)); return [items, order]; };
const ids = list => list.map(c => c.id);

test("rank 0 is exactly the reader's impossible supply", () => {
  const ALL = [MV_INCOMER, RMU, MV_BUSBAR, TRANSFORMER, PUMP, GENERATOR, LV_BUSBAR, FEEDER, MCC, BUS_COUPLER].concat(TERMINALS);
  /* the predicate model.js used to spell out inline */
  const impossible = (pt, ct) =>
    [PUMP, BUS_COUPLER].concat(TERMINALS).includes(pt)
    || (pt === FEEDER && ![LV_BUSBAR, MCC].includes(ct))
    || (pt === MV_INCOMER && [PUMP, FEEDER, MCC, LV_BUSBAR].concat(TERMINALS).includes(ct));
  for (const pt of ALL) for (const ct of ALL) {
    assert.equal(supplyRank(pt, ct) === 0, impossible(pt, ct), `${pt} → ${ct}`);
    assert.equal(canSupply(pt, ct), !impossible(pt, ct), `${pt} → ${ct}`);
  }
  assert.equal(supplyRank("", LV_BUSBAR), 0);
  assert.equal(supplyRank(LV_BUSBAR, ""), 0);
});

test("rank 2 is the usual arrangement, rank 1 what merely draws", () => {
  assert.equal(supplyRank(TRANSFORMER, LV_BUSBAR), 2);
  assert.equal(supplyRank(MV_BUSBAR, TRANSFORMER), 2);
  assert.equal(supplyRank(LV_BUSBAR, MCC), 2);
  assert.equal(supplyRank(MCC, PUMP), 2);
  assert.equal(supplyRank(TRANSFORMER, GENERATOR), 2);      /* a generator through its step-up */
  assert.equal(supplyRank(RMU, MCC), 1);                    /* MCC_ON_MV: drawn, and warned about */
  assert.equal(supplyRank(FEEDER, MCC), 1);                 /* MCC_BAD_SUPPLY */
  assert.equal(supplyRank(TRANSFORMER, FEEDER), 1);         /* put the board in between */
  assert.deepEqual(USUAL_SUPPLIES[MV_INCOMER], []);         /* an incomer is a root */
});

test("every canonical type has a row in the table and a label", () => {
  for (const [label, type] of TYPE_LABELS) {
    assert.ok(USUAL_SUPPLIES[type], `${label} (${type}) has no usual supplies`);
    assert.equal(typeof typeLabel(type), "string");
    assert.ok(typeLabel(type).length);
  }
  assert.equal(typeLabel(LV_BUSBAR), "LV Busbar");
  assert.equal(typeLabel(EARTHING), "Earthing/NER");
});

test("candidates are the usual supplies first, then the possible, then the impossible", () => {
  const [items, order] = model(SHEET);
  assert.deepEqual(ids(supplyCandidates(items, order, FEEDER)), ["BB1", "RMU1", "TX1", "F1", "MV1"]);
  assert.deepEqual(supplyCandidates(items, order, FEEDER).map(c => c.rank), [2, 2, 1, 0, 0]);
  /* the table's own order decides between two usual supplies: MV gear before an LV board for a transformer */
  assert.deepEqual(ids(supplyCandidates(items, order, TRANSFORMER)), ["RMU1", "BB1", "MV1", "TX1", "F1"]);
  /* nothing is hidden: every ID on the sheet is offered */
  assert.equal(supplyCandidates(items, order, FEEDER).length, order.length);
  assert.deepEqual(ids(supplyCandidates(items, order, FEEDER, { exclude: ["F1"] })), ["BB1", "RMU1", "TX1", "MV1"]);
});

test("between supplies of one type the bottom-most row wins", () => {
  const twin = SHEET.concat([
    { id: "TX2", type: "Transformer", voltage: "11/0.4 kV", from: "RMU1", prot: "CB" },
    { id: "BB2", type: "LV Busbar", desc: "Second LV board", voltage: "400 V", from: "TX2", prot: "CB" },
  ]);
  const [items, order] = model(twin);
  assert.equal(ids(supplyCandidates(items, order, FEEDER))[0], "BB2");
  assert.equal(defaultSupply(items, order, FEEDER), "BB2");
});

test("sameKindAs promotes the far end of a coupler or a ring, within its rank", () => {
  const twin = SHEET.concat([
    { id: "BB2", type: "LV Busbar", desc: "Second LV board", voltage: "400 V", from: "TX1", prot: "CB" },
    { id: "MVB1", type: "MV Busbar", desc: "MV board A", voltage: "11 kV", from: "MV1", prot: "CB" },
    { id: "MVB2", type: "MV Busbar", desc: "MV board B", voltage: "11 kV", from: "MV1", prot: "CB" },
  ]);
  const [items, order] = model(twin);
  /* an LV board is a coupler's first choice, so without the hint it leads */
  assert.equal(ids(supplyCandidates(items, order, BUS_COUPLER, { exclude: ["MVB1"] }))[0], "BB2");
  /* coupling an MV board: the other MV board comes first */
  const kin = supplyCandidates(items, order, BUS_COUPLER, { exclude: ["MVB1"], sameKindAs: MV_BUSBAR });
  assert.equal(ids(kin)[0], "MVB2");
  /* the hint never lifts a lesser rank above a better one */
  assert.deepEqual(kin.map(c => c.rank), [...kin.map(c => c.rank)].sort((a, b) => b - a));
});

test("the default is the best candidate that can feed the row", () => {
  const [items, order] = model(SHEET);
  for (const type of [FEEDER, TRANSFORMER, LV_BUSBAR, MCC, PUMP, MV_BUSBAR, RMU, BUS_COUPLER, CAPACITOR, ARRESTER]) {
    const list = supplyCandidates(items, order, type);
    assert.equal(defaultSupply(items, order, type), (list.find(c => c.rank > 0) || { id: "" }).id, type);
  }
  assert.equal(defaultSupply(items, order, FEEDER), "BB1");
  assert.equal(defaultSupply(items, order, TRANSFORMER), "RMU1");
  /* a root's supply is off the sheet, and an empty sheet supplies nothing */
  assert.ok(isRoot(MV_INCOMER) && isRoot(GENERATOR));
  assert.equal(defaultSupply(items, order, MV_INCOMER), "");
  assert.equal(defaultSupply(items, order, GENERATOR), "");
  assert.equal(defaultSupply(...model([]), FEEDER), "");
  /* nothing on the sheet can feed a feeder: no default rather than a wrong one */
  assert.equal(defaultSupply(...model([{ id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" }]), FEEDER), "");
});

test("a candidate says what it is, and where it is unusual", () => {
  const [items, order] = model(SHEET);
  const by = id => supplyCandidates(items, order, FEEDER).find(c => c.id === id);
  assert.equal(by("BB1").label, "LV Busbar · Main LV board");
  assert.equal(by("TX1").label, "Transformer · Dyn11 — unusual for a Feeder");
  assert.equal(by("MV1").label, "MV Incomer · Utility supply — cannot feed a Feeder");
});
