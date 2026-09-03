/* The symbol registry: one entry per thing the drawing can show, with the
 * glyph drawn the same way wherever it appears — in the legend, in the page's
 * palette, and (through the SVG symbol methods it calls) on the sheet.
 *
 *   { key, label, types: [canonical row types it stands for] | devices: [kinds],
 *     legend: "always" | "when-used" | "never",
 *     draw(svg, cx, ytop, ybot) }          the 30 px tall legend glyph
 *
 * `draw` uses the canvas primitives and composite symbols, so a DXF or scene
 * canvas gets the same marks. The legend lists the "always" entries and the
 * "when-used" ones whose type is on the sheet. */
import { MV_INCOMER, RMU, MV_BUSBAR, TRANSFORMER, PUMP, GENERATOR, LV_BUSBAR, FEEDER, MCC, BUS_COUPLER, CAPACITOR, EARTHING, ARRESTER } from "../types.js";

const yc = (ytop, ybot) => (ytop + ybot) / 2;

export const SYMBOLS = [
  { key: "cb", label: "Circuit breaker", devices: ["cb"], legend: "always",
    draw: (s, cx, yt, yb) => s.drop(cx, yt, yb, "cb") },
  { key: "lbs", label: "Load-break switch", devices: ["lbs"], legend: "always",
    draw: (s, cx, yt, yb) => s.lbs(cx, yt, yb) },
  { key: "fuse", label: "Fuse", devices: ["fuse"], legend: "always",
    draw: (s, cx, yt, yb) => s.drop(cx, yt, yb, "fuse") },
  { key: "fuse-switch", label: "Fuse-switch", devices: ["fuse-switch"], legend: "always",
    draw: (s, cx, yt, yb) => s.fuseSwitch(cx, yt, yb) },
  { key: "contactor", label: "Contactor", devices: ["contactor"], legend: "always",
    draw: (s, cx, yt, yb) => s.drop(cx, yt, yb, "contactor") },
  { key: "fuse-contactor", label: "Fused contactor", devices: ["fuse-contactor"], legend: "always",
    draw: (s, cx, yt, yb) => s.drop(cx, yt, yb, "fuse-contactor") },
  { key: "tx", label: "Transformer", types: [TRANSFORMER], legend: "always",
    draw: (s, cx, yt, yb) => { const y = yc(yt, yb); s.circle(cx, y - 5, 8); s.circle(cx, y + 5, 8); } },
  { key: "gen", label: "Generator", types: [GENERATOR], legend: "always",
    draw: (s, cx, yt, yb) => { const y = yc(yt, yb); s.circle(cx, y, 9); s.text(cx, y + 3.5, "G", { size: 9, bold: true }); } },
  { key: "pump", label: "Pump/motor", types: [PUMP], legend: "always",
    draw: (s, cx, yt, yb) => { const y = yc(yt, yb); s.circle(cx, y, 9); s.text(cx, y + 3.5, "M", { size: 9, bold: true }); } },
  { key: "bus", label: "Busbar", types: [LV_BUSBAR, MV_BUSBAR], legend: "always",
    draw: (s, cx, yt, yb) => { const y = yc(yt, yb); s.line(cx - 14, y, cx + 14, y, 5); } },
  { key: "mcc", label: "MCC", types: [MCC], legend: "always",
    draw: (s, cx, yt, yb) => { const y = yc(yt, yb); s.rect(cx - 11, y - 8, 22, 16, 1.5); s.text(cx, y + 3, "MCC", { size: 6.5 }); } },
  { key: "feeder", label: "Feeder", types: [FEEDER], legend: "always",
    draw: (s, cx, yt, yb) => { s.line(cx, yt + 2, cx, yb - 11); s.arrowDown(cx, yb); } },
  { key: "rmu", label: "RMU/MCC enclosure", types: [RMU], legend: "always",
    draw: (s, cx, yt, yb) => { const y = yc(yt, yb); s.rect(cx - 13, y - 10, 26, 20, 1.2, "4 3"); } },
  { key: CAPACITOR, label: "Capacitor bank", types: [CAPACITOR], legend: "when-used",
    draw: (s, cx, yt) => { s.line(cx, yt, cx, yt + 4); s.capacitor(cx, yt + 4); } },
  { key: EARTHING, label: "Earthing/NER", types: [EARTHING], legend: "when-used",
    draw: (s, cx, yt) => { s.rect(cx - 5, yt, 10, 18); s.line(cx, yt + 18, cx, yt + 22); s.earth(cx, yt + 22); } },
  { key: ARRESTER, label: "Surge arrester", types: [ARRESTER], legend: "when-used",
    draw: (s, cx, yt) => {
      s.rect(cx - 6, yt, 12, 18); s.line(cx, yt + 3, cx, yt + 14);
      s.line(cx - 3, yt + 11, cx, yt + 15); s.line(cx + 3, yt + 11, cx, yt + 15);
      s.line(cx, yt + 18, cx, yt + 22); s.earth(cx, yt + 22);
    } },
  /* not in the legend, but the palette shows them */
  { key: "incomer", label: "MV incomer", types: [MV_INCOMER], legend: "never",
    draw: (s, cx, yt, yb) => { s.line(cx - 11, yt + 3, cx + 11, yt + 3, 3); s.line(cx, yt + 3, cx, yb); } },
  { key: "coupler", label: "Bus coupler", types: [BUS_COUPLER], legend: "never",
    draw: (s, cx, yt, yb) => { const y = yc(yt, yb); s.line(cx - 22, y, cx - 15, y, 4); const g = s.deviceH("cb", cx, y); s.line(cx - 15, y, cx - g, y); s.line(cx + g, y, cx + 15, y); s.line(cx + 15, y, cx + 22, y, 4); } },
];

export const byKey = Object.fromEntries(SYMBOLS.map(e => [e.key, e]));

/** The legend entries for a sheet: the fixed ones plus those whose type is used. */
export function legendEntries(usedTypes) {
  return SYMBOLS.filter(e => e.legend === "always" || (e.legend === "when-used" && usedTypes && e.types.some(t => usedTypes.has(t))))
    .map(e => [e.key, e.label]);
}

/** The registry entry that draws a row type (busbars share one). */
export function symbolForType(type) {
  return SYMBOLS.find(e => e.types && e.types.includes(type)) || null;
}

/** Draw one legend glyph — the same call the legend makes. */
export function drawSymbol(svg, key, cx, ytop, ybot) {
  const e = byKey[key];
  if (e) e.draw(svg, cx, ytop, ybot);
}
