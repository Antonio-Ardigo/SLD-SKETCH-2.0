#!/usr/bin/env node
/* Draw every testdata case with the engine and compare with its golden.svg.
 *
 *   node tools/golden.mjs                 # report differences, exit 1 if any
 *   UPDATE_GOLDEN=1 node tools/golden.mjs # (re)write golden.svg and expect.legacy
 *   node tools/golden.mjs sites/c1_wtw    # one case (or a group)
 *   node tools/golden.mjs --report out.html   # side-by-side HTML of every case
 */
import fs from "node:fs";
import path from "node:path";
import { listCases, loadCase, drawCase } from "./lib/cases.mjs";
import { sameGeometry, rootTag } from "./lib/svg-geometry.mjs";

const args = process.argv.slice(2);
const update = !!process.env.UPDATE_GOLDEN;
const reportIdx = args.indexOf("--report");
const reportFile = reportIdx >= 0 ? args.splice(reportIdx, 2)[1] : null;
const filter = args[0] || "";

let changed = 0, same = 0, missing = 0;
const report = [];

for (const dir of listCases(filter)) {
  const c = loadCase(dir);
  const out = drawCase(c);
  const goldenFile = path.join(dir, "golden.svg");
  const legacy = { items: out.order.length, errors: out.errors.length, warnings: out.warnings.length };
  const svg = out.svg || "";
  const have = fs.existsSync(goldenFile) ? fs.readFileSync(goldenFile, "utf8") : null;
  /* "regroup": the same marks at the same places, only the <g> grouping differs */
  let status = have === null ? (svg ? "new" : "none") : have === svg ? "same" : "changed";
  if (status === "changed" && svg && rootTag(have) === rootTag(svg) && sameGeometry(have, svg)) status = "regroup";
  if (status === "same" || status === "none") same++; else if (status === "new") missing++; else changed++;
  if (update && status !== "same") {
    if (svg) fs.writeFileSync(goldenFile, svg); else if (have !== null) fs.unlinkSync(goldenFile);
    c.data.expect = { ...c.data.expect, golden: !!svg, legacy };
    fs.writeFileSync(c.file, JSON.stringify(c.data, null, 2) + "\n");
  } else if (update && JSON.stringify(c.data.expect?.legacy) !== JSON.stringify(legacy)) {
    c.data.expect = { ...c.data.expect, legacy };
    fs.writeFileSync(c.file, JSON.stringify(c.data, null, 2) + "\n");
  }
  console.log(`${status.padEnd(7)} ${c.data.group}/${c.data.name}  items ${legacy.items}  err ${legacy.errors}  warn ${legacy.warnings}`);
  if (reportFile) report.push({ c, svg, have, status });
}

console.log(`\n${same} same, ${changed} changed, ${missing} new${update ? " — goldens updated" : ""}`);

if (reportFile) {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const cell = svg => svg ? `<div class="svg">${svg}</div>` : "<em>no drawing</em>";
  const html = `<!doctype html><meta charset="utf-8"><title>SLD golden report</title>
<style>body{font:14px system-ui;margin:16px}h2{margin:24px 0 4px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.svg{border:1px solid #ccc;overflow:auto;max-height:70vh}.svg svg{max-width:100%;height:auto}.same{color:#2a7}.changed{color:#c33}</style>
<h1>Golden report</h1>` + report.map(({ c, svg, have, status }) =>
    `<h2 class="${status}">${esc(c.data.group)}/${esc(c.data.name)} — ${status}</h2><p>${esc(c.data.description)}</p>
<div class="pair"><div><b>golden</b>${cell(have)}</div><div><b>current</b>${cell(svg)}</div></div>`).join("");
  fs.writeFileSync(reportFile, html);
  console.log(`report written to ${reportFile}`);
}

process.exit(!update && (changed || missing) ? 1 : 0);
