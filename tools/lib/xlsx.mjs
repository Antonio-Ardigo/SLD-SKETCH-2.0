/* Workbook ⇄ rows, via the vendored SheetJS CE build. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tableToRows, HEADERS, FIELDS } from "./csv.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
/* The vendored file is a UMD script; package.json says "type": "module", so
   require() would parse it as ESM. Evaluate it as CommonJS by hand. */
function loadUmd(file) {
  const src = fs.readFileSync(file, "utf8");
  const module = { exports: {} };
  new Function("module", "exports", "require", src)(module, module.exports, undefined);
  return module.exports;
}
export const XLSX = loadUmd(path.join(here, "..", "..", "vendor", "xlsx.full.min.js"));

const INFO_KEYS = { site: "site", date: "date", "surveyed by": "by", by: "by", notes: "notes" };

/** Read a survey workbook → { info: {site,date,by,notes}, rows: [...], sheets: [...] } */
export function readWorkbook(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: "buffer" });
  const info = { site: "", date: "", by: "", notes: "" };
  if (wb.Sheets["Info"]) {
    for (const r of XLSX.utils.sheet_to_json(wb.Sheets["Info"], { header: 1, defval: "" })) {
      const key = String(r[0] ?? "").trim().replace(/:$/, "").toLowerCase();
      if (!key) continue;
      const k = INFO_KEYS[key]; if (!k) continue;
      let v = r[1] ?? "";
      if (v instanceof Date) v = v.toISOString().slice(0, 10);
      info[k] = String(v).trim();
    }
  }
  if (!wb.Sheets["Equipment"]) throw new Error(`${file}: no 'Equipment' sheet (found ${wb.SheetNames.join(", ")})`);
  const table = XLSX.utils.sheet_to_json(wb.Sheets["Equipment"], { header: 1, defval: "", raw: false });
  return { info, rows: tableToRows(table), sheets: wb.SheetNames };
}

/** Build a survey workbook from info + rows (+ optional how-to text lines). Returns a Buffer. */
export function writeWorkbook({ info, rows, howTo }) {
  const wb = XLSX.utils.book_new();
  const infoRows = [["Site", info.site || ""], ["Date", info.date || ""],
                    ["Surveyed by", info.by || ""], ["Notes", info.notes || ""]];
  const wsInfo = XLSX.utils.aoa_to_sheet(infoRows);
  wsInfo["!cols"] = [{ wch: 14 }, { wch: 46 }];
  XLSX.utils.book_append_sheet(wb, wsInfo, "Info");

  const aoa = [HEADERS].concat(rows.map(r => FIELDS.map(f => r[f] ?? "")));
  const wsEq = XLSX.utils.aoa_to_sheet(aoa);
  wsEq["!cols"] = [10, 16, 26, 12, 12, 13, 14, 30].map(w => ({ wch: w }));
  wsEq["!freeze"] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, wsEq, "Equipment");

  if (howTo && howTo.length) {
    const wsHow = XLSX.utils.aoa_to_sheet(howTo.map(l => [l]));
    wsHow["!cols"] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, wsHow, "How to fill");
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true });
}
