/* What the Protection cell may say — one table, read by the page's picker.
 *
 * `PROT_ALIASES` (types.js) says what a written word *means*: it turns
 * "MCCB" into the breaker glyph. It is a reader, and a reader is a bad
 * offer-list — it holds every spelling of every word, "switch fuse" beside
 * "switch-fuse", and says nothing about which of them a surveyor standing in
 * front of an MV ring main unit would reach for.
 *
 * This says what is worth offering, and in what order for a row of a given
 * Type. Same shape as `supplies.js`, and the same promise: the usual first,
 * then the rest, and **nothing is hidden** — the order is the advice, not a
 * rule. A surveyor may still type a word that is not here; the reader judges
 * it, and `UNKNOWN_PROT` says so.
 *
 * The one thing this file must never do is offer a word the reader does not
 * know — the page would then be proposing its own warning. `test/protection.
 * test.js` holds that line.
 *
 *   PROT_LABELS          every device worth writing, with what it is
 *   protCandidates(type, variant) → [{value, label, rank}] best first
 */
import { MV_INCOMER, RMU, MV_BUSBAR, TRANSFORMER, PUMP, GENERATOR, LV_BUSBAR, FEEDER, MCC, BUS_COUPLER, CAPACITOR, EARTHING, ARRESTER } from "./types.js";

/* The words offered, in the order a device list is usually written: the
   breakers by size, then the switches, the fuses, the starters, and last the
   honest "there is one, I did not get its type". Every entry is a key of
   PROT_ALIASES. */
export const PROT_LABELS = [
  ["ACB", "air circuit breaker, a board incomer"],
  ["CB", "circuit breaker"],
  ["MCCB", "moulded-case breaker, a way out of a board"],
  ["MCB", "miniature breaker, a small way"],
  ["VCB", "vacuum breaker, MV"],
  ["RCBO", "breaker with earth-leakage protection"],
  ["LBS", "load-break switch"],
  ["Isolator", "disconnector: isolates, does not break load"],
  ["Fuse", "fuse"],
  ["Fuse-switch", "switch-fuse unit"],
  ["Contactor", "contactor, a motor starter"],
  ["Fuse-contactor", "fused contactor, an MV motor starter"],
  ["Motor starter", "fused contactor"],
  ["Unknown", "a device is there, its type was not recorded"],
];

/* What each Type usually carries, best first. An empty list is not "nothing
   may be written" — it is "the engine has nothing to suggest here". */
export const USUAL_PROT = {
  /* an incomer's protection is on the utility side and is not drawn
     (PROT_ON_INCOMER says so), so nothing is promoted */
  [MV_INCOMER]:  [],
  [MV_BUSBAR]:   ["VCB", "CB", "LBS"],
  [RMU]:         ["LBS", "Fuse-switch", "VCB", "CB"],
  [TRANSFORMER]: ["Fuse-switch", "VCB", "CB", "LBS", "Fuse"],
  [GENERATOR]:   ["ACB", "CB"],
  [LV_BUSBAR]:   ["ACB", "CB", "MCCB", "LBS"],
  [MCC]:         ["MCCB", "CB", "ACB"],
  [PUMP]:        ["Contactor", "Fuse-contactor", "MCCB", "CB"],
  [FEEDER]:      ["MCCB", "MCB", "CB", "Fuse", "LBS", "RCBO"],
  [BUS_COUPLER]: ["ACB", "CB", "LBS"],
  [CAPACITOR]:   ["Contactor", "MCCB", "Fuse"],
  [EARTHING]:    ["LBS", "Fuse-switch"],
  [ARRESTER]:    ["LBS", "Isolator"],
};

/* A symbol variant keeps its family's behaviour but not its switchgear: a UPS
   is wired like a transformer and protected like a board way. */
const VARIANT_PROT = {
  "ups":      ["MCCB", "CB", "ACB", "Fuse"],
  "inverter": ["MCCB", "CB", "Fuse"],
  "battery":  ["MCCB", "CB", "Fuse"],
  "dc":       ["MCCB", "MCB", "CB", "Fuse"],
};

/** How well `label` suits a `type` (with its symbol `variant`): 2 usual, 1 possible. */
export function protRank(type, label, variant = null) {
  const usual = (variant && VARIANT_PROT[variant]) || USUAL_PROT[type] || [];
  return usual.includes(label) ? 2 : 1;
}

/**
 * Every device worth writing for a row of this Type, best first: the ones
 * that Type usually carries in the order above, then the rest of the
 * vocabulary in `PROT_LABELS` order. Nothing is left out — a fuse on a board
 * incomer is unusual, not forbidden, and the list says which it is.
 *
 * An empty cell is not in the list because it is not a device: on a feeder it
 * is the whole point (the way carries no device of its own and whatever hangs
 * on it carries the only one), and everywhere else the row's own default is
 * drawn. "Unknown" is the entry for a device that is there but unidentified.
 */
export function protCandidates(type, variant = null) {
  const usual = (variant && VARIANT_PROT[variant]) || USUAL_PROT[type] || [];
  return PROT_LABELS
    .map(([value, what], at) => {
      const pref = usual.indexOf(value), rank = pref < 0 ? 1 : 2;
      /* "unusual here" is a comparison, so it is only said when there is
         something to compare against: a Type with no usual gear (an MV
         incomer, whose device is on the utility side and is not drawn) makes
         nothing unusual, and neither does "Unknown", which is the answer
         when the question cannot be answered */
      const odd = rank === 1 && usual.length && value !== "Unknown";
      return { value, rank, label: what + (odd ? " — unusual here" : ""),
        _pref: pref < 0 ? usual.length : pref, _at: at };
    })
    .sort((a, b) => b.rank - a.rank || a._pref - b._pref || a._at - b._at)
    .map(({ value, rank, label }) => ({ value, rank, label }));
}
