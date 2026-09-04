/* An error in the table never withholds the drawing (constitution §6): the row
 * it names floats or is dropped, the message says why, and an unknown supply
 * carries the ID it most likely meant. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { listCases, loadCase, drawCase } from "../tools/lib/cases.mjs";
import { draw, normalizeRows } from "../src/core/pipeline.js";
import { buildModel, nearestId, editDistance } from "../src/core/model.js";
import { protFor } from "../src/core/types.js";
import { graphSignature } from "../src/core/graph.js";
import { diagKey } from "../src/core/diagnostics.js";
import { expectedEdges } from "../src/core/check.js";
import { checkScene } from "../src/core/check.js";

const BASE = [
  { id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" },
  { id: "TX1", type: "Transformer", voltage: "11/0.4 kV", from: "MV1" },
  { id: "BB1", type: "LV Busbar", voltage: "400 V", from: "TX1", prot: "CB" },
  { id: "MCC1", type: "MCC", voltage: "400 V", from: "BB1", prot: "CB" },
];
const withRows = extra => BASE.concat(extra);

test("the nearest ID: another case or spacing first, then within two edits, else nothing", () => {
  const ids = ["MV1", "TX1", "BB1", "MCC1", "F12"];
  assert.equal(nearestId("bb1", ids), "BB1");
  assert.equal(nearestId("MCC 1", ids), "MCC1");
  assert.equal(nearestId("BB!", ids), "BB1");           /* one slip */
  assert.equal(nearestId("BB", ids), "BB1");            /* one dropped */
  assert.equal(nearestId("BB11", ids), "BB1");          /* one doubled */
  assert.equal(nearestId("F1", ids), "F12");
  assert.equal(nearestId("ZZZ", ids), null);
  assert.equal(nearestId("", ids), null);
  assert.equal(nearestId("BB1", []), null);
  assert.equal(editDistance("kitten", "sitting"), 3);
  assert.equal(editDistance("abc", "abc"), 0);
  assert.equal(editDistance("a", "abcd"), 3);           /* capped: more than two apart */
});

test("an unknown supply is an error that still draws, and says what it meant", () => {
  const out = draw({ site: "t" }, withRows([
    { id: "F1", type: "Feeder", from: "bb1" },
    { id: "F2", type: "Feeder", from: "BB!" },
    { id: "F3", type: "Feeder", from: "ZZZ" },
    { id: "F4", type: "Feeder", from: "BB1" },
  ]), { check: true });
  assert.ok(out.svg, "the sheet draws");
  assert.equal(out.errors.length, 3);
  const unknown = out.diagnostics.filter(d => d.code === "UNKNOWN_SUPPLY");
  assert.deepEqual(unknown.map(d => d.ids[0]), ["F1", "F2", "F3"]);
  assert.deepEqual(unknown[0].fix, { id: "F1", field: "from", from: "bb1", to: "BB1" });
  assert.deepEqual(unknown[1].fix, { id: "F2", field: "from", from: "BB!", to: "BB1" });
  assert.equal(unknown[2].fix, undefined, "nothing near ZZZ: no suggestion");
  /* every row is on the sheet, the good edge is drawn, the bad ones are not expected */
  for (const id of ["F1", "F2", "F3", "F4"]) assert.ok(out.svg.includes(`data-id="${id}"`), `${id} drawn`);
  assert.equal(out.check.items.missing.length, 0);
  assert.equal(out.check.edges.disconnected.length, 0);
  assert.equal(out.check.edges.connected, out.check.edges.total);
  /* the unknown reference is not a "no Feeds From": one message per fault */
  assert.ok(!out.diagnostics.some(d => d.code === "NO_SUPPLY"));
  /* exports come out too */
  const both = draw({ site: "t" }, withRows([{ id: "F1", type: "Feeder", from: "bb1" }]), { dxf: true, pdf: true });
  assert.ok(both.dxf && both.pdf);
});

test("what was written stays written: supplies is the cell, parents what resolved", () => {
  const { items, order } = buildModel(normalizeRows(withRows([
    { id: "RMU9", type: "RMU", prot: "LBS, CB", from: "NOPE, MV1" },
  ])));
  const r = items.RMU9;
  assert.deepEqual(r.supplies, ["NOPE", "MV1"]);
  assert.deepEqual(r.parents, ["MV1"]);
  /* the device written against the second supply still belongs to it */
  assert.equal(protFor(r, "MV1")[0], "CB");
  /* the graph carries only edges to rows that exist */
  const out = draw({ site: "t" }, withRows([{ id: "RMU9", type: "RMU", prot: "LBS, CB", from: "NOPE, MV1" }]), { dxf: true });
  assert.deepEqual(graphSignature(out.graph).edges.filter(e => e.endsWith("->RMU9#0")), ["MV1->RMU9#0"]);
  /* and the equipment table in the export prints the cell as the surveyor wrote it */
  assert.ok(out.dxf.includes("NOPE, MV1"), "the DXF's table keeps the written Feeds From");
  /* a clean sheet: supplies and parents are the same list */
  for (const id of order) if (id !== "RMU9") assert.deepEqual(items[id].supplies, items[id].parents);
});

test("a duplicate ID drops the second row, names it, and the sheet still draws", () => {
  const out = draw({ site: "t" }, withRows([
    { id: "F1", type: "Feeder", from: "BB1" },
    { id: "F1", type: "Feeder", from: "MCC1" },
  ]), { check: true });
  assert.ok(out.svg);
  assert.deepEqual(out.diagnostics.filter(d => d.level === "error").map(d => [d.code, d.row]), [["DUP_ID", 6]]);
  assert.equal(out.order.filter(id => id === "F1").length, 1);
  assert.equal(out.items.F1.parents[0], "BB1", "the first row wins");
  assert.equal(out.check.items.missing.length, 0);
});

test("every case draws, errors or not, and its checker still runs", () => {
  let withErrors = 0;
  for (const dir of listCases()) {
    const c = loadCase(dir);
    const out = drawCase(c, { check: true });
    if (!out.order.length) continue;
    assert.ok(out.svg, `${c.data.group}/${c.data.name}: no drawing`);
    if (out.errors.length) {
      withErrors++;
      assert.ok(out.check, `${c.data.name}: no check`);
      assert.equal(out.check.items.missing.length, 0, `${c.data.name}: a row went missing from the drawing`);
    }
  }
  assert.ok(withErrors >= 3, "the error cases are in the pool");
});

/* Couplers: what a coupler is gets decided once, and a coupler that cannot be
 * drawn as a tie is drawn from the end it has rather than dropped. */
test("a coupler that is not a tie still reaches the sheet, and says what it is", () => {
  const bars = [
    { id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" },
    { id: "MVB", type: "MV Busbar", voltage: "11 kV", from: "MV1" },
    { id: "TX1", type: "Transformer", voltage: "11/0.4 kV", from: "MVB" },
    { id: "TX2", type: "Transformer", voltage: "11/0.4 kV", from: "MVB" },
    { id: "BB1", type: "LV Busbar", voltage: "400 V", from: "TX1", prot: "CB" },
    { id: "BB2", type: "LV Busbar", voltage: "400 V", from: "TX2", prot: "CB" },
  ];
  const one = (from, extra = []) => draw({ site: "t" }, bars.concat(extra, [{ id: "BC1", type: "Bus Coupler", prot: "CB", from }]), { check: true });
  for (const [from, reason, code] of [
    ["BB1", "one-end", "COUPLER_INVALID"],
    ["BB1, TX2", "not-two-busbars", "COUPLER_INVALID"],
    ["BB1, MVB", "mixed-kinds", "COUPLER_INVALID"],
    ["BB1, BB2, TX1", "extra-supply", "COUPLER_EXTRA_SUPPLY"],
  ]) {
    const out = one(from);
    assert.equal(out.facts.couplers[0].reason, reason, from);
    assert.ok(out.svg.includes(`data-id="BC1"`), `${from}: drawn`);
    assert.deepEqual(out.check.items.missing, [], `${from}: the checker sees it`);
    assert.deepEqual(out.diagnostics.map(d => d.code), [code], from);
    assert.ok(!/skipped/.test(out.diagnostics[0].message), `${from}: the message must not say it was skipped`);
  }
  /* the extra supply is named: it used to be dropped in silence */
  assert.match(one("BB1, BB2, TX1").diagnostics[0].message, /"TX1" is also named but is not drawn/);
});

test("a valid tie and a valid changeover draw, and only the duplicate is called one", () => {
  const rows = [
    { id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" },
    { id: "TX1", type: "Transformer", voltage: "11/0.4 kV", from: "MV1" },
    { id: "TX2", type: "Transformer", voltage: "11/0.4 kV", from: "MV1" },
    { id: "BB1", type: "LV Busbar", voltage: "400 V", from: "TX1", prot: "CB" },
    { id: "BB2", type: "LV Busbar", voltage: "400 V", from: "TX2", prot: "CB" },
    { id: "G1", type: "Generator", rating: "500 kVA", voltage: "400 V", from: "" },
    { id: "BC1", type: "Bus Coupler", prot: "CB", from: "BB1, BB2" },
    { id: "BC2", type: "Bus Coupler", prot: "CB", from: "BB2, BB1" },
    { id: "CO", type: "Bus Coupler", prot: "CB", from: "BB1, G1" },
  ];
  const out = draw({ site: "t" }, rows, { check: true });
  assert.deepEqual(out.diagnostics.map(diagKey), ["COUPLER_DUP:BC2"], "only the second tie is a duplicate");
  assert.match(out.diagnostics[0].message, /duplicates "BC1"/, "and it names the first, not itself");
  /* the changeover is a row like any other: it has a group of its own */
  for (const id of ["BC1", "BC2", "CO"]) assert.ok(out.svg.includes(`data-id="${id}"`), `${id} drawn`);
  assert.deepEqual(out.check.items.missing, []);
});

test("the rule, the drawing and the checker agree about every coupler", () => {
  for (const dir of listCases()) {
    const c = loadCase(dir);
    const out = drawCase(c, { check: true });
    if (!out.svg) continue;
    for (const k of out.facts.couplers) {
      /* whatever the judgement, the row is on the sheet (constitution §6) */
      assert.ok(out.svg.includes(`data-id="${k.id}"`), `${c.data.name}: ${k.id} (${k.reason}) is not drawn`);
      /* and the checker expects a conductor only where the judgement found two ends */
      const edges = expectedEdges(out.items, out.order).filter(e => e[2] === k.id);
      assert.equal(edges.length, k.a && k.b ? 1 : 0, `${c.data.name}: ${k.id} edge disagrees with the fact`);
    }
  }
});
