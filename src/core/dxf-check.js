/* Read a DXF the writer produced back and look for text that collides:
 * two TEXT entities whose boxes overlap, or a table text crossing a table
 * rule (a LINE on SLD_TABLE). CAD text is set in the STANDARD style with a
 * width factor; the box is estimated the way the writer estimates it. */
import { DXF_TEXT_H, DXF_CHAR_W } from "./dxf.js";

/** DXF text → [{code, value}] pairs, then entities as {type, [code]: value}. */
export function parseEntities(text) {
  const lines = text.split(/\r?\n/);
  const ents = [];
  let cur = null, inEntities = false;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = +lines[i].trim(), value = lines[i + 1];
    if (code === 0 && value === "SECTION") { const name = lines[i + 3]; inEntities = name === "ENTITIES"; }
    if (!inEntities) continue;
    if (code === 0) { if (cur) ents.push(cur); cur = value === "ENDSEC" ? null : { type: value }; continue; }
    if (cur) { if (cur[code] === undefined) cur[code] = value; else if (Array.isArray(cur[code])) cur[code].push(value); else cur[code] = [cur[code], value]; }
  }
  if (cur) ents.push(cur);
  return ents;
}

export function checkDxf(text) {
  const ents = parseEntities(text);
  const texts = ents.filter(e => e.type === "TEXT").map(e => {
    const h = +e[40], s = String(e[1] ?? ""), rot = +(e[50] || 0);
    const w = s.length * h * DXF_CHAR_W / DXF_TEXT_H * DXF_TEXT_H;   /* chars × height × width factor */
    let x = +e[10], y = +e[20];
    const align = +(e[72] || 0);
    if (align === 1) x = +e[11] - w / 2; else if (align === 2) x = +e[11] - w;
    /* rotated labels run down the page: a tall thin box */
    const box = Math.abs(rot % 180) > 45 ? { x: x - h, y: y - w, w: h, h: w } : { x, y, w, h };
    return { s, layer: e[8], box };
  });
  const rules = ents.filter(e => e.type === "LINE" && e[8] === "SLD_TABLE").map(e => ({ x1: +e[10], y1: +e[20], x2: +e[11], y2: +e[21] }));
  const overlaps = [];
  const inter = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++)
    if (inter(texts[i].box, texts[j].box)) overlaps.push([texts[i].s, texts[j].s]);
  const crossings = [];
  for (const t of texts.filter(t => t.layer === "SLD_TABLE")) {
    for (const r of rules) {
      const horizontal = Math.abs(r.y1 - r.y2) < 0.01;
      if (horizontal) { if (r.y1 > t.box.y + 0.5 && r.y1 < t.box.y + t.box.h - 0.5 && Math.max(r.x1, r.x2) > t.box.x && Math.min(r.x1, r.x2) < t.box.x + t.box.w) crossings.push([t.s, "rule"]); }
      else if (r.x1 > t.box.x + 0.5 && r.x1 < t.box.x + t.box.w - 0.5 && Math.max(r.y1, r.y2) > t.box.y && Math.min(r.y1, r.y2) < t.box.y + t.box.h) crossings.push([t.s, "column rule"]);
    }
  }
  return { texts: texts.length, overlaps, crossings, clean: !overlaps.length && !crossings.length };
}
