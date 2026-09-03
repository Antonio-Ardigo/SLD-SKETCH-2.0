/* Facts: everything the engine works out about a table, named and in one
 * place (constitution §5). Built from the model and the graph by the rules
 * in src/core/rules/, solved into ranks by src/core/rank.js.
 *
 *   Facts = { rank: {id: n}, bands: [{rank, nodes}], constraints, dropped,
 *             sources, rings, spurs, subBoards, txDir, waysOfBoard,
 *             couplers, supplies, floating, tags: {id: [tag…]} }
 *
 * `legacyRank()` is what today's layout does with its tier and level
 * arithmetic; the rules are written to agree with it on every case in
 * testdata/, which is how the solver was validated before it drives the
 * drawing. */
import { MV_BUSBAR, RMU, LV_BUSBAR, MCC } from "./types.js";
import { mvDepth, rmuHang, levelLinks, stepUps, suMid, lvSubs, genBelow, mvGens } from "./geometry.js";
import { lvLevel, mccLoads } from "./layout.js";
import { childrenOf } from "./model.js";
import { solveRanks, bandsOf } from "./rank.js";
import { runRules } from "./rules/index.js";
import { LV_ROW } from "./rules/lv-rows.js";

/** The legacy predicates, computed once. */
export function legacyFacts(items, order) {
  const depth = mvDepth(items, order);
  return {
    depth, hang: rmuHang(items, order), links: levelLinks(items, order, depth),
    sus: stepUps(items, order), mid: suMid(items, order), lvsubs: lvSubs(items, order),
    gens: mvGens(items, order), genBelow: tx => genBelow(items, order, tx),
  };
}

export function buildFacts(items, order, graph) {
  const legacy = legacyFacts(items, order);
  const facts = { tags: {}, floating: floatingNodes(items, order, graph) };
  const constraints = [];
  const ctx = {
    items, order, graph, legacy, facts, constraints, ranked: new Set(), rule: null,
    below: (a, b, gap = 1) => constraints.push({ kind: "below", a, b, gap, by: ctx.rule }),
    same: (a, b) => constraints.push({ kind: "same", a, b, by: ctx.rule }),
    tag: (id, t) => { (facts.tags[id] = facts.tags[id] || []).includes(t) || facts.tags[id].push(t); },
  };
  runRules(ctx);
  const { rank, dropped } = solveRanks(ctx.ranked, constraints);
  rank.delete(LV_ROW);
  /* ranks start at 0 on the top row that has something on it */
  const min = Math.min(0, ...rank.values());
  if (min < 0) for (const [k, v] of rank) rank.set(k, v - min);
  facts.rank = Object.fromEntries([...rank].filter(([k]) => items[k]));
  facts.bands = bandsOf(new Map(Object.entries(facts.rank))).filter(b => b.nodes.length || true);
  facts.constraints = constraints;
  facts.dropped = dropped;
  return facts;
}

/** Rows no supply reaches: not a root (empty Feeds From, an incomer, a
 *  generator) and not downstream of one. Constitution §6: they still draw. */
export function floatingNodes(items, order, graph) {
  const reached = new Set();
  const stack = order.filter(id => !items[id].parents.length || ["mv incomer", "generator"].includes(items[id].type));
  for (const r of stack) reached.add(r);
  while (stack.length) {
    const u = stack.pop();
    for (const e of graph.out.get(u) || []) if (!reached.has(e.to)) { reached.add(e.to); stack.push(e.to); }
  }
  return order.filter(id => !reached.has(id));
}

/** Today's tier arithmetic as ranks, for the agreement test. */
export function legacyRank(items, order) {
  const { depth, sus } = legacyFacts(items, order);
  const maxD = Math.max(-1, ...Object.values(depth));
  const shift = Object.values(sus).some(Boolean) ? 1 : 0;
  const out = {};
  for (const id of order) {
    const it = items[id];
    if ([MV_BUSBAR, RMU].includes(it.type)) out[id] = depth[id] + shift;
    else if (it.type === LV_BUSBAR || (it.type === MCC && mccLoads(items, order, it).length)) out[id] = maxD + 1 + shift + lvLevel(items, it);
  }
  for (const txId of Object.keys(sus)) {
    const src = sus[txId];
    if (!src) continue;
    const fed = childrenOf(items, order, txId, [MV_BUSBAR, RMU]);
    const off = fed.length ? Math.min(...fed.map(f => depth[f.id])) : 0;
    out[src.id] = off + shift - 1;
  }
  return out;
}
