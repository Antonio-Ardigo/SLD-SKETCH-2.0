/* What a bus coupler is — one judgement, read by everything that needs it.
 *
 * A coupler is a link between two busbars of the same kind, or a changeover
 * between a board and a generator. Anything else cannot be drawn as a tie,
 * and draws from the end it does have rather than being dropped
 * (constitution §6).
 *
 * This used to be worked out three times over, and the three disagreed. On
 * `RMU1, RMU2` the rule called it invalid, the drawing skipped the row
 * without a group, and the checker expected a conductor between the two
 * RMUs. On `BB1, BB2, TX1` the rule called it invalid and the drawing drew a
 * perfectly ordinary tie with no message at all, silently dropping `TX1`.
 * Now the rule records what this says, the drawing draws it, and the checker
 * expects it (constitution §5: an inference is named once, not re-derived
 * inside drawing code).
 *
 * It lives beside supplies.js rather than under rules/ because it is
 * knowledge, not a pass: rules/couplers.js is the pass that records it. */
import { BUS_COUPLER, LV_BUSBAR, MV_BUSBAR, GENERATOR, RMU } from "./types.js";
import { makeDiag } from "./diagnostics.js";

const isBusbar = t => t === LV_BUSBAR || t === MV_BUSBAR;

/**
 * What one coupler row is:
 *
 *   { id, kind: "tie" | "changeover", a, b, valid, reason, extra }
 *
 * `a` and `b` are the ends that resolved, in Feeds From order; `b` is null
 * when only one did, and the row still draws from `a` with its other end
 * open. `reason` says what is wrong when it cannot be drawn as a tie:
 *
 *   one-end          the second end is simply not written yet
 *   not-two-busbars  an end that is not a busbar (a transformer, a feeder)
 *   mixed-kinds      an MV bar tied to an LV bar
 *   rmu-end          an RMU: those are tied with interconnecting cables
 *   extra-supply     two good bars, and further supplies that cannot be drawn
 *   no-board         a changeover naming a generator and nothing to change over
 *
 * `extra` lists the supplies that resolved to a row but are not among the
 * ends: they are not drawn, and saying so is the only way the surveyor learns
 * they were ignored.
 */
export function couplerOf(items, bc) {
  const id = bc.id;
  const ends = bc.parents.map(p => items[p]).filter(Boolean);
  const gen = ends.find(e => e.type === GENERATOR);
  if (gen) {
    const board = ends.find(e => [LV_BUSBAR, MV_BUSBAR, RMU].includes(e.type));
    const used = [board && board.id, gen.id].filter(Boolean);
    return { id, kind: "changeover", a: board ? board.id : null, b: gen.id, valid: !!board,
      reason: board ? null : "no-board", extra: bc.parents.filter(p => !used.includes(p)) };
  }
  const bars = ends.filter(e => isBusbar(e.type));
  const pair = bars.length === 2 && bars[0].type === bars[1].type;
  const valid = pair && bc.parents.length === 2;
  const reason = valid ? null
    : ends.some(e => e.type === RMU) ? "rmu-end"
    : pair ? "extra-supply"
    : bars.length === 1 && bc.parents.length <= 1 ? "one-end"
    : bars.length === 2 ? "mixed-kinds"
    : "not-two-busbars";
  const used = bars.slice(0, 2).map(e => e.id);
  return { id, kind: "tie", a: bars[0] ? bars[0].id : null, b: bars[1] ? bars[1].id : null,
    valid, reason, extra: bc.parents.filter(p => !used.includes(p)) };
}

/** Every coupler row on the sheet, judged once, in table order. */
export function couplersOf(items, order) {
  return order.filter(id => items[id].type === BUS_COUPLER).map(id => couplerOf(items, items[id]));
}

/* What the surveyor is told, per reason. Each says what was drawn, because a
   message reading "skipped" beside a row that is on the sheet is worse than
   no message at all. The drawing does not word these: it draws what the
   judgement says, and the judgement says what it means. */
const COUPLER_SAID = {
  "one-end": k => `Bus coupler "${k.id}" names only one busbar — drawn with its other end open.`,
  "not-two-busbars": k => `Bus coupler "${k.id}" should feed from two busbars of the same kind` +
    (k.a ? ` — drawn from "${k.a}" with its other end open.` : " — drawn on its own, both ends open."),
  "mixed-kinds": k => `Bus coupler "${k.id}" ties an MV busbar to an LV one — drawn, but two voltages are joined by a transformer, not a coupler.`,
  "rmu-end": k => `Bus coupler "${k.id}" names an RMU — drawn with its ends open; RMUs are tied with interconnecting cables, so name the other RMU in Feeds from instead.`,
  "extra-supply": k => `Bus coupler "${k.id}" ties "${k.a}" and "${k.b}"; ` +
    `${k.extra.map(e => `"${e}"`).join(", ")} ${k.extra.length === 1 ? "is also named but is" : "are also named but are"} not drawn — a coupler joins two busbars.`,
  "no-board": k => `Changeover "${k.id}" names generator "${k.b}" and no board to change over — drawn with its other end open.`,
};

/** The sentence for a coupler that is not a plain tie, or "" when it is one. */
export function couplerMessage(k) {
  return k.valid || !COUPLER_SAID[k.reason] ? "" : COUPLER_SAID[k.reason](k);
}

/** The diagnostic code a coupler's `reason` belongs to. */
export function couplerCode(k) {
  return k.reason === "extra-supply" ? "COUPLER_EXTRA_SUPPLY" : "COUPLER_INVALID";
}

/**
 * Everything there is to say about the couplers on a sheet, structured.
 *
 * The drawing used to say these itself, in prose, and the reader recovered
 * the code by matching the sentence with a regular expression. Both the page
 * and the command line ask this instead: same judgement, same words, and a
 * code that does not depend on the wording (constitution §5).
 */
export function couplerDiagnostics(items, order) {
  const out = [], seen = new Map();
  for (const k of couplersOf(items, order)) {
    if (!k.valid) { out.push(makeDiag(couplerCode(k), [k.id], couplerMessage(k))); continue; }
    if (k.kind === "changeover") continue;
    const key = [k.a, k.b].sort().join("|"), first = seen.get(key);
    if (first === undefined) { seen.set(key, k.id); continue; }
    out.push(makeDiag("COUPLER_DUP", [k.id, k.a, k.b],
      `Bus coupler "${k.id}" duplicates "${first}" between "${k.a}" and "${k.b}".`));
  }
  return out;
}
