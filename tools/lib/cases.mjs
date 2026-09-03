/* Test-data cases: testdata/<group>/<name>/{rows.csv, case.json, golden.svg} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { csvToRows } from "../../src/io/csv.js";
import { draw } from "../../src/core/pipeline.js";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");
export const TESTDATA = path.join(ROOT, "testdata");

/** Case directories, sorted, optionally filtered by "group" or "group/name" prefix. */
export function listCases(filter = "") {
  const out = [];
  if (!fs.existsSync(TESTDATA)) return out;
  for (const group of fs.readdirSync(TESTDATA).sort()) {
    const gdir = path.join(TESTDATA, group);
    if (!fs.statSync(gdir).isDirectory()) continue;
    for (const name of fs.readdirSync(gdir).sort()) {
      const dir = path.join(gdir, name);
      if (!fs.existsSync(path.join(dir, "case.json"))) continue;
      const rel = `${group}/${name}`;
      if (filter && !rel.startsWith(filter)) continue;
      out.push(dir);
    }
  }
  return out;
}

/** Load one case: { dir, file, data (case.json), rows } */
export function loadCase(dir) {
  const file = path.join(dir, "case.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const csvFile = path.join(dir, "rows.csv");
  const rows = fs.existsSync(csvFile) ? csvToRows(fs.readFileSync(csvFile, "utf8")) : [];
  return { dir, file, data, rows };
}

/** Draw a loaded case with the engine. */
export function drawCase(c, opts) {
  return draw(c.data.info || {}, c.rows, opts);
}
