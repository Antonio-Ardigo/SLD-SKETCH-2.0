/* Run the sketchpad's drawing engine in Node.
 *
 * Until the engine is extracted into modules (plan phase 2), the reference
 * implementation is the <script> inside sld_sketchpad.html. This module
 * slices the engine part of that script (types … DXF export, i.e. from the
 * "types" banner to the "presets" banner) and evaluates it in a bare VM
 * context, so the tests draw exactly what the page draws. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..", "..");
export const PAGE = path.join(ROOT, "sld_sketchpad.html");

const START = "/* ------------------------------------------------ types */";
const END = "/* ------------------------------------------------ presets";

let cached = null;

/** Extract the engine source text from the page. */
export function engineSource(html = fs.readFileSync(PAGE, "utf8")) {
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < 0 || b < a) throw new Error("engine markers not found in sld_sketchpad.html");
  return html.slice(a, b);
}

/** Load (once) and return the engine API: { buildModel, layout, render, renderDxf, ... }. */
export function loadEngine() {
  if (cached) return cached;
  const src = engineSource();
  const wrapper = `"use strict";\n${src}\n;({ buildModel, layout, render, renderDxf, SVG, DXF,
     TYPE_LABELS, ALIASES, PROT_ALIASES, TERMINALS, LV_LOADS })`;
  const ctx = vm.createContext({ console });
  cached = vm.runInContext(wrapper, ctx, { filename: "sld_sketchpad.html#engine" });
  return cached;
}

/** Draw one table: returns { svg, dxf?, errors, warnings, items, order }. */
export function draw(info, rows, { dxf = false } = {}) {
  const E = loadEngine();
  const norm = rows.map(r => ({
    id: r.id ?? "", type: r.type ?? "", desc: r.desc ?? "", rating: r.rating ?? "",
    voltage: r.voltage ?? "", prot: r.prot ?? "", from: r.from ?? "", notes: r.notes ?? "",
  }));
  const { items, order, errors, warnings } = E.buildModel(norm);
  const out = { errors, warnings, items, order, svg: null, dxf: null };
  if (errors.length || !order.length) return out;
  const width = E.layout(items, order);
  out.svg = E.render(info, items, order, width, warnings.slice());
  if (dxf) {
    /* the page re-runs the model for DXF; do the same so the two never share state */
    const m2 = E.buildModel(norm);
    const w2 = E.layout(m2.items, m2.order);
    out.dxf = E.renderDxf(info, m2.items, m2.order, w2);
  }
  return out;
}
