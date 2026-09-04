#!/usr/bin/env node
/* Build the single-file page from the ES modules.
 *
 * Browsers refuse `import` from file://, and the page must open from a plain
 * file, so the modules are concatenated into one classic <script>: import
 * lines and export lists are stripped, the rest is the module text verbatim,
 * in dependency order. The result is written to sld_sketchpad.html (the file
 * users open, kept in the repository) and to dist/sld_sketchpad.html.
 *
 *   node tools/build-page.mjs           # write
 *   node tools/build-page.mjs --check   # exit 1 if sld_sketchpad.html is stale
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/* the original script order: every module only reads earlier ones at load time */
export const BUNDLE_ORDER = [
  "src/core/types.js", "src/core/diagnostics.js", "src/core/views.js", "src/core/geometry.js", "src/core/model.js",
  "src/core/layout.js", "src/core/svg.js", "src/core/symbols/registry.js", "src/core/render.js", "src/core/dxf.js",
  "src/core/graph.js", "src/core/pipeline.js", "src/core/propose.js",
  "src/ui/presets.generated.js", "src/ui/app.js",
];
export const TEMPLATE = "src/ui/page.html";

export function stripModuleSyntax(src) {
  return src.split("\n")
    .filter(l => !/^import\s.*from\s+["'][^"']+["'];\s*$/.test(l) && !/^export\s*\{[^}]*\};\s*$/.test(l))
    .map(l => l.replace(/^export\s+(?=(const|let|var|function|class|async)\b)/, ""))
    .join("\n");
}

export function buildPage() {
  const parts = BUNDLE_ORDER.map(f => stripModuleSyntax(fs.readFileSync(path.join(ROOT, f), "utf8")).replace(/^\n+|\n+$/g, ""));
  const bundle = `"use strict";\n\n${parts.join("\n\n")}\n`;
  const tpl = fs.readFileSync(path.join(ROOT, TEMPLATE), "utf8");
  if (!tpl.includes("@@BUNDLE@@")) throw new Error(`${TEMPLATE} has no @@BUNDLE@@ marker`);
  return tpl.replace("@@BUNDLE@@", () => bundle);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const html = buildPage();
  const page = path.join(ROOT, "sld_sketchpad.html");
  if (process.argv.includes("--check")) {
    const have = fs.existsSync(page) ? fs.readFileSync(page, "utf8") : "";
    if (have !== html) { console.error("sld_sketchpad.html is stale — run: node tools/build-page.mjs"); process.exit(1); }
    console.log("sld_sketchpad.html up to date");
  } else {
    fs.writeFileSync(page, html);
    fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
    fs.writeFileSync(path.join(ROOT, "dist", "sld_sketchpad.html"), html);
    console.log(`wrote sld_sketchpad.html and dist/sld_sketchpad.html (${(html.length / 1024).toFixed(0)} kB)`);
  }
}
