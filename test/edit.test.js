/* Edits that keep the table's meaning: a rename moves every reference with it
 * and the graph is the same graph under the new name (constitution §3). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { renameReferences, canFollowRename } from "../src/core/edit.js";
import { buildModel } from "../src/core/model.js";
import { normalizeRows } from "../src/core/pipeline.js";
import { buildGraph, graphSignature } from "../src/core/graph.js";

const sheet = () => [
  { id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" },
  { id: "TX1", type: "Transformer", voltage: "11/0.4 kV", from: "MV1" },
  { id: "TX2", type: "Transformer", voltage: "11/0.4 kV", from: "MV1" },
  { id: "BB1", type: "LV Busbar", voltage: "400 V", from: "TX1", prot: "CB" },
  { id: "BB2", type: "LV Busbar", voltage: "400 V", from: "TX2", prot: "CB" },
  { id: "BC1", type: "Bus Coupler", from: "BB1,BB2", prot: "CB, CB" },
  { id: "F1", type: "Feeder", from: "BB1" },
  { id: "F2", type: "Feeder", from: " BB1 " },
  { id: "F3", type: "Feeder", from: "BB2" },
  { id: "BB10", type: "LV Busbar", from: "TX1" },      /* starts with the same letters: must not be touched */
];

test("every Feeds From token equal to the old ID becomes the new one, and only those", () => {
  const rows = sheet();
  const n = renameReferences(rows, "BB1", "MSB");
  assert.equal(n, 3, "BC1, F1 and F2 name BB1");
  assert.equal(rows.find(r => r.id === "BC1").from, "MSB, BB2");
  assert.equal(rows.find(r => r.id === "F1").from, "MSB");
  assert.equal(rows.find(r => r.id === "F2").from, "MSB");
  assert.equal(rows.find(r => r.id === "F3").from, "BB2", "another board is not touched");
  assert.equal(rows.find(r => r.id === "BB10").from, "TX1", "a longer ID that starts the same is not touched");
  assert.equal(rows.find(r => r.id === "BB1").id, "BB1", "the ID cell itself is the page's business");
});

test("the graph is the same graph under the new name", () => {
  const before = sheet();
  const a = buildModel(normalizeRows(before));
  const after = sheet();
  after.find(r => r.id === "BB1").id = "MSB";
  renameReferences(after, "BB1", "MSB");
  const b = buildModel(normalizeRows(after));
  assert.deepEqual(b.errors, [], "no dangling reference after the rename");
  const map = s => s.replace(/\bMSB\b/g, "BB1");
  const sa = graphSignature(buildGraph(a.items, a.order)), sb = graphSignature(buildGraph(b.items, b.order));
  assert.deepEqual(sb.nodes.map(map), sa.nodes);
  assert.deepEqual(sb.edges.map(map), sa.edges);
});

test("no-ops: an empty name, the same name, a name nothing references", () => {
  const rows = sheet();
  assert.equal(renameReferences(rows, "", "X"), 0);
  assert.equal(renameReferences(rows, "BB1", ""), 0);
  assert.equal(renameReferences(rows, "BB1", "BB1"), 0);
  assert.equal(renameReferences(rows, "NOPE", "X"), 0);
  assert.deepEqual(rows, sheet());
});

test("a rename onto an ID another row already has does not follow", () => {
  const rows = sheet();
  const i = rows.findIndex(r => r.id === "F1");
  assert.equal(canFollowRename(rows, i, "F2"), false, "F2 exists");
  assert.equal(canFollowRename(rows, i, "F1"), true, "its own name is fine");
  assert.equal(canFollowRename(rows, i, "F9"), true);
  assert.equal(canFollowRename(rows, i, "  F9 "), true);
  assert.equal(canFollowRename(rows, i, ""), false);
});

test("a reference follows a rename however it was spelled", () => {
  const rows = sheet();
  rows.push({ id: "F9", type: "Feeder", from: "bb1" });      /* the same board, quietly */
  rows.push({ id: "F10", type: "Feeder", from: "BB 1" });    /* and with a stray space */
  const n = renameReferences(rows, "BB1", "MSB");
  assert.equal(n, 5, "BC1, F1, F2, F9 and F10 all name BB1");
  assert.equal(rows.find(r => r.id === "F9").from, "MSB");
  assert.equal(rows.find(r => r.id === "F10").from, "MSB");
  assert.equal(rows.find(r => r.id === "BB10").from, "TX1", "a longer ID that starts the same is still not touched");
});

test("a rename onto an ID another row already carries in any case does not follow", () => {
  const rows = sheet();
  const i = rows.findIndex(r => r.id === "F1");
  assert.equal(canFollowRename(rows, i, "f2"), false, "F2 exists, however it is spelled");
  assert.equal(canFollowRename(rows, i, "B B 1"), false, "so does BB1");
  assert.equal(canFollowRename(rows, i, "f1"), true, "its own name is fine");
  assert.equal(canFollowRename(rows, i, "F9"), true);
});
