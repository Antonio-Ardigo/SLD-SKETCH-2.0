#!/usr/bin/env node
/* Vendor the page's two typefaces so it needs no network.
 *
 * Fetches the Latin subsets Google Fonts serves for Archivo and IBM Plex Mono
 * into vendor/fonts/, with vendor/fonts/fonts.json describing each face (the
 * family, weight, subset and unicode-range). tools/build-page.mjs turns those
 * into @font-face rules carrying the files as data: URIs, so the single-file
 * page holds its own fonts and asks the network for nothing.
 *
 *   node tools/vendor-fonts.mjs        # refresh (needs the network)
 *
 * Both families are under the SIL Open Font License 1.1 (vendor/fonts/LICENSE.md).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "vendor", "fonts");
const QUERY = "family=Archivo:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap";
const KEEP = ["latin", "latin-ext"];            /* western European; the rest falls back to a system font */
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const get = async (url, bin = false) => {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return bin ? Buffer.from(await r.arrayBuffer()) : r.text();
};

const css = await get(`https://fonts.googleapis.com/css2?${QUERY}`);
const faces = [];
const re = /\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g;
let m;
while ((m = re.exec(css))) {
  const [, subset, body] = m;
  if (!KEEP.includes(subset)) continue;
  faces.push({
    subset,
    family: /font-family:\s*'([^']+)'/.exec(body)[1],
    weight: +/font-weight:\s*(\d+)/.exec(body)[1],
    stretch: (/font-stretch:\s*([^;]+);/.exec(body) || [, null])[1],
    unicodeRange: /unicode-range:\s*([^;]+);/.exec(body)[1].trim(),
    url: /url\((https:[^)]+\.woff2)\)/.exec(body)[1],
  });
}
if (!faces.length) throw new Error("no latin subsets in the stylesheet");

fs.mkdirSync(DIR, { recursive: true });
for (const f of fs.readdirSync(DIR)) if (f.endsWith(".woff2")) fs.unlinkSync(path.join(DIR, f));
let bytes = 0;
for (const f of faces) {
  f.file = `${f.family.replace(/\s+/g, "")}-${f.weight}-${f.subset}.woff2`;
  const buf = await get(f.url, true);
  fs.writeFileSync(path.join(DIR, f.file), buf);
  bytes += buf.length;
  console.log(`${f.file.padEnd(34)} ${(buf.length / 1024).toFixed(1)} kB`);
  delete f.url;
}
fs.writeFileSync(path.join(DIR, "fonts.json"), JSON.stringify({ query: QUERY, faces }, null, 2) + "\n");
console.log(`\n${faces.length} faces, ${(bytes / 1024).toFixed(0)} kB — build the page to embed them`);
