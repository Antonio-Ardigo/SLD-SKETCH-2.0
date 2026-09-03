/* Constitution §7 in code: the module boundaries the design relies on.
 *   core never imports ui; the reader and the graph never import the drawing;
 *   the rules see the graph and the predicates, not the canvas; views know
 *   nothing of rows. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../tools/lib/cases.mjs";

function imports(file) {
  const src = fs.readFileSync(file, "utf8");
  return [...src.matchAll(/^import\s.*?from\s+["']([^"']+)["'];/gm)].map(m => path.normalize(path.join(path.dirname(file), m[1])).replace(ROOT + path.sep, "").split(path.sep).join("/"));
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".js") ? [path.join(dir, e.name)] : []);
}

const core = walk(path.join(ROOT, "src", "core"));
const rel = f => f.replace(ROOT + path.sep, "").split(path.sep).join("/");

test("src/core never imports src/ui", () => {
  for (const f of core) for (const i of imports(f)) assert.ok(!i.startsWith("src/ui"), `${rel(f)} imports ${i}`);
});

test("the reader (types, diagnostics, model) and the graph do not import the drawing", () => {
  const forbidden = ["src/core/svg.js", "src/core/render.js", "src/core/dxf.js", "src/core/scene.js", "src/core/symbols/registry.js"];
  for (const name of ["types.js", "diagnostics.js", "graph.js", "model.js", "rank.js", "views.js"]) {
    for (const i of imports(path.join(ROOT, "src", "core", name)))
      assert.ok(!forbidden.includes(i), `${name} imports ${i}`);
  }
});

test("rules read the graph and the predicates, never the canvas or the renderer", () => {
  for (const f of walk(path.join(ROOT, "src", "core", "rules")))
    for (const i of imports(f)) assert.ok(!/svg|render|dxf|scene|symbols|views/.test(i), `${rel(f)} imports ${i}`);
});

test("no two bundled modules declare the same top-level name (the page is one script)", async () => {
  const { BUNDLE_ORDER } = await import("../tools/build-page.mjs");
  const seen = new Map();
  for (const f of BUNDLE_ORDER) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (const m of src.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)|^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) {
      const name = m[1] || m[2];
      assert.ok(!seen.has(name) || seen.get(name) === f, `${name} is declared in both ${seen.get(name)} and ${f}`);
      seen.set(name, f);
    }
  }
});

test("views.js and rank.js are pure: no imports from the engine", () => {
  assert.deepEqual(imports(path.join(ROOT, "src", "core", "views.js")), []);
  assert.deepEqual(imports(path.join(ROOT, "src", "core", "rank.js")), []);
});
