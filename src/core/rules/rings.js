/* RMUs that feed from each other form a ring and stay on one row — except a
 * branch that reaches no supply of its own (a spur RMU, or a sub-ring fed at
 * both ends from one RMU): that branch hangs one row below the RMU that feeds
 * it. Rings are recorded as the connected components of same-row RMU links;
 * a component with as many links as members (or more) is closed. */
import { RMU } from "../types.js";

export default {
  name: "rings",
  apply(ctx) {
    const { items, order, legacy } = ctx;
    const hang = legacy.hang;
    const rmus = order.filter(id => items[id].type === RMU);
    const links = [];                                   /* same-row RMU–RMU links, once each */
    const seen = new Set();
    for (const id of rmus) {
      for (const p of items[id].parents) {
        if (!items[p] || items[p].type !== RMU) continue;
        if (hang[id] && hang[id].has(p)) continue;      /* written both ways: p hangs off id */
        if (hang[p] && hang[p].has(id)) { ctx.below(id, p, 1); ctx.tag(id, "spur"); ctx.tag(p, "spur-hub"); continue; }
        const key = [id, p].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        links.push([p, id]);
        ctx.same(id, p); ctx.tag(id, "ring"); ctx.tag(p, "ring");
      }
    }
    /* components */
    const comp = new Map();
    const find = x => { while (comp.get(x) !== x) x = comp.get(x); return x; };
    for (const [a, b] of links) { if (!comp.has(a)) comp.set(a, a); if (!comp.has(b)) comp.set(b, b); comp.set(find(a), find(b)); }
    const groups = new Map();
    for (const id of comp.keys()) { const r = find(id); if (!groups.has(r)) groups.set(r, { members: [], links: [] }); groups.get(r).members.push(id); }
    for (const [a, b] of links) groups.get(find(a)).links.push([a, b]);
    /* closed: the links themselves form a cycle, or the chain is fed at both
       ends (two members with a supply that is not an RMU) so the ring closes
       through the board */
    ctx.facts.rings = [...groups.values()].map(g => {
      const anchored = g.members.filter(id => items[id].parents.some(p => items[p] && items[p].type !== RMU));
      return {
        members: order.filter(id => g.members.includes(id)),
        links: g.links,
        closed: g.links.length >= g.members.length || anchored.length >= 2,
        anchored,
        openPoints: g.members.filter(id => /\bn\.?o\.?\b|normally open|ring open/i.test(items[id].notes)),
      };
    });
    ctx.facts.spurs = Object.fromEntries(Object.entries(hang).map(([hub, kids]) => [hub, [...kids]]));
  },
};
