/* Reading a table: which column is which, and what separates them. Both were
 * decided by loose guesses, and both could turn a whole survey into something
 * else without a word (src/io/csv.js). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readCsv, readTable, rowsToCsv, parseCsv, sniffDelimiter, bindColumns, csvToRows, FIELDS } from "../src/io/csv.js";

const SHEET = [
  ["ID", "Type", "Description", "Rating", "Voltage", "Protection", "Feeds From", "Notes"],
  ["MV1", "MV Incomer", "Utility", "", "11 kV", "", "", ""],
  ["BB1", "LV Busbar", "Board", "", "400 V", "CB", "MV1", ""],
];
const asText = (table, d) => table.map(r => r.map(c => /[",\r\n;\t]/.test(c) ? `"${c}"` : c).join(d)).join("\n") + "\n";

test("comma, semicolon and tab all read the same table", () => {
  for (const d of [",", ";", "\t"]) {
    const out = readCsv(asText(SHEET, d));
    assert.equal(out.delimiter, d, `delimiter of ${JSON.stringify(d)}`);
    assert.equal(out.rows.length, 2);
    assert.deepEqual(out.rows[1], { id: "BB1", type: "LV Busbar", desc: "Board", rating: "", voltage: "400 V", prot: "CB", from: "MV1", notes: "" });
  }
});

test("a comma inside a quoted field is not a separator, whatever the separator is", () => {
  for (const d of [",", ";", "\t"]) {
    const text = `ID${d}Type${d}Feeds From\nBC1${d}Bus Coupler${d}"BB1, BB2"\n`;
    assert.equal(readCsv(text).rows[0].from, "BB1, BB2", JSON.stringify(d));
  }
  /* a doubled quote is one quote; a CRLF file reads as an LF one */
  assert.equal(parseCsv(`a,"say ""hi""",c\r\nd,e,f\r\n`)[0][1], 'say "hi"');
  assert.equal(parseCsv("a,b\r\nc,d\r\n").length, 2);
});

test("a decoy column to the left does not steal a field", () => {
  /* the whole survey used to bind its identity to the building number */
  const out = readCsv("Building ID,ID,Type,Feeds From\nB7,MV1,MV Incomer,\nB7,BB1,LV Busbar,MV1\n");
  assert.deepEqual(out.rows.map(r => r.id), ["MV1", "BB1"]);
  const t = readTable([["Cable Type", "ID", "Type"], ["XLPE", "MV1", "MV Incomer"]]);
  assert.equal(t.rows[0].type, "MV Incomer", "Cable Type must not be the Type column");
  /* and no two fields share one column */
  const { idx } = bindColumns(["Building ID", "ID", "Type", "Feeds From"]);
  const used = FIELDS.map(f => idx[f]).filter(j => j >= 0);
  assert.equal(new Set(used).size, used.length, "two fields bound to one column");
});

test("a header named for its field is read; one only containing the word is read and reported", () => {
  const exact = readCsv("Equipment ID,Equipment Type,Fed From\nMV1,MV Incomer,\n");
  assert.equal(exact.rows[0].id, "MV1", "a sheet named this way used to be refused outright");
  assert.deepEqual(exact.notes, [], "an exact name needs no explaining");
  const loose = readCsv("Feeder ID,Cable Type,From Bus\nF1,Feeder,BB1\n");
  assert.deepEqual(loose.rows[0], { id: "F1", type: "Feeder", desc: "", rating: "", voltage: "", prot: "", from: "BB1", notes: "" });
  assert.equal(loose.notes.length, 3, "each loose binding is named");
  assert.match(loose.notes[0], /"Feeder ID" was read as ID/);
});

test("a missing Feeds From column is said out loud", () => {
  const out = readCsv("ID,Type,Description\nF1,Feeder,pump\n");
  assert.deepEqual(out.rows[0].from, "");
  assert.ok(out.notes.some(n => /No Feeds From column/.test(n)), out.notes.join(" | "));
});

test("a file with no header row is refused, and an empty one is empty", () => {
  assert.throws(() => readCsv("a,b,c\n1,2,3\n"), /no header row/);
  assert.deepEqual(readCsv("").rows, []);
  assert.deepEqual(readCsv("\n\n").rows, []);
  assert.deepEqual(csvToRows(""), []);
});

test("a row with data but no ID survives, so the reader can warn about it", () => {
  const out = readCsv("ID,Type,Description\n,Feeder,no id here\nF1,Feeder,fine\n");
  assert.equal(out.rows.length, 2);
  assert.equal(out.rows[0].id, "");
  /* a wholly empty line is not a row */
  assert.equal(readCsv("ID,Type\n,\nF1,Feeder\n").rows.length, 1);
});

test("what rowsToCsv writes, readCsv reads back", () => {
  const rows = [
    { id: "BC1", type: "Bus Coupler", desc: 'the "tie"', rating: "", voltage: "400 V", prot: "CB, CB", from: "BB1, BB2", notes: "N.O." },
    { id: "F1", type: "Feeder", desc: "line\nbreak", rating: "250 A", voltage: "400 V", prot: "CB", from: "BB1", notes: "" },
  ];
  assert.deepEqual(readCsv(rowsToCsv(rows)).rows, rows);
});

test("a one-column file is still read as one column", () => {
  assert.equal(sniffDelimiter("ID\nMV1\n"), ",");
  assert.equal(sniffDelimiter(""), ",");
});
