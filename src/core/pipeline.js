/* The engine as one call: table rows → drawing.
 *
 *   const out = draw(info, rows, { dxf: true });
 *   out.errors / out.warnings   messages from the reader (buildModel)
 *   out.items / out.order       the model
 *   out.svg                     the SVG document, or null when errors stop the drawing
 *   out.dxf                     the R12 DXF text when asked for
 *
 * This is the only entry point the page, the CLI and the tests use. */
import { buildModel } from "./model.js";
import { layout } from "./layout.js";
import { render } from "./render.js";
import { renderDxf } from "./dxf.js";

export const ROW_FIELDS = ["id", "type", "desc", "rating", "voltage", "prot", "from", "notes"];

/** Every field present as a string (the reader trims and splits them itself). */
export function normalizeRows(rows) {
  return rows.map(r => {
    const o = {};
    for (const f of ROW_FIELDS) o[f] = r[f] == null ? "" : String(r[f]);
    return o;
  });
}

export function draw(info, rows, { dxf = false } = {}) {
  const norm = normalizeRows(rows);
  const site = { site: "", date: "", by: "", notes: "", ...(info || {}) };
  const { items, order, errors, warnings } = buildModel(norm);
  const out = { errors, warnings, items, order, svg: null, dxf: null };
  if (errors.length || !order.length) return out;
  const width = layout(items, order);
  out.svg = render(site, items, order, width, warnings.slice());
  if (dxf) {
    /* the page re-reads the model for the DXF; do the same so the two never share state */
    const m2 = buildModel(norm);
    const w2 = layout(m2.items, m2.order);
    out.dxf = renderDxf(site, m2.items, m2.order, w2);
  }
  return out;
}
