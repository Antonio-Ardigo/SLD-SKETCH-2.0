/* The network as a graph — constitution §3: a pure function of (ID, Feeds From).
 *
 *   Graph = { nodes: Map<id, Node>, edges: [Edge], out: Map<id,[Edge]>, in: Map<id,[Edge]>,
 *             primaryParent: Map<id, id|null>, roots: [id] }
 *   Node  = { id, type }                 type is carried along for the rules, never read here
 *   Edge  = { id: "A->B", from, to, index, prot, tags: Set }
 *
 * Direction is supply → load: `from` is the item named in `to`'s Feeds From.
 * `index` is the position in that Feeds From list, `prot` the protection
 * entry that matches it. A supply that is not on the sheet still gets a
 * node-less edge (`from` unknown), so the reader's UNKNOWN_SUPPLY error and
 * the graph agree. Nothing here reads Type, Voltage, Description or Notes to
 * decide connectivity. */
import { protFor } from "./types.js";

export function buildGraph(items, order) {
  const nodes = new Map(), edges = [], out = new Map(), inn = new Map(), primaryParent = new Map();
  for (const id of order) {
    nodes.set(id, { id, type: items[id].type });
    out.set(id, []); inn.set(id, []);
  }
  for (const id of order) {
    const it = items[id];
    primaryParent.set(id, it.parents.length ? it.parents[0] : null);
    it.parents.forEach((p, index) => {
      const e = { id: `${p}->${id}`, from: p, to: id, index, prot: protFor(it, p), tags: new Set() };
      edges.push(e);
      inn.get(id).push(e);
      if (out.has(p)) out.get(p).push(e);
    });
  }
  const roots = order.filter(id => !items[id].parents.length);
  return { nodes, edges, out, in: inn, primaryParent, roots };
}

/** A stable, comparable picture of a graph's connectivity (for tests). */
export function graphSignature(g) {
  return {
    nodes: [...g.nodes.keys()],
    edges: g.edges.map(e => `${e.from}->${e.to}#${e.index}`),
    primaryParent: [...g.primaryParent.entries()],
    roots: g.roots.slice(),
  };
}
