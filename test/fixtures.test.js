/* Every testdata case draws exactly as its golden.svg, and its diagnostics
 * match what case.json expects.  Run:  node --test   */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { listCases, loadCase, drawCase } from "../tools/lib/cases.mjs";
import { diagKey, DIAG } from "../src/core/diagnostics.js";

const cases = listCases();
assert.ok(cases.length > 0, "no cases under testdata/");

/** The compact, fixture-friendly picture of the facts (what case.json asserts). */
export function factsView(F) {
  if (!F) return {};
  return {
    rings: F.rings.map(r => ({ members: r.members, closed: r.closed })),
    spurs: F.spurs,
    txDir: Object.fromEntries(Object.entries(F.txDir).map(([k, v]) => [k, v.class])),
    couplers: F.couplers.map(c => ({ id: c.id, kind: c.kind, valid: c.valid, ...(c.duplicate ? { duplicate: true } : {}) })),
    floating: F.floating,
    sources: F.sources,
    subBoards: Object.fromEntries(Object.entries(F.subBoards).map(([k, v]) => [k, v.via])),
    waysOfBoard: F.waysOfBoard,
  };
}

for (const dir of cases) {
  const c = loadCase(dir);
  const label = `${c.data.group}/${c.data.name}`;

  test(label, () => {
    const out = drawCase(c);
    const exp = c.data.expect || {};

    /* every diagnostic has a catalogued code and, unless it is about the whole sheet, names a row */
    for (const d of out.diagnostics) {
      assert.ok(DIAG[d.code], `unknown diagnostic code ${d.code}`);
      assert.ok(d.ids.length || d.row !== undefined || d.code === "EMPTY_SHEET", `diagnostic names no row: ${d.message}`);
    }
    assert.equal(out.diagnostics.filter(d => d.level === "error").length, out.errors.length, "errors ↔ diagnostics");

    if (exp.diagnostics) {
      assert.deepEqual(out.diagnostics.map(diagKey).sort(), exp.diagnostics.slice().sort(),
        `diagnostics\n  ${out.diagnostics.map(d => d.message).join("\n  ")}`);
    }
    if (exp.ranks) assert.deepEqual(out.facts && out.facts.rank, exp.ranks, "ranks");
    if (exp.facts) {
      const view = factsView(out.facts);
      for (const key of Object.keys(exp.facts)) assert.deepEqual(view[key], exp.facts[key], `facts.${key}`);
    }
    if (exp.legacy) {
      assert.equal(out.order.length, exp.legacy.items, "items parsed");
      assert.equal(out.errors.length, exp.legacy.errors, `errors: ${out.errors.join(" | ")}`);
      assert.equal(out.warnings.length, exp.legacy.warnings, `warnings: ${out.warnings.join(" | ")}`);
    }

    const goldenFile = path.join(dir, "golden.svg");
    if (exp.golden === false) {
      assert.equal(out.svg, null, "case is expected not to draw");
      return;
    }
    if (exp.golden) {
      assert.ok(out.svg, `no drawing produced (errors: ${out.errors.join(" | ")})`);
      assert.ok(fs.existsSync(goldenFile), `missing ${path.relative(process.cwd(), goldenFile)} — run UPDATE_GOLDEN=1 node tools/golden.mjs`);
      const have = fs.readFileSync(goldenFile, "utf8");
      if (have !== out.svg) {
        const i = [...have].findIndex((ch, k) => ch !== out.svg[k]);
        assert.fail(`golden differs at offset ${i}: …${have.slice(Math.max(0, i - 40), i + 60)}… vs …${out.svg.slice(Math.max(0, i - 40), i + 60)}…`);
      }
      /* every row with a symbol is findable on the canvas */
      for (const id of out.order) {
        const it = out.items[id];
        if (it.type === "bus coupler" || it.x === null) continue;
        assert.ok(out.svg.includes(`data-id="${id.replace(/&/g, "&amp;").replace(/</g, "&lt;")}"`), `no <g data-id> for ${id}`);
      }
    }
  });
}
