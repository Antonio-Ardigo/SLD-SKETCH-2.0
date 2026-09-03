/* Constitution §4: a view changes the drawing, never the data or the graph.
 * Every case is drawn under every spacing and with legend and title block
 * off; the graph signature, the ranks and the checker verdict must not move,
 * while the picture does. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { listCases, loadCase } from "../tools/lib/cases.mjs";
import { draw } from "../src/core/pipeline.js";
import { graphSignature } from "../src/core/graph.js";
import { VIEW_OPTIONS, normalizeView, isDefaultView } from "../src/core/views.js";

test("views keep the graph, the ranks and the checker verdict; only the picture changes", () => {
  for (const dir of listCases()) {
    const c = loadCase(dir);
    const base = draw(c.data.info, c.rows, { check: true });
    if (!base.svg) continue;
    const sig = JSON.stringify(graphSignature(base.graph)), ranks = JSON.stringify(base.facts.rank);
    for (const spacing of VIEW_OPTIONS.spacing) {
      const out = draw(c.data.info, c.rows, { check: true, view: { spacing, legend: false, titleBlock: false } });
      const label = `${c.data.group}/${c.data.name} @ ${spacing}`;
      assert.equal(JSON.stringify(graphSignature(out.graph)), sig, `${label}: graph moved`);
      assert.equal(JSON.stringify(out.facts.rank), ranks, `${label}: ranks moved`);
      assert.deepEqual([out.check.items.missing, out.check.edges.disconnected, out.check.edges.via],
        [base.check.items.missing, base.check.edges.disconnected, base.check.edges.via], `${label}: connectivity changed`);
      assert.ok(!out.svg.includes(">LEGEND<"), `${label}: legend drawn although off`);
      assert.ok(!out.svg.includes("SITE SURVEY"), `${label}: title block drawn although off`);
      if (spacing !== "normal" && c.rows.length > 6) assert.notEqual(out.svg, base.svg, `${label}: picture unchanged`);
    }
    /* the default view is the historical drawing, byte for byte */
    assert.equal(draw(c.data.info, c.rows, { view: normalizeView({}) }).svg, base.svg, `${c.data.name}: default view differs`);
  }
});

test("normalizeView drops unknown values", () => {
  assert.deepEqual(normalizeView({ spacing: "huge", legend: "yes", extra: 1 }), { spacing: "normal", legend: true, titleBlock: true });
  assert.ok(isDefaultView(null) && isDefaultView({}) && !isDefaultView({ legend: false }));
});
