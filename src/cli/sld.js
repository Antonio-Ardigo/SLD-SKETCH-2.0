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

function usage(code = 2) {
  console.error(`usage:
  sld draw <table.xlsx|table.csv|casedir> [-o out.svg] [--dxf [out.dxf]]
  sld dxf  <table.xlsx|table.csv|casedir> [-o out.dxf]`);
  process.exit(code);
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
