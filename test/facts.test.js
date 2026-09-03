/* The rank solver agrees with today's tier arithmetic on every case, and the
 * solver itself handles the awkward inputs. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { listCases, loadCase } from "../tools/lib/cases.mjs";
import { buildModel } from "../src/core/model.js";
import { buildGraph } from "../src/core/graph.js";
import { buildFacts, legacyRank } from "../src/core/facts.js";
import { normalizeRows } from "../src/core/pipeline.js";
import { solveRanks } from "../src/core/rank.js";

test("solver ranks agree with the legacy tiers on every case", () => {
  const diffs = [];
  for (const dir of listCases()) {
    const c = loadCase(dir);
    const { items, order, errors } = buildModel(normalizeRows(c.rows));
    if (errors.length || !order.length) continue;
    const facts = buildFacts(items, order, buildGraph(items, order));
    const legacy = legacyRank(items, order);
    const lmin = Math.min(0, ...Object.values(legacy));
    for (const k of Object.keys(legacy)) legacy[k] -= lmin;
    /* floating rows: legacy puts them wherever its cycle guard lands, the solver on the LV row */
    const bad = Object.keys(legacy).filter(k => facts.rank[k] !== legacy[k] && !facts.floating.includes(k));
    const extra = Object.keys(facts.rank).filter(k => !(k in legacy));
    if (bad.length || extra.length)
      diffs.push(`${c.data.group}/${c.data.name}: ` + bad.map(k => `${k} legacy ${legacy[k]} solver ${facts.rank[k]}`).concat(extra.map(k => `${k} only in solver (${facts.rank[k]})`)).join(", "));
    /* a constraint is dropped only round a loop no supply reaches (both ends float) */
    for (const d of facts.dropped)
      assert.ok(facts.floating.includes(d.a) && facts.floating.includes(d.b), `${c.data.name}: dropped ${JSON.stringify(d)} outside a floating loop`);
  }
  assert.deepEqual(diffs, [], "rank differences:\n" + diffs.join("\n"));
});

test("solveRanks: longest path, same-groups, cycle dropped", () => {
  const { rank, dropped } = solveRanks(["A", "B", "C", "D", "E"], [
    { kind: "below", a: "B", b: "A", gap: 1 },
    { kind: "below", a: "C", b: "B", gap: 1 },
    { kind: "below", a: "C", b: "A", gap: 1 },     /* the longer path wins */
    { kind: "same", a: "D", b: "B" },
    { kind: "below", a: "E", b: "D", gap: 2 },
  ]);
  assert.deepEqual(Object.fromEntries(rank), { A: 0, B: 1, C: 2, D: 1, E: 3 });
  assert.equal(dropped.length, 0);

  const cyc = solveRanks(["X", "Y"], [
    { kind: "below", a: "Y", b: "X", gap: 1 },
    { kind: "below", a: "X", b: "Y", gap: 1 },
  ]);
  assert.equal(cyc.dropped.length, 1);
  assert.deepEqual([...cyc.rank.values()].sort(), [0, 1]);
});
