/* Bus couplers never rank. This pass records what src/core/couplers.js says
 * about each one as a fact and tags it. What the surveyor is told about them
 * comes from `couplerDiagnostics` in the same module, which the page and the
 * command line both call — the page draws without running the rules, so a
 * message emitted only from here would never reach it. */
import { couplersOf } from "../couplers.js";

export default {
  name: "couplers",
  apply(ctx) {
    const { items, order } = ctx;
    const out = [], seenPairs = new Map();
    for (const rec of couplersOf(items, order)) {
      if (rec.kind === "changeover") { ctx.tag(rec.id, "changeover"); out.push(rec); continue; }
      if (rec.valid) {
        const key = [rec.a, rec.b].sort().join("|");
        rec.duplicate = seenPairs.has(key);
        if (!rec.duplicate) seenPairs.set(key, rec.id);
        ctx.tag(rec.id, rec.duplicate ? "coupler-dup" : "coupler");
      } else ctx.tag(rec.id, "coupler-invalid");
      out.push(rec);
    }
    ctx.facts.couplers = out;
  },
};
