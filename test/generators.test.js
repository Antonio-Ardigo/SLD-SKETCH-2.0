/* The derived artefacts stay in step with testdata/:
 *  - the presets block inside sld_sketchpad.html equals what gen-fixtures emits
 *  - a workbook written from a case reads back to the same rows and info
 *  - the page's PRESETS draw exactly like the testdata cases they come from */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { listCases, loadCase, drawCase, ROOT } from "../tools/lib/cases.mjs";
import { presetsSource } from "../tools/gen-fixtures.mjs";
import { writeWorkbook, readWorkbook } from "../tools/lib/xlsx.mjs";
import { rowsToCsv, csvToRows } from "../tools/lib/csv.mjs";
import { draw } from "../tools/lib/engine-legacy.mjs";

const PAGE = path.join(ROOT, "sld_sketchpad.html");
const START = "/* ------------------------------------------------ presets";
const END = "/* ------------------------------------------------ UI wiring */";
const cases = listCases().map(loadCase);

function pagePresetsBlock() {
  const html = fs.readFileSync(PAGE, "utf8");
  const a = html.indexOf(START), b = html.indexOf(END);
  assert.ok(a >= 0 && b > a, "presets markers present in the page");
  return html.slice(a, b);
}

test("sld_sketchpad.html presets block is generated from testdata", () => {
  assert.equal(pagePresetsBlock(), presetsSource(cases));
});

test("page PRESETS draw identically to their testdata cases", () => {
  const P = vm.runInNewContext(pagePresetsBlock() + ";PRESETS", {});
  const byKey = new Map(cases.filter(c => c.data.preset).map(c => [String(c.data.preset), c]));
  assert.deepEqual(Object.keys(P).sort(), [...byKey.keys()].sort());
  for (const [k, c] of byKey) {
    const a = drawCase(c).svg, b = draw(P[k].info, P[k].rows).svg;
    assert.ok(a && a === b, `preset ${k} (${c.data.name}) draws differently from testdata`);
  }
});

test("csv round-trips", () => {
  for (const c of cases) {
    assert.deepEqual(csvToRows(rowsToCsv(c.rows)), c.rows, c.data.name);
  }
});

test("xlsx round-trips (info + rows)", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sld-"));
  try {
    for (const c of cases) {
      const file = path.join(tmp, `${c.data.name}.xlsx`);
      fs.writeFileSync(file, writeWorkbook({ info: c.data.info, rows: c.rows, howTo: ["x"] }));
      const back = readWorkbook(file);
      assert.deepEqual(back.rows, c.rows, `${c.data.name} rows`);
      assert.deepEqual(back.info, c.data.info, `${c.data.name} info`);
      assert.deepEqual(back.sheets, ["Info", "Equipment", "How to fill"]);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
