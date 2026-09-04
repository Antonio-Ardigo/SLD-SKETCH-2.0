/* Reading an equipment table — the one reader, used by the page, the command
 * line and the fixtures.
 *
 * Two things here are not obvious and both were bugs.
 *
 * The delimiter is sniffed. A spreadsheet saved in much of Europe separates
 * with `;`, and a block copied out of one separates with a tab; both used to
 * parse as a single column per line and fail with "no header row with ID and
 * Type columns", which points at the wrong thing entirely.
 *
 * A column binds by its name before any substring of it. Binding used to be
 * `headers.findIndex(h => h.includes("id"))`, first hit wins — so a sheet
 * carrying a `Building ID` column to the left of `ID` bound every row's
 * identity to the building number, in silence, and the survey arrived as a
 * pile of duplicate IDs and dangling references. Detection was exact while
 * binding was loose, which is the worst pairing of the two: a sheet headed
 * `Equipment ID | Equipment Type` was rejected outright while a sheet with a
 * decoy column was accepted and misread. Exact names bind first now, the old
 * substring pass remains as the fallback so nothing that read correctly stops
 * doing so, and `readTable` reports what bound to what.
 */

export const HEADERS = ["ID", "Type", "Description", "Rating", "Voltage",
                        "Protection", "Feeds From", "Notes"];
/* row object keys in the same order as HEADERS (the sketchpad's row shape) */
export const FIELDS = ["id", "type", "desc", "rating", "voltage", "prot", "from", "notes"];

/* Per field: the header names it is, then the fragments it may be called.
   Exact wins wherever it is on the row; a fragment only when no name matches. */
const COLUMNS = {
  id:      { names: ["id", "item id", "equipment id", "tag", "tag no"], parts: ["id"] },
  type:    { names: ["type", "equipment type", "item type"], parts: ["type"] },
  desc:    { names: ["description", "desc"], parts: ["desc"] },
  rating:  { names: ["rating", "size"], parts: ["rating"] },
  voltage: { names: ["voltage", "volts", "kv"], parts: ["volt"] },
  prot:    { names: ["protection", "prot", "device"], parts: ["protection", "prot"] },
  from:    { names: ["feeds from", "fed from", "parent", "supply", "source"], parts: ["feeds from", "parent", "from"] },
  notes:   { names: ["notes", "note", "comment", "comments", "remarks"], parts: ["note"] },
};

const norm = h => String(h ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function quote(v, delim) {
  const s = v == null ? "" : String(v);
  return new RegExp(`["\\r\\n${delim === "\t" ? "\\t" : delim}]`).test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows: [{id,type,desc,rating,voltage,prot,from,notes}] → CSV text (LF, header first). */
export function rowsToCsv(rows) {
  const lines = [HEADERS.map(h => quote(h, ",")).join(",")];
  for (const r of rows) lines.push(FIELDS.map(f => quote(r[f], ",")).join(","));
  return lines.join("\n") + "\n";
}

export const DELIMITERS = [",", ";", "\t"];

/**
 * Which of comma, semicolon or tab this text is separated by: the one whose
 * parse finds a header row naming ID and Type, else the one that splits the
 * first line into the most fields. Comma when nothing distinguishes them, so
 * a one-column file is read exactly as it always was.
 */
export function sniffDelimiter(text) {
  let best = ",", bestFields = 0;
  for (const d of DELIMITERS) {
    const table = parseCsv(text, d);
    if (headerRowOf(table) >= 0) {
      const n = table[headerRowOf(table)].length;
      if (n > bestFields) { best = d; bestFields = n; }
    }
  }
  if (bestFields) return best;
  for (const d of DELIMITERS) {
    const first = (parseCsv(text, d)[0] || []).length;
    if (first > bestFields) { best = d; bestFields = first; }
  }
  return best;
}

/** CSV text → array of string arrays. Handles quotes, doubled quotes, CRLF. */
export function parseCsv(text, delim = ",") {
  const out = [];
  let row = [], field = "", i = 0, inQ = false;
  const s = String(text).replace(/^﻿/, "");
  while (i < s.length) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === delim) { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); out.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); out.push(row); }
  return out;
}

/**
 * The index of the header row, or -1: the first row with cells named exactly
 * ID and Type, and failing that the first from which both an ID and a Type
 * column bind. The second pass is why `Equipment ID | Equipment Type` reads —
 * it used to be turned away at the door while a sheet with a decoy `Building
 * ID` column was let in and misread.
 */
export function headerRowOf(table) {
  const exact = table.findIndex(r => {
    const cells = r.map(norm);
    return cells.includes("id") && cells.includes("type");
  });
  if (exact >= 0) return exact;
  return table.findIndex(r => {
    if (r.length < 2) return false;
    const { idx } = bindColumns(r.map(c => String(c ?? "").trim()));
    return idx.id >= 0 && idx.type >= 0;
  });
}

/**
 * Which column feeds which field, and how each was decided.
 *
 *   { idx: {field: columnIndex}, bound: [{field, header, at, how}] }
 *
 * `how` is "name" when the header is one of the field's names and "part" when
 * it only contains one of its fragments — the loose case, and the one worth
 * telling the surveyor about.
 */
export function bindColumns(headerCells) {
  const headers = headerCells.map(norm);
  const idx = {}, bound = [], taken = new Set();
  for (const f of FIELDS) {
    let at = headers.findIndex((h, j) => !taken.has(j) && COLUMNS[f].names.includes(h));
    let how = "name";
    if (at < 0) { at = headers.findIndex((h, j) => !taken.has(j) && COLUMNS[f].parts.some(p => h.includes(p))); how = "part"; }
    idx[f] = at;
    if (at >= 0) { taken.add(at); bound.push({ field: f, header: headerCells[at], at, how }); }
  }
  return { idx, bound };
}

/**
 * array-of-arrays (a header row somewhere in it) → { rows, bound, notes }.
 * Empty rows are dropped; a row with data but no ID is kept, so the reader can
 * warn about it. `notes` are sentences about the reading itself — which column
 * was taken for which field when the name was not exact — so a misbinding is
 * visible before it becomes fifty duplicate IDs.
 */
export function readTable(table) {
  const hi = headerRowOf(table);
  if (hi < 0) throw new Error("no header row with ID and Type columns");
  const { idx, bound } = bindColumns(table[hi].map(c => String(c ?? "").trim()));
  const cell = (r, j) => (j < 0 || j >= r.length || r[j] == null) ? "" : String(r[j]).trim();
  const rows = [];
  for (const r of table.slice(hi + 1)) {
    const o = {};
    for (const f of FIELDS) o[f] = cell(r, idx[f]);
    if (!FIELDS.some(f => o[f])) continue;
    rows.push(o);
  }
  const notes = bound.filter(b => b.how === "part" && norm(b.header) !== b.field)
    .map(b => `Column "${b.header}" was read as ${HEADERS[FIELDS.indexOf(b.field)]}.`);
  const missing = FIELDS.filter(f => idx[f] < 0 && ["id", "type", "from"].includes(f));
  for (const f of missing) notes.push(`No ${HEADERS[FIELDS.indexOf(f)]} column was found.`);
  return { rows, bound, notes };
}

/** array-of-arrays (first row = header) → row objects. */
export function tableToRows(table) {
  return readTable(table).rows;
}

/** CSV text → [{id,type,...}], delimiter sniffed. */
export function csvToRows(text) {
  return readCsv(text).rows;
}

/** CSV text → { rows, bound, notes, delimiter }. */
export function readCsv(text) {
  const delimiter = sniffDelimiter(text);
  const table = parseCsv(text, delimiter).filter(r => r.some(c => c.trim() !== ""));
  if (!table.length) return { rows: [], bound: [], notes: [], delimiter };
  return { ...readTable(table), delimiter };
}
