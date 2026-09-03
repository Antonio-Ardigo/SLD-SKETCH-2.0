#!/usr/bin/env node
/* SLD-Sketch command line.
 *
 *   node src/cli/sld.js draw <table> [-o out.svg] [--dxf [out.dxf]]
 *   node src/cli/sld.js dxf  <table> [-o out.dxf]
 *
 * <table> is a survey workbook (.xlsx), a CSV of the equipment table, or a
 * testdata case directory. Warnings go to stderr; a reader error (duplicate
 * ID, unknown Feeds From) exits 1 without a drawing. */
import fs from "node:fs";
import path from "node:path";
import { readWorkbook } from "../io/xlsx.js";
import { csvToRows } from "../io/csv.js";
import { draw } from "../core/pipeline.js";
import { formatCheck } from "../core/check.js";

function usage(code = 2) {
  console.error(`usage:
  sld draw  <table.xlsx|table.csv|casedir> [-o out.svg] [--dxf [out.dxf]]
  sld dxf   <table.xlsx|table.csv|casedir> [-o out.dxf]
  sld check <table|casedir>…  [--json]      drawing checked against its table; exit 1 unless clean`);
  process.exit(code);
}

function checkMany(files, json) {
  const reports = [];
  let bad = 0;
  for (const file of files) {
    const isDir = fs.existsSync(file) && fs.statSync(file).isDirectory();
    if (isDir ? !fs.existsSync(path.join(file, "case.json")) : !/\.(xlsx|xlsm|csv)$/i.test(file)) continue;   /* not a table */
    const { info, rows } = loadTable(file);
    const res = draw(info, rows, { check: true });
    const name = path.basename(file.replace(/[\\/]+$/, ""));
    if (!res.check) { reports.push({ name, errors: res.errors }); bad++; if (!json) console.log(`${name.padEnd(28)} no drawing: ${res.errors.join(" | ")}`); continue; }
    const k = res.check;
    reports.push({ name, ...k });
    if (!k.clean) bad++;
    if (!json) {
      console.log(`${name.padEnd(28)} ${formatCheck(k)}`);
      for (const m of k.items.missing) console.log(`    missing      ${m}`);
      for (const e of k.edges.via) console.log(`    via other    ${e}`);
      for (const e of k.edges.disconnected) console.log(`    disconnected ${e}`);
      for (const o of k.overlapList) console.log(`    overlap      ${o}`);
      for (const f of k.falseList) console.log(`    false net    ${f}`);
    }
  }
  if (json) console.log(JSON.stringify(reports, null, 2));
  else if (files.length > 1) console.log(`\n${files.length - bad}/${files.length} clean`);
  process.exit(bad ? 1 : 0);
}

/** Load a table from a workbook, a CSV file, or a testdata case directory. */
export function loadTable(file) {
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    const c = JSON.parse(fs.readFileSync(path.join(file, "case.json"), "utf8"));
    return { info: c.info || {}, rows: csvToRows(fs.readFileSync(path.join(file, "rows.csv"), "utf8")) };
  }
  if (/\.csv$/i.test(file)) {
    return { info: { site: path.basename(file, path.extname(file)) }, rows: csvToRows(fs.readFileSync(file, "utf8")) };
  }
  const wb = readWorkbook(file);
  return { info: wb.info, rows: wb.rows };
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help") usage(cmd ? 0 : 2);
  if (cmd === "check") { const files = rest.filter(a => !a.startsWith("-")); if (!files.length) usage(); return checkMany(files, rest.includes("--json")); }
  if (cmd !== "draw" && cmd !== "dxf") usage();
  let file = null, out = null, dxf = cmd === "dxf", dxfOut = null;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "-o" || a === "--output") out = rest[++i];
    else if (a === "--dxf") { dxf = true; if (rest[i + 1] && !rest[i + 1].startsWith("-")) dxfOut = rest[++i]; }
    else if (a.startsWith("-")) usage();
    else file = a;
  }
  if (!file) usage();

  const { info, rows } = loadTable(file);
  const res = draw(info, rows, { dxf });
  for (const w of res.warnings) console.error(`warning: ${w}`);
  if (res.errors.length) { for (const e of res.errors) console.error(`error: ${e}`); process.exit(1); }
  if (!res.svg) { console.error("error: the table has no rows"); process.exit(1); }

  const stem = file.replace(/\.(xlsx|xlsm|csv)$/i, "").replace(/[\\/]+$/, "");
  if (cmd === "draw") {
    const svgOut = out || `${stem}.svg`;
    fs.writeFileSync(svgOut, res.svg);
    console.error(`wrote ${svgOut}`);
    if (dxf) { const d = dxfOut || svgOut.replace(/\.svg$/i, "") + ".dxf"; fs.writeFileSync(d, res.dxf); console.error(`wrote ${d}`); }
  } else {
    const d = out || `${stem}.dxf`;
    fs.writeFileSync(d, res.dxf);
    console.error(`wrote ${d}`);
  }
}

main(process.argv.slice(2));
