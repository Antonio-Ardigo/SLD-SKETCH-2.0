/* Run the engine exactly as the single-file page ships it.
 *
 * tools/build-page.mjs concatenates the ES modules into the <script> of
 * sld_sketchpad.html. This module slices that script's engine part (from the
 * "types" banner to the "presets" banner), evaluates it in a bare VM context
 * and exposes the same API as src/core/pipeline.js, so a test can prove the
 * bundle draws what the modules draw. */
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

export function engineSource(html = fs.readFileSync(PAGE, "utf8")) {
  const a = html.indexOf(START), b = html.indexOf(END);
  if (a < 0 || b < 0 || b < a) throw new Error("engine markers not found in sld_sketchpad.html");
  return html.slice(a, b);
}

export function loadEngine() {
  if (cached) return cached;
  const wrapper = `"use strict";\n${engineSource()}\n;({ buildModel, layout, render, renderDxf, applyView, normalizeView })`;
  cached = vm.runInContext(wrapper, vm.createContext({ console }), { filename: "sld_sketchpad.html#engine" });
  return cached;
}

/** Same shape as pipeline.draw(). */
export function drawWithBundle(info, rows, { dxf = false, view = null } = {}) {
  const E = loadEngine();
  E.applyView(E.normalizeView(view));
  const norm = rows.map(r => Object.fromEntries(["id", "type", "desc", "rating", "voltage", "prot", "from", "notes"].map(f => [f, r[f] == null ? "" : String(r[f])])));
  const site = { site: "", date: "", by: "", notes: "", ...(info || {}) };
  const { items, order, errors, warnings } = E.buildModel(norm);
  const out = { errors, warnings, items, order, svg: null, dxf: null };
  if (errors.length || !order.length) return out;
  const drawn = warnings.slice();
  out.svg = E.render(site, items, order, E.layout(items, order), drawn);
  for (const msg of drawn.slice(warnings.length)) warnings.push(msg);
  if (dxf) { const m2 = E.buildModel(norm); out.dxf = E.renderDxf(site, m2.items, m2.order, E.layout(m2.items, m2.order)); }
  return out;
}
