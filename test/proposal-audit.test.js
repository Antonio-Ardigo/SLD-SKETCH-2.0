/* The proposal audit measures what a surveyor has to correct after a drop.
 * Its ground truth is the pool, so the first thing pinned is what counts as
 * the pool — and the second is that the generated sites are what the report
 * says they are: deterministic, scored, and rejected when a row is absurd. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPool, fieldCases, FIELD_GROUPS, EXCLUDED, slice, share, seen, protCanon } from "../tools/lib/pool.mjs";
import { listCases, loadCase } from "../tools/lib/cases.mjs";
import { generate, mulberry32, score, CHECKS, ARCHETYPE_LIST, networkOrder, surveyOrder } from "../tools/lib/configs.mjs";
import { replay, provenance, classKey } from "../tools/proposal-audit.mjs";
import { loadQuick } from "../tools/lib/quick.mjs";

const pool = loadPool();

test("the pool is the field-like fixtures only, one merged sheet left out", () => {
  const rels = fieldCases().map(c => c.rel);
  assert.ok(rels.every(r => FIELD_GROUPS.includes(r.split("/")[0])), rels.join(","));
  for (const x of EXCLUDED) assert.ok(!rels.includes(x), `${x} counts one tester twice`);
  for (const g of ["features", "warnings", "topics", "levels", "views"])
    assert.ok(!rels.some(r => r.startsWith(g + "/")), `${g}/ is engine-author opinion, not evidence`);
  assert.ok(rels.length >= 20, `${rels.length} fixtures`);
});

test("a blank cell is missing data: it never becomes a value in any slice", () => {
  for (const [k, vals] of Object.entries(pool.slices))
    assert.ok(!("" in vals), `${k} counts a blank`);
});

test("frequencies are weighted per fixture, so a long sheet does not outvote the rest", () => {
  /* the total weight of one fixture's rows is 1: a 95-row sheet and a 12-row
     sheet each put one vote into the pool */
  const c = loadCase(listCases("sites/c1_wtw")[0]);
  const n = c.rows.filter(r => r.id.trim()).length;
  assert.ok(n > 20);
  const w = 1 / n;
  const perRow = Object.values(pool.slices).flatMap(v => Object.values(v)).filter(x => Math.abs(x - w) < 1e-9);
  assert.ok(perRow.length > 0, "c1_wtw's single-row values weigh 1/rows each");
});

test("protection compares through the reader's aliases", () => {
  assert.equal(protCanon("Fused contactor"), "fuse-contactor");
  assert.equal(protCanon("MCCB"), "cb");
  assert.equal(protCanon("Thermal relay"), "Thermal relay", "an unknown word stays itself");
  assert.equal(protCanon(""), "");
});

test("the pool says what the two known hints say", () => {
  const sup = pool.supplies["pump"];
  assert.ok(sup["mcc"] > sup["lv busbar"] * 3, JSON.stringify(sup));
  assert.ok(share(pool, "transformer", "rmu", "prot", "Fuse-switch").share > 0.9);
  assert.ok(share(pool, "transformer", "mv busbar", "prot", "CB").share > 0.9);
  assert.ok(seen(pool, "feeder", "prot", "CB") > 100);
  assert.deepEqual(Object.keys(slice(pool, "mv incomer", "(root)", "rating")), [], "an incomer is never rated");
});

test("the generator is deterministic and every site has more than fifteen rows", () => {
  const a = generate(7, 12, pool), b = generate(7, 12, pool);
  assert.deepEqual(a, b);
  for (const c of a) {
    assert.ok(c.rows.length >= 16, `${c.id}: ${c.rows.length} rows`);
    assert.ok(c.rows.length <= 30, `${c.id}: ${c.rows.length} rows`);
    assert.equal(new Set(c.rows.map(r => r.id)).size, c.rows.length, `${c.id}: duplicate IDs`);
    assert.deepEqual([...c.surveyOrder].sort((x, y) => x - y), c.rows.map((_, i) => i), "survey order is a permutation");
  }
  assert.notDeepEqual(generate(8, 3, pool), generate(7, 3, pool));
});

test("mulberry32 is a stable stream", () => {
  const r = mulberry32(1);
  assert.deepEqual([r(), r(), r()].map(x => +x.toFixed(6)), [0.627074, 0.002736, 0.527447]);
});

test("the consistency checks reject the rows written to be wrong and accept a real pump station", () => {
  const bad = loadCase(listCases("audit/w08_wrongloads")[0]).rows;
  const good = loadCase(listCases("sites/c3_pumps")[0]).rows;
  const sb = score(bad, pool), sg = score(good, pool);
  assert.equal(sb.C, 0, `w08 has a pump on an MV incomer and a feeder off a motor: ${JSON.stringify(sb.checks.filter(c => c.value < 1))}`);
  assert.ok(sg.C > 0.4, `c3_pumps: ${JSON.stringify(sg.checks.filter(c => c.value < 1))}`);
  assert.ok(sg.P > sb.P);
  assert.ok(CHECKS.every(c => typeof c.name === "string" && typeof c.penalty === "number"));
});

test("plausibility is a structured score and names its lowest factor", () => {
  for (const c of generate(3, 20, pool)) {
    const { A, C, V } = c.factors;
    for (const f of [A, C, V]) assert.ok(f >= 0 && f <= 1, JSON.stringify(c.factors));
    assert.ok(Math.abs(c.P - A * C * V) < 1e-9);
    assert.ok(["A", "C", "V"].includes(c.lowest.factor) || c.lowest.check, JSON.stringify(c.lowest));
    assert.equal(c.rejected, c.P === 0);
    for (const a of c.archetypes) assert.ok(ARCHETYPE_LIST.includes(a), a);
  }
});

/* ---------------------------------------------------------------- the classifier */
const site = rows => { const r = rows.map(x => ({ desc: "", rating: "", voltage: "", prot: "", notes: "", from: "", ...x })); return { id: "t", rows: r, networkOrder: networkOrder(r), surveyOrder: surveyOrder(r), P: 0.5, archetypes: [] }; };
const quick = loadQuick();
const twin = site([
  { id: "MV1", type: "MV Incomer", voltage: "11 kV" },
  { id: "MVB1", type: "MV Busbar", rating: "1250 A", voltage: "11 kV", prot: "CB", from: "MV1" },
  { id: "TX1", type: "Transformer", rating: "1000 kVA", voltage: "11/0.4 kV", prot: "CB", from: "MVB1" },
  { id: "TX2", type: "Transformer", rating: "1000 kVA", voltage: "11/0.4 kV", prot: "CB", from: "MVB1" },
  { id: "BB1", type: "LV Busbar", rating: "1600 A", voltage: "400 V", prot: "CB", from: "TX1" },
  { id: "BB2", type: "LV Busbar", rating: "1600 A", voltage: "400 V", prot: "CB", from: "TX2" },
  { id: "BC1", type: "Bus Coupler", voltage: "400 V", prot: "CB", from: "BB1, BB2", notes: "Normally open" },
  { id: "G1", type: "Generator", rating: "500 kVA", voltage: "400 V" },
  { id: "ATS", type: "Bus Coupler", voltage: "400 V", prot: "CB", from: "BB2, G1", notes: "ATS" },
  { id: "P1", type: "Pump", rating: "30 kW", voltage: "400 V", prot: "Fused contactor", from: "BB1" },
  { id: "F1", type: "Feeder", rating: "100 A", voltage: "400 V", prot: "CB", from: "BB1" },
]);
const drop = replay(twin, "networkOrder", "drop", pool, quick);
const of = (id, cls, field) => drop.filter(c => c.row === id && c.cls === cls && (!field || c.field === field));

test("network order puts a row after every supply it names", () => {
  const ids = twin.networkOrder.map(i => twin.rows[i].id);
  assert.ok(ids.indexOf("ATS") > ids.indexOf("BB2") && ids.indexOf("ATS") > ids.indexOf("G1"), ids.join(" "));
  assert.ok(ids.indexOf("BC1") > ids.indexOf("BB2"), ids.join(" "));
});

test("the first root's voltage is uninferable; in survey order a genset is dropped on the board its changeover ties to", () => {
  assert.equal(of("MV1", "UNINFERABLE", "voltage").length, 1, "nothing on the sheet names the first incomer");
  /* fixtures list every root first, so in network order the genset has no board to land on yet */
  assert.equal(of("G1", "UNINFERABLE").length, 1);
  /* a surveyor reaches the changeover, and adds the set then: survey order puts G1 just before ATS, after BB2 */
  const ids = twin.surveyOrder.map(i => twin.rows[i].id);
  assert.ok(ids.indexOf("G1") > ids.indexOf("BB2") && ids.indexOf("G1") === ids.indexOf("ATS") - 1, ids.join(" "));
  const survey = replay(twin, "surveyOrder", "drop", pool, quick);
  assert.equal(survey.filter(c => c.row === "G1" && ["UNINFERABLE", "VOLT_DEFAULT"].includes(c.cls)).length, 0, JSON.stringify(survey.filter(c => c.row === "G1")));
});

test("a second supply is a correction of its own, and a coupler's device is not", () => {
  assert.equal(of("BC1", "SECOND_SUPPLY").length, 1);
  assert.equal(of("ATS", "SECOND_SUPPLY").length, 1);
  assert.equal(of("BC1", "PROT_DEFAULT").length, 0, "CB was proposed and CB was wanted");
});

test("a spelling the reader already understands costs nothing", () => {
  /* P1 wanted "Fused contactor"; the engine proposes CB on a board — a real correction. Change the row and it becomes a spelling. */
  const s2 = site([...twin.rows.slice(0, 5), { id: "MCC1", type: "MCC", rating: "400 A", voltage: "400 V", prot: "CB", from: "BB1" },
    { id: "P9", type: "Pump", rating: "30 kW", voltage: "400 V", prot: "contactor", from: "MCC1" }]);
  const d2 = replay(s2, "networkOrder", "drop", pool, quick);
  const c = d2.filter(x => x.row === "P9" && x.field === "prot");
  assert.deepEqual(c.map(x => x.cls), ["SPELLING"], JSON.stringify(c));
  assert.equal(c[0].cost, 0);
});

test("a wrong proposal costs more than a blank one, and the class key is canonical", () => {
  const wrong = of("P1", "PROT_DEFAULT", "prot")[0];
  assert.ok(wrong, JSON.stringify(drop.filter(c => c.row === "P1")));
  assert.equal(wrong.kind, "wrong"); assert.equal(wrong.cost, 1.5);
  assert.equal(classKey(wrong), "PROT_DEFAULT|pump|lv busbar|prot|cb→fuse-contactor");
});

test("POOL needs three rows on two sheets; a thin slice is MIXED or OPINION", () => {
  assert.equal(provenance(pool, "feeder", "lv busbar", "prot", "CB", "").label, "POOL");
  const thin = provenance(pool, "surge arrester", "lv busbar", "prot", "CB", "");
  assert.notEqual(thin.label, "POOL", JSON.stringify(thin));
  assert.equal(provenance(pool, "pump", "mcc", "prot", "", "Contactor").label, "BLANK");
});

test("the rating is never proposed: its cost is the pick, and an unoffered value is flagged", () => {
  const fill = of("P1", "FILL", "rating")[0];
  assert.ok(fill && fill.cost >= 1);
  assert.equal(of("P1", "OFFER_MISS", "rating").length, 1, "30 kW is not in the motor list");
  assert.equal(of("F1", "OFFER_MISS", "rating").length, 0, "100 A is");
});
