/* The rules: each one looks at the graph and says what it knows.
 *
 * A rule is { name, apply(ctx) }. `ctx` carries the model, the graph, the
 * legacy predicates already computed once, the facts being built, and two
 * emitters: ctx.below(a, b, gap) / ctx.same(a, b) push rank constraints for
 * src/core/rank.js, ctx.tag(id, tag) marks a node. Rules run in this order;
 * later rules may read what earlier ones recorded in ctx.facts. */
import sources from "./sources.js";
import levels from "./levels.js";
import rings from "./rings.js";
import lvRows from "./lv-rows.js";
import txDirection from "./tx-direction.js";
import couplers from "./couplers.js";
import supplies from "./supplies.js";

export const RULES = [levels, rings, sources, lvRows, txDirection, couplers, supplies];

export function runRules(ctx) {
  for (const rule of RULES) {
    ctx.rule = rule.name;
    rule.apply(ctx);
  }
  ctx.rule = null;
  return ctx;
}
