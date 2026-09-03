/* The derived artefacts stay in step with their sources:
 *  - src/ui/presets.generated.js equals what gen-fixtures emits from testdata/
 *  - sld_sketchpad.html equals what build-page assembles from the modules
 *  - the bundled engine inside the page draws exactly what the modules draw
 *  - a workbook written from a case reads back to the same rows and info */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listCases, loadCase, drawCase, ROOT } from "../tools/lib/cases.mjs";
import { presetsSource, GENERATED } from "../tools/gen-fixtures.mjs";
import { buildPage } from "../tools/build-page.mjs";
import { drawWithBundle } from "../tools/lib/engine-bundle.mjs";
import { writeWorkbook, readWorkbook } from "../src/io/xlsx.js";
import { rowsToCsv, csvToRows } from "../src/io/csv.js";
import { draw } from "../src/core/pipeline.js";
import { PRESETS } from "../src/ui/presets.generated.js";

const cases = listCases().map(loadCase);

test("src/ui/presets.generated.js is generated from testdata", () => {
  assert.equal(fs.readFileSync(GENERATED, "utf8"), presetsSource(cases));
});

test("sld_sketchpad.html is the build of the modules", () => {
  assert.equal(fs.readFileSync(path.join(ROOT, "sld_sketchpad.html"), "utf8"), buildPage());
});

test("PRESETS draw identically to their testdata cases", () => {
  const byKey = new Map(cases.filter(c => c.data.preset).map(c => [String(c.data.preset), c]));
  assert.deepEqual(Object.keys(PRESETS).sort(), [...byKey.keys()].sort());
  for (const [k, c] of byKey) {
    const a = drawCase(c).svg, b = draw(PRESETS[k].info, PRESETS[k].rows).svg;
    assert.ok(a && a === b, `preset ${k} (${c.data.name}) draws differently from testdata`);
  }
});

test("the page's bundled engine draws what the modules draw", () => {
  for (const c of cases) {
    const a = drawCase(c, { dxf: true }), b = drawWithBundle(c.data.info, c.rows, { dxf: true, view: c.data.view || null });
    assert.equal(b.svg, a.svg, `${c.data.name} svg`);
    assert.equal(b.dxf, a.dxf, `${c.data.name} dxf`);
    assert.deepEqual([...b.warnings], a.warnings, `${c.data.name} warnings`);   /* the bundle's arrays come from another realm */
  }
});

test("csv round-trips", () => {
  for (const c of cases) assert.deepEqual(csvToRows(rowsToCsv(c.rows)), c.rows, c.data.name);
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
