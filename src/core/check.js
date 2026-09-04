/* The drawing checked against the table, from the scene (no SVG parsing).
 *
 * What it verifies — the same questions sld_check.py asked:
 *   items     every row with a symbol is drawn (a group with symbol geometry)
 *   edges     every Feeds From edge is a continuous conductor between the two
 *             symbols: "connected" directly, "via" when the only path runs
 *             through a third item's symbol, "disconnected" otherwise
 *   overlaps  conductors drawn on top of each other (collinear, > 4 px)
 *   falseNets drawn nets that join rows the table keeps apart
 *
 * How: conductors (axis-aligned lines that are not device glyphs) become a
 * graph — endpoints snapped together, an endpoint on another conductor's
 * interior joins it, a device zone bridges the two conductor ends it
 * interrupts. Each item's symbol geometry (bars, circles, boxes, glyph
 * lines, arrows) claims the conductor ends that touch it, and a bar's own
 * nodes belong to the bar. Then paths are searched between items. */
import { BUS_COUPLER, FEEDER, PUMP, MCC, LV_BUSBAR, TRANSFORMER } from "./types.js";
import { txBoard, subBoardsOf } from "./layout.js";
import { couplerOf } from "./couplers.js";

const TOL = 1.0, TOUCH = 2.2, LONG = 20;
const isWireWidth = w => Math.abs(w - 2) < 0.01 || Math.abs(w - 5.5) < 0.01 || Math.abs(w - 3.4) < 0.01 || Math.abs(w - 3) < 0.01;
const isBar = l => Math.abs(l.w - 5.5) < 0.01 || Math.abs(l.w - 3.4) < 0.01 || Math.abs(l.w - 3) < 0.01;
const axis = l => Math.abs(l.x1 - l.x2) < 0.01 ? "v" : Math.abs(l.y1 - l.y2) < 0.01 ? "h" : null;
const len = l => Math.hypot(l.x2 - l.x1, l.y2 - l.y1);

/* ---- point index with snapping ---------------------------------------- */
class Nodes {
  constructor() { this.pts = []; this.cells = new Map(); this.adj = []; this.owner = []; }
  _key(x, y) { return `${Math.floor(x / 2)}|${Math.floor(y / 2)}`; }
  find(x, y) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const list = this.cells.get(`${Math.floor(x / 2) + dx}|${Math.floor(y / 2) + dy}`);
      if (!list) continue;
      for (const i of list) { const p = this.pts[i]; if (Math.abs(p[0] - x) <= TOL && Math.abs(p[1] - y) <= TOL) return i; }
    }
    return -1;
  }
  node(x, y) {
    let i = this.find(x, y);
    if (i >= 0) return i;
    i = this.pts.length; this.pts.push([x, y]); this.adj.push(new Set()); this.owner.push(new Set());
    const k = this._key(x, y); if (!this.cells.has(k)) this.cells.set(k, []); this.cells.get(k).push(i);
    return i;
  }
  link(a, b) { if (a !== b) { this.adj[a].add(b); this.adj[b].add(a); } }
}

function onSegment(px, py, l, tol = TOL) {
  const a = axis(l); if (!a) return false;
  if (a === "v") return Math.abs(px - l.x1) <= tol && py >= Math.min(l.y1, l.y2) - tol && py <= Math.max(l.y1, l.y2) + tol;
  return Math.abs(py - l.y1) <= tol && px >= Math.min(l.x1, l.x2) - tol && px <= Math.max(l.x1, l.x2) + tol;
}
function distToRectEdge(px, py, r) {
  const inX = px >= r.x - TOUCH && px <= r.x + r.w + TOUCH, inY = py >= r.y - TOUCH && py <= r.y + r.h + TOUCH;
  const d = Math.min(Math.abs(py - r.y), Math.abs(py - (r.y + r.h)), Math.abs(px - r.x), Math.abs(px - (r.x + r.w)));
  return inX && inY ? d : Infinity;
}
function touchesSymbol(px, py, prim) {
  if (prim.t === "circle") return Math.abs(Math.hypot(px - prim.x, py - prim.y) - prim.r) <= TOUCH;
  if (prim.t === "rect") return distToRectEdge(px, py, prim) <= TOUCH;
  if (prim.t === "line") return onSegment(px, py, prim, TOUCH) || Math.hypot(px - prim.x1, py - prim.y1) <= TOUCH || Math.hypot(px - prim.x2, py - prim.y2) <= TOUCH;
  if (prim.t === "poly") return prim.pts.some(([x, y]) => Math.hypot(px - x, py - y) <= TOUCH) || Math.abs(py - Math.min(...prim.pts.map(p => p[1]))) <= TOUCH && px >= Math.min(...prim.pts.map(p => p[0])) - TOUCH && px <= Math.max(...prim.pts.map(p => p[0])) + TOUCH;
  return false;
}

/** Table edges as the checker judges them: [from, to, label]. */
export function expectedEdges(items, order) {
  const out = [];
  for (const id of order) {
    const it = items[id];
    if (it.type === BUS_COUPLER) {
      /* what a coupler ties is the rule's judgement, not a second opinion */
      const k = couplerOf(items, it);
      if (k.a && k.b) out.push([k.a, k.b, id]);
      continue;
    }
    for (const p of it.parents) {
      if (!items[p]) continue;
      let from = p;
      /* a motor or MCC named on a transformer that feeds a board is a way of that board */
      if ([PUMP, MCC].includes(it.type) && items[p].type === TRANSFORMER) { const b = txBoard(items, items[p]); if (b) from = b.id; }
      /* a feeder that only carries on to sub-boards is a link, not a symbol: judge board → sub-board */
      if (items[p].type === FEEDER && it.type === LV_BUSBAR) {
        const pb = items[p].parents.map(q => items[q]).find(o => o && o.type === LV_BUSBAR);
        if (pb) { out.push([pb.id, id, `${p}`]); continue; }
      }
      out.push([from, id, null]);
    }
  }
  return out;
}

/** Rows that stand for a connection, not a symbol. */
export function linkRows(items, order) {
  const s = new Set();
  for (const id of order) {
    const it = items[id];
    if (it.type === BUS_COUPLER) s.add(id);
    if (it.type === FEEDER && subBoardsOf(items, order, it).length) s.add(id);
  }
  return s;
}

export function checkScene(scene, items, order) {
  const ops = scene.ops.filter(o => o.layer === "drawing");
  const links = linkRows(items, order);
  const symbolItems = order.filter(id => !links.has(id));

  /* conductors and bars */
  const wires = ops.filter(o => o.t === "line" && !o.mark && axis(o) && isWireWidth(o.w));
  const N = new Nodes();
  const ends = wires.map(l => [N.node(l.x1, l.y1), N.node(l.x2, l.y2)]);
  wires.forEach((l, i) => { N.link(ends[i][0], ends[i][1]); l._n = ends[i]; });
  /* an endpoint on another wire's interior joins that wire */
  for (let i = 0; i < wires.length; i++) for (const n of ends[i]) {
    const [px, py] = N.pts[n];
    for (let j = 0; j < wires.length; j++) {
      if (j === i) continue;
      const w = wires[j];
      if (onSegment(px, py, w) && !ends[j].includes(n)) { N.link(n, ends[j][0]); N.link(n, ends[j][1]); w._mid = (w._mid || []).concat(n); }
    }
  }
  /* devices bridge the conductor ends they interrupt */
  for (const d of scene.devices) {
    if (d.layer === "legend") continue;
    const e1 = d.orient === "v" ? [d.x, d.y - d.g] : [d.x - d.g, d.y];
    const e2 = d.orient === "v" ? [d.x, d.y + d.g] : [d.x + d.g, d.y];
    const attach = ([x, y]) => {
      let n = N.find(x, y);
      if (n < 0) {                         /* on a wire's interior (a bus, a bar) */
        const w = wires.find(l => onSegment(x, y, l, TOL + 0.5));
        if (w) { n = N.node(x, y); N.link(n, w._n[0]); N.link(n, w._n[1]); }
      }
      return n;
    };
    const a = attach(e1), b = attach(e2);
    if (a >= 0 && b >= 0) N.link(a, b);
  }

  /* who owns which nodes: bars own their nodes; symbol geometry claims the conductor ends touching it */
  const itemNodes = new Map(symbolItems.map(id => [id, new Set()]));
  const symbolGeom = new Map(symbolItems.map(id => [id, []]));
  for (const o of ops) {
    if (!o.owner || !itemNodes.has(o.owner) || o.mark) continue;
    if (o.t === "line" && isBar(o)) {
      for (const n of o._n || []) itemNodes.get(o.owner).add(n);
      for (const n of o._mid || []) itemNodes.get(o.owner).add(n);
      symbolGeom.get(o.owner).push(o);
    } else if (o.t === "circle" && o.r >= 12) symbolGeom.get(o.owner).push(o);
    else if (o.t === "rect" && !o.dash && o.fill !== "white") symbolGeom.get(o.owner).push(o);
    else if (o.t === "poly") symbolGeom.get(o.owner).push(o);
    else if (o.t === "line" && !axis(o) === false && Math.abs(o.w - 2.5) < 0.01) symbolGeom.get(o.owner).push(o);   /* capacitor plates */
  }
  for (const [id, geom] of symbolGeom) {
    if (!geom.length) continue;
    for (let n = 0; n < N.pts.length; n++) {
      const [px, py] = N.pts[n];
      if (geom.some(g => g.t !== "line" || !isBar(g) ? touchesSymbol(px, py, g) : false)) itemNodes.get(id).add(n);
    }
  }
  for (const [id, set] of itemNodes) for (const n of set) N.owner[n].add(id);

  /* A link row draws a conductor rather than a symbol of its own, so it has no
     symbol geometry to look for — but it must still have reached the sheet.
     Without this, a coupler the drawing skipped was invisible to the checker
     as well as to the surveyor, and constitution §6 had no enforcement for the
     one kind of row that was breaking it. */
  const grouped = new Set(scene.groups.map(g => g.id));
  const placed = id => items[id].x !== null;
  const linkItems = [...links].filter(placed);
  const drawn = symbolItems.filter(id => symbolGeom.get(id).length > 0).concat(linkItems.filter(id => grouped.has(id)));
  const missing = symbolItems.filter(id => !symbolGeom.get(id).length && placed(id))
    .concat(linkItems.filter(id => !grouped.has(id)));

  /* paths */
  const search = (fromSet, toSet, forbid) => {
    const seen = new Set(fromSet), queue = [...fromSet];
    while (queue.length) {
      const u = queue.shift();
      if (toSet.has(u)) return true;
      for (const v of N.adj[u]) {
        if (seen.has(v)) continue;
        if (!toSet.has(v) && [...N.owner[v]].some(o => forbid.has(o))) continue;
        seen.add(v); queue.push(v);
      }
    }
    return false;
  };
  const edges = { total: 0, connected: 0, via: [], disconnected: [] };
  for (const [a, b, label] of expectedEdges(items, order)) {
    const A = itemNodes.get(a), B = itemNodes.get(b);
    if (!A || !B) continue;
    edges.total++;
    const name = label ? `${a} ~ ${b} (${label})` : `${a} -> ${b}`;
    if (!A.size || !B.size) { edges.disconnected.push(name); continue; }
    const others = new Set(symbolItems.filter(id => id !== a && id !== b));
    if (search(B, A, others)) edges.connected++;
    else if (search(B, A, new Set())) edges.via.push(name);
    else edges.disconnected.push(name);
  }

  /* overlaps: collinear conductors on top of each other */
  const conductors = wires.filter(l => Math.abs(l.w - 2) < 0.01 && len(l) > LONG);
  let overlaps = 0; const overlapList = [];
  for (let i = 0; i < conductors.length; i++) for (let j = i + 1; j < conductors.length; j++) {
    const a = conductors[i], b = conductors[j], ax = axis(a);
    if (ax !== axis(b)) continue;
    if (ax === "v" && Math.abs(a.x1 - b.x1) > 0.5) continue;
    if (ax === "h" && Math.abs(a.y1 - b.y1) > 0.5) continue;
    const span = l => ax === "v" ? [Math.min(l.y1, l.y2), Math.max(l.y1, l.y2)] : [Math.min(l.x1, l.x2), Math.max(l.x1, l.x2)];
    const [a0, a1] = span(a), [b0, b1] = span(b);
    const lo = Math.max(a0, b0), hi = Math.min(a1, b1);
    if (hi - lo > 4) { overlaps++; overlapList.push(`${ax} ${ax === "v" ? a.x1 : a.y1} ${lo.toFixed(0)}–${hi.toFixed(0)} (${a.owner || "?"} / ${b.owner || "?"})`); }
  }

  /* false nets: a drawn net joining rows the table keeps apart */
  const comp = new Map();
  const find = x => { while (comp.get(x) !== x) { comp.set(x, comp.get(comp.get(x))); x = comp.get(x); } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) comp.set(rb, ra); };
  for (const id of symbolItems) comp.set(id, id);
  for (const [a, b] of expectedEdges(items, order)) if (comp.has(a) && comp.has(b)) union(a, b);
  /* siblings on one supply share a net through it already; nothing more to add */
  const netOf = new Map();
  for (let n = 0; n < N.pts.length; n++) netOf.set(n, n);
  const nfind = x => { while (netOf.get(x) !== x) { netOf.set(x, netOf.get(netOf.get(x))); x = netOf.get(x); } return x; };
  for (let n = 0; n < N.pts.length; n++) for (const v of N.adj[n]) { const a = nfind(n), b = nfind(v); if (a !== b) netOf.set(b, a); }
  const netItems = new Map();
  for (const [id, set] of itemNodes) for (const n of set) { const r = nfind(n); if (!netItems.has(r)) netItems.set(r, new Set()); netItems.get(r).add(id); }
  let falseNets = 0; const falseList = [];
  for (const set of netItems.values()) {
    const comps = new Set([...set].map(find));
    if (comps.size > 1) {
      /* a transformer stands between its two sides: those meet in one drawn net legitimately? No — the
         supply side ends at the top circle and the load side starts at the bottom one; both touch the
         transformer's node, so they are one net through the item. Only rows with no table connection count. */
      const groups = [...comps].map(c => [...set].filter(id => find(id) === c));
      const joined = groups.every(g => g.length);
      if (joined) { falseNets++; falseList.push(groups.map(g => g.join(",")).join(" ~ ")); }
    }
  }

  return {
    items: { drawn: drawn.length, total: symbolItems.length + linkItems.length, missing },
    edges, overlaps, overlapList, falseNets, falseList,
    clean: !missing.length && !edges.via.length && !edges.disconnected.length && !overlaps && !falseNets,
  };
}

/** One-line scorecard, like sld_check's. */
export function formatCheck(c) {
  return `items ${c.items.drawn}/${c.items.total}  edges ${c.edges.connected}/${c.edges.total}` +
    (c.edges.via.length ? `  via ${c.edges.via.length}` : "") +
    (c.edges.disconnected.length ? `  disconnected ${c.edges.disconnected.length}` : "") +
    `  overlaps ${c.overlaps}  false nets ${c.falseNets}` + (c.clean ? "  clean" : "");
}
