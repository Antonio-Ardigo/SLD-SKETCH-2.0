/* Compare two SVG documents by the geometry they draw, ignoring grouping.
 *
 * The engine emits flat primitives; wrapping them in <g data-id> changes the
 * text but not the picture. `geometry(svg)` returns the sorted list of
 * primitive elements (line, rect, circle, polygon, text, path) with the
 * <svg> root and every <g> tag removed, so two documents that draw the same
 * marks compare equal whatever their grouping. */
export function geometry(svg) {
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const els = inner.match(/<(?:line|rect|circle|polygon|path)\b[^>]*\/>|<text\b[^>]*>[\s\S]*?<\/text>/g) || [];
  return els.sort();
}

export function sameGeometry(a, b) {
  const ga = geometry(a), gb = geometry(b);
  if (ga.length !== gb.length) return false;
  for (let i = 0; i < ga.length; i++) if (ga[i] !== gb[i]) return false;
  return true;
}

/** The root <svg …> tag (size and viewBox) — must also match. */
export function rootTag(svg) { return (svg.match(/<svg[^>]*>/) || [""])[0]; }
