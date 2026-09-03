/* Every testdata case draws exactly as its golden.svg, and its diagnostics
 * match what case.json expects.  Run:  node --test test/   */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { listCases, loadCase, drawCase } from "../tools/lib/cases.mjs";

const cases = listCases();
assert.ok(cases.length > 0, "no cases under testdata/");

for (const dir of cases) {
  const c = loadCase(dir);
  const label = `${c.data.group}/${c.data.name}`;

  test(label, () => {
    const out = drawCase(c);
    const exp = c.data.expect || {};

    if (exp.legacy) {
      assert.equal(out.order.length, exp.legacy.items, "items parsed");
      assert.equal(out.errors.length, exp.legacy.errors, `errors: ${out.errors.join(" | ")}`);
      assert.equal(out.warnings.length, exp.legacy.warnings, `warnings: ${out.warnings.join(" | ")}`);
    }

    /* every warning names at least one row ID (a row is never dropped silently) */
    const ids = new Set(c.rows.map(r => r.id));
    for (const w of out.warnings) {
      const named = [...w.matchAll(/"([^"]+)"/g)].some(m => ids.has(m[1])) || /^Row \d+/.test(w);
      assert.ok(named, `warning does not name a row: ${w}`);
    }

    const goldenFile = path.join(dir, "golden.svg");
    if (exp.golden === false) {
      assert.equal(out.svg, null, "case is expected not to draw");
      return;
    }
    if (exp.golden) {
      assert.ok(out.svg, `no drawing produced (errors: ${out.errors.join(" | ")})`);
      if (!fs.existsSync(goldenFile)) {
        assert.fail(`missing ${path.relative(process.cwd(), goldenFile)} — run UPDATE_GOLDEN=1 node tools/golden.mjs`);
      }
      const have = fs.readFileSync(goldenFile, "utf8");
      if (have !== out.svg) {
        const i = [...have].findIndex((ch, k) => ch !== out.svg[k]);
        assert.fail(`golden differs at offset ${i}: …${have.slice(Math.max(0, i - 40), i + 60)}… vs …${out.svg.slice(Math.max(0, i - 40), i + 60)}…`);
      }
    }
  });
}
