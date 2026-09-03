/* View options — constitution §4: a view changes the drawing, never the data
 * or the graph. They are applied after the graph and its facts exist, are
 * stored beside the table (never in it), and are never exported with it.
 *
 *   spacing     "compact" | "normal" | "wide"   horizontal pitch of ways and boards
 *   legend      true | false                    the legend strip under the sheet
 *   titleBlock  true | false                    the title block at the bottom right
 *
 * Adding an option: add it here with its default, read it where the drawing
 * is made (geometry/layout/render), and extend test/views.test.js — the test
 * proves the graph and the facts are the same under every value. */
export const VIEW_DEFAULTS = Object.freeze({ spacing: "normal", legend: true, titleBlock: true });
export const VIEW_OPTIONS = Object.freeze({
  spacing: ["compact", "normal", "wide"],
  legend: [true, false],
  titleBlock: [true, false],
});

/** A complete, valid view from a partial one (unknown keys and values dropped). */
export function normalizeView(v) {
  const out = { ...VIEW_DEFAULTS };
  if (!v || typeof v !== "object") return out;
  if (VIEW_OPTIONS.spacing.includes(v.spacing)) out.spacing = v.spacing;
  if (typeof v.legend === "boolean") out.legend = v.legend;
  if (typeof v.titleBlock === "boolean") out.titleBlock = v.titleBlock;
  return out;
}

export function isDefaultView(v) {
  const n = normalizeView(v);
  return Object.keys(VIEW_DEFAULTS).every(k => n[k] === VIEW_DEFAULTS[k]);
}
