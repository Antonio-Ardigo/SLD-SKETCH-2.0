/* Constitution §3: the graph is a pure function of (ID, Feeds From).
 * Scramble every other column of every case and the graph must not move. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { listCases, loadCase } from "../tools/lib/cases.mjs";
import { buildModel } from "../src/core/model.js";
import { buildGraph, graphSignature } from "../src/core/graph.js";
import { normalizeRows } from "../src/core/pipeline.js";
import { TYPE_LABELS } from "../src/core/types.js";

function graphOf(rows) {
  const { items, order } = buildModel(normalizeRows(rows));
  return graphSignature(buildGraph(items, order));
}

/* deterministic pseudo-random, so a failure reproduces */
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

test("graph depends on ID and Feeds From only", () => {
  const types = TYPE_LABELS.map(([lbl]) => lbl);
  for (const dir of listCases()) {
    const c = loadCase(dir);
    const rand = rng(c.data.name.length * 7919);
    const scrambled = c.rows.map(r => ({
      id: r.id, from: r.from,
      type: types[Math.floor(rand() * types.length)],
      desc: "desc " + Math.floor(rand() * 1e6), rating: Math.floor(rand() * 5000) + " A",
      voltage: rand() < 0.5 ? "11 kV" : "400 V", prot: ["", "CB", "LBS", "Fuse", "87B"][Math.floor(rand() * 5)],
      notes: ["", "Normally open", "spare", "VSD drive", "capacitor bank"][Math.floor(rand() * 5)],
    }));
    assert.deepEqual(graphOf(scrambled), graphOf(c.rows), `${c.data.group}/${c.data.name}: graph changed when non-topology columns changed`);
  }
});

test("graph edges follow Feeds From order and direction", () => {
  const rows = [
    { id: "A", type: "MV Incomer", from: "" }, { id: "B", type: "MV Incomer", from: "" },
    { id: "X", type: "LV Busbar", from: "B, A", prot: "LBS, CB" },
  ];
  const { items, order } = buildModel(normalizeRows(rows));
  const g = buildGraph(items, order);
  assert.deepEqual(g.edges.map(e => e.id), ["B->X", "A->X"]);
  assert.deepEqual(g.edges.map(e => e.prot[1]), ["lbs", "cb"]);
  assert.equal(g.primaryParent.get("X"), "B");
  assert.deepEqual(g.roots, ["A", "B"]);
  assert.deepEqual(g.out.get("A").map(e => e.to), ["X"]);
});
