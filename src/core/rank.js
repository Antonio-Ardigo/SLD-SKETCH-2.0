/* The rank solver: which row of the drawing every ranked item sits on.
 *
 * Rules (src/core/rules/) say things like "C sits below P" or "A and B share
 * a row"; this turns those constraints into one integer rank per node, the
 * smallest that satisfies every constraint (longest path from the top).
 *
 *   constraints: [{ kind: "below", a, b, gap, by }]   rank[a] >= rank[b] + gap
 *                [{ kind: "same",  a, b, by }]        rank[a] == rank[b]
 *   solveRanks(nodes, constraints) → { rank: Map<id, int>, dropped: [constraint] }
 *
 * A contradiction (a cycle of "below"s that does not collapse under "same")
 * cannot be drawn; the constraint that closes the cycle is dropped and
 * returned in `dropped`, so the caller can report it. Ranks start at 0 and
 * are contiguous only where content puts something on the row — the band
 * layer decides what an empty rank means. */

export function solveRanks(nodes, constraints) {
  const ids = [...nodes];
  /* union-find over "same" */
  const parent = new Map(ids.map(id => [id, id]));
  const find = x => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  for (const c of constraints) if (c.kind === "same" && parent.has(c.a) && parent.has(c.b)) union(c.a, c.b);

  /* weighted DAG between components: comp(b) → comp(a) with weight gap */
  const comps = new Set(ids.map(find));
  const out = new Map([...comps].map(c => [c, []]));
  const belows = constraints.filter(c => c.kind === "below" && parent.has(c.a) && parent.has(c.b));
  const dropped = [];
  for (const c of belows) {
    const ca = find(c.a), cb = find(c.b);
    if (ca === cb) { if (c.gap > 0) dropped.push(c); continue; }   /* "below" inside one row: contradiction */
    out.get(cb).push({ to: ca, gap: c.gap, c });
  }
  /* break cycles: DFS, drop the edge that closes a cycle */
  const state = new Map();   /* 0 = new, 1 = on stack, 2 = done */
  const dfs = u => {
    state.set(u, 1);
    for (const e of out.get(u).slice()) {
      const s = state.get(e.to) || 0;
      if (s === 1) { dropped.push(e.c); out.set(u, out.get(u).filter(x => x !== e)); continue; }
      if (s === 0) dfs(e.to);
    }
    state.set(u, 2);
  };
  for (const c of comps) if (!state.get(c)) dfs(c);

  /* longest path from the roots (topological order by Kahn) */
  const indeg = new Map([...comps].map(c => [c, 0]));
  for (const c of comps) for (const e of out.get(c)) indeg.set(e.to, indeg.get(e.to) + 1);
  const rank = new Map([...comps].map(c => [c, 0]));
  const queue = [...comps].filter(c => indeg.get(c) === 0);
  while (queue.length) {
    const u = queue.shift();
    for (const e of out.get(u)) {
      rank.set(e.to, Math.max(rank.get(e.to), rank.get(u) + e.gap));
      indeg.set(e.to, indeg.get(e.to) - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  const result = new Map(ids.map(id => [id, rank.get(find(id))]));
  return { rank: result, dropped };
}

/** Group a rank map into bands: [{ rank, nodes: [id…] }] in rank order, empty ranks kept. */
export function bandsOf(rank) {
  const max = Math.max(-1, ...rank.values());
  const bands = [];
  for (let r = 0; r <= max; r++) bands.push({ rank: r, nodes: [...rank].filter(([, v]) => v === r).map(([id]) => id) });
  return bands;
}
