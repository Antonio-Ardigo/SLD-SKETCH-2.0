/* The engine as one call: table rows → drawing.
 *
 *   const out = draw(info, rows, { dxf: true });
 *   out.errors / out.warnings   messages from the reader (buildModel)
 *   out.items / out.order       the model
 *   out.svg                     the SVG document (null only for an empty table)
 *   out.dxf                     the R12 DXF text when asked for
 *   out.pdf                     the one-page A3 PDF when asked for
 *
 * This is the only entry point the page, the CLI and the tests use. */
import { buildModel } from "./model.js";
import { layout } from "./layout.js";
import { render } from "./render.js";
import { renderDxf } from "./dxf.js";
import { renderPdf } from "./pdf.js";
import { buildGraph } from "./graph.js";
import { buildFacts } from "./facts.js";
import { makeDiag } from "./diagnostics.js";
import { couplerDiagnostics } from "./couplers.js";
import { SceneCanvas } from "./scene.js";
import { checkScene } from "./check.js";
import { applyView } from "./geometry.js";
import { normalizeView } from "./views.js";

export const ROW_FIELDS = ["id", "type", "desc", "rating", "voltage", "prot", "from", "notes"];

/** Every field present as a string (the reader trims and splits them itself). */
export function normalizeRows(rows) {
  return rows.map(r => {
    const o = {};
    for (const f of ROW_FIELDS) o[f] = r[f] == null ? "" : String(r[f]);
    return o;
  });
}

export function draw(info, rows, { dxf = false, pdf = false, check = false, view = null } = {}) {
  const norm = normalizeRows(rows);
  applyView(normalizeView(view));       /* the view in force for this drawing (default: the historical geometry) */
  const site = { site: "", date: "", by: "", notes: "", ...(info || {}) };
  const { items, order, errors, warnings, diagnostics } = buildModel(norm);
  const out = { errors, warnings, diagnostics: diagnostics.slice(), items, order, graph: null, facts: null, svg: null, dxf: null, pdf: null };
  if (!order.length) { out.diagnostics.push(makeDiag("EMPTY_SHEET", [], "The table has no rows with an ID.")); return out; }
  out.graph = buildGraph(items, order);
  /* errors do not withhold the drawing (constitution §6): a duplicate row was
     dropped and named, an unknown supply left the row floating and named */
  out.facts = buildFacts(items, order, out.graph);
  /* the couplers, judged once and said once — the drawing no longer words
     these and the reader no longer recovers the code from the wording */
  for (const d of couplerDiagnostics(items, order)) { out.diagnostics.push(d); warnings.push(d.message); }
  for (const d of out.facts.dropped)
    out.diagnostics.push(makeDiag("RANK_CYCLE", [d.a, d.b], `"${d.a}" and "${d.b}" cannot both be below each other — one of them is drawn on the row above the other.`));
  const width = layout(items, order);
  const canvas = new SceneCanvas();
  out.svg = render(site, items, order, width, canvas);
  out.scene = canvas.scene();
  if (check) out.check = checkScene(out.scene, items, order);
  /* the page re-reads the model for each export; do the same so no two share state */
  const again = () => { const m = buildModel(norm); return [m.items, m.order, layout(m.items, m.order)]; };
  if (dxf) { const [i2, o2, w2] = again(); out.dxf = renderDxf(site, i2, o2, w2); }
  if (pdf) { const [i2, o2, w2] = again(); out.pdf = renderPdf(site, i2, o2, w2); }
  return out;
}
