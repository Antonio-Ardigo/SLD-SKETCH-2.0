/* The PDF export: a real one-page A3 file, written from the same drawing. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { listCases, loadCase, TESTDATA } from "../tools/lib/cases.mjs";
import path from "node:path";
import { draw } from "../src/core/pipeline.js";
import { pnum, pstring, ptextW, pwrap, pdfDocument, PDF_PAGE } from "../src/core/pdf.js";

const CASES = ["examples/config1_single_tx", "sites/c1_wtw", "examples/config7_mcc_motors", "topics/dc_ups_types"];
const pdfOf = rel => { const c = loadCase(path.join(TESTDATA, rel)); return [c, draw(c.data.info, c.rows, { pdf: true }).pdf]; };

/* the strings the file actually draws, unescaped back to text */
function drawnText(pdf) {
  return [...pdf.matchAll(/\(((?:[^()\\]|\\.)*)\) Tj/g)]
    .map(m => m[1].replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))).replace(/\\(.)/g, "$1"));
}

test("numbers, strings and widths", () => {
  assert.equal(pnum(0), "0");
  assert.equal(pnum(-0.0001), "0");
  assert.equal(pnum(12), "12");
  assert.equal(pnum(1190.55), "1190.55");
  assert.equal(pstring("BB1"), "(BB1)");
  assert.equal(pstring("a(b)c\\d"), "(a\\(b\\)c\\\\d)");
  assert.equal(pstring("11/0.4 kV · TX1"), "(11/0.4 kV \\267 TX1)");   /* WinAnsi middle dot */
  assert.equal(pstring("a — b"), "(a \\227 b)");
  assert.equal(pstring("in → out"), "(in -> out)");                   /* no WinAnsi glyph: spelled out */
  /* Helvetica: a digit is 556/1000 em, bold "W" is 944 */
  assert.equal(ptextW("400", 10, false).toFixed(2), "16.68");
  assert.equal(ptextW("W", 1000, true), 944);
  assert.ok(ptextW("MMMM", 12, true) > ptextW("iiii", 12, false));
  assert.deepEqual(pwrap("a bb ccc", 4), ["a bb", "ccc"]);
  assert.deepEqual(pwrap(""), [""]);
});

test("the document is a valid single-page PDF whose xref points at its objects", () => {
  for (const dir of CASES) {
    const [, pdf] = pdfOf(dir);
    assert.ok(pdf.startsWith("%PDF-1.4\n"), `${dir}: no header`);
    assert.ok(pdf.endsWith("%%EOF\n"), `${dir}: no trailer`);
    assert.equal(pdf.match(/\/Type\/Page[^s]/g).length, 1, `${dir}: not one page`);
    assert.ok(pdf.includes(`/MediaBox[0 0 ${pnum(PDF_PAGE[0])} ${pnum(PDF_PAGE[1])}]`), `${dir}: not A3 landscape`);
    /* every xref offset lands on the "<n> 0 obj" it claims */
    const xref = /\nxref\n0 (\d+)\n0000000000 65535 f \n([\s\S]*?)trailer/.exec(pdf);
    assert.ok(xref, `${dir}: no xref`);
    const offsets = xref[2].trim().split("\n").map(l => parseInt(l.slice(0, 10), 10));
    assert.equal(offsets.length + 1, +xref[1], `${dir}: xref size wrong`);
    offsets.forEach((o, i) => assert.ok(pdf.startsWith(`${i + 1} 0 obj`, o), `${dir}: xref ${i + 1} misses its object`));
    assert.equal(+/startxref\n(\d+)/.exec(pdf)[1], pdf.indexOf("\nxref\n") + 1, `${dir}: startxref wrong`);
    /* the declared stream length is the stream */
    const len = +/\/Length (\d+)>>\nstream\n/.exec(pdf)[1];
    const from = pdf.indexOf("stream\n") + 7;
    assert.equal(pdf.slice(from + len, from + len + 9), "endstream", `${dir}: /Length wrong`);
    /* nothing is compressed, so the file is plain ASCII and survives a Blob */
    assert.ok(!/[^\x09\x0a\x20-\x7e]/.test(pdf), `${dir}: not ASCII`);
  }
});

test("the sheet and its equipment table are both in the file", () => {
  for (const dir of CASES) {
    const [c, pdf] = pdfOf(dir);
    const text = drawnText(pdf).join("\n");
    const { items, order } = draw(c.data.info, c.rows, {});
    for (const id of order) assert.ok(text.includes(items[id].id), `${dir}: "${id}" is not drawn`);
    for (const h of ["ID", "Description", "Protection", "Feeds From"])
      assert.ok(text.includes(h), `${dir}: the equipment table has no "${h}" column`);
    assert.ok(text.includes("EQUIPMENT TABLE"), `${dir}: no equipment table`);
    /* the drawing is placed by one transform, and the page paints in black */
    assert.equal((pdf.match(/ cm\n/g) || []).length, 2, `${dir}: expected the page transform and the table's`);
  }
});

test("every case draws a PDF, and it is never empty", () => {
  for (const dir of listCases()) {
    const c = loadCase(dir);
    const out = draw(c.data.info, c.rows, { pdf: true });
    if (!out.svg) { assert.equal(out.pdf, null, `${dir}: a PDF without a drawing`); continue; }
    assert.ok(out.pdf.length > 1000, `${dir}: suspiciously small PDF`);
    assert.ok(drawnText(out.pdf).length > 0, `${dir}: nothing written`);
  }
});

test("pdfDocument wraps any stream", () => {
  const doc = pdfDocument("q Q\n", 100, 200);
  assert.ok(doc.includes("/MediaBox[0 0 100 200]"));
  assert.ok(doc.includes("<</Length 4>>"));
  assert.ok(doc.includes("/BaseFont/Helvetica/") && doc.includes("/BaseFont/Helvetica-Bold/"));
});
