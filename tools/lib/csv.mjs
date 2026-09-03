/* Minimal RFC 4180 CSV — enough for the equipment table. */

export const HEADERS = ["ID", "Type", "Description", "Rating", "Voltage",
                        "Protection", "Feeds From", "Notes"];
/* row object keys in the same order as HEADERS (the sketchpad's row shape) */
export const FIELDS = ["id", "type", "desc", "rating", "voltage", "prot", "from", "notes"];

function quote(v) {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows: [{id,type,desc,rating,voltage,prot,from,notes}] → CSV text (LF, header first). */
export function rowsToCsv(rows) {
  const lines = [HEADERS.map(quote).join(",")];
  for (const r of rows) lines.push(FIELDS.map(f => quote(r[f])).join(","));
  return lines.join("\n") + "\n";
}

/** CSV text → array of string arrays. Handles quotes, doubled quotes, CRLF. */
export function parseCsv(text) {
  const out = [];
  let row = [], field = "", i = 0, inQ = false;
  const s = text.replace(/^﻿/, "");
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
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { row.push(field); out.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); out.push(row); }
  return out;
}

/** CSV text → [{id,type,...}] using the header row to find the columns
 *  (substring match, like the Python reader: "feeds from" / "parent" / "from"). */
export function csvToRows(text) {
  const table = parseCsv(text).filter(r => r.some(c => c.trim() !== ""));
  if (!table.length) return [];
  return tableToRows(table);
}

/** array-of-arrays (first row = header) → row objects. Blank-ID rows are dropped. */
export function tableToRows(table) {
  let hi = table.findIndex(r => {
    const cells = r.map(c => String(c ?? "").trim().toLowerCase());
    return cells.includes("id") && cells.includes("type");
  });
  if (hi < 0) throw new Error("no header row with ID and Type columns");
  const headers = table[hi].map(c => String(c ?? "").trim().toLowerCase());
  const col = (...names) => {
    for (const n of names) { const j = headers.findIndex(h => h.includes(n)); if (j >= 0) return j; }
    return -1;
  };
  const idx = {
    id: col("id"), type: col("type"), desc: col("desc"), rating: col("rating"),
    voltage: col("volt"), prot: col("protection", "prot"),
    from: col("feeds from", "parent", "from"), notes: col("note"),
  };
  const cell = (r, j) => (j < 0 || j >= r.length || r[j] == null) ? "" : String(r[j]).trim();
  const rows = [];
  for (const r of table.slice(hi + 1)) {
    const o = {};
    for (const f of FIELDS) o[f] = cell(r, idx[f]);
    if (!o.id) continue;
    rows.push(o);
  }
  return rows;
}
