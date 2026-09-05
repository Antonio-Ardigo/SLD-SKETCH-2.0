#!/usr/bin/env node
/* The proposal audit: what a surveyor has to correct after a drop.
 *
 * Every row a surveyor adds arrives pre-filled by proposeRow — ID, supply,
 * device, voltage — and the page's pickers offer lists for what is left. This
 * builds plausible sites the way a person does (drop the item on its supply,
 * then fill the table), compares each proposal with what the sheet wanted,
 * and ranks the corrections by how often they happen on how plausible a site.
 *
 * It measures; it does not change the engine. Each class of correction ends
 * with the engine change that would remove it, sized, for someone to pick.
 *
 *   node tools/proposal-audit.mjs                 # write testdata/proposals/{audit.json,AUDIT.md,configs/}
 *   node tools/proposal-audit.mjs --check         # exit 1 if audit.json would change
 *   node tools/proposal-audit.mjs --seed 7 --n 50 # another sample
 *
 * Deterministic: the seed is in the header, as are the engine revision and a
 * hash of the pool, so a diff has three possible causes and the header says
 * which. The engine revision is informational and not compared by --check.
 *
 * Provenance. The generated sites carry my grammar's opinion; the pool
 * (tools/lib/pool.mjs) carries what real sheets wrote. Every correction is
 * labelled POOL (the pool agrees with the sheet, not the engine), MIXED,
 * OPINION (only the grammar wanted this) or BLANK (the sheet left it empty —
 * never evidence). Only POOL findings make the headline table.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ROOT } from "./lib/cases.mjs";
import { loadPool, canon, protCanon, share, seen } from "./lib/pool.mjs";
import { generate, ARCHETYPE_LIST } from "./lib/configs.mjs";
import { loadQuick } from "./lib/quick.mjs";
import { buildModel } from "../src/core/model.js";
import { normalizeRows, draw } from "../src/core/pipeline.js";
import { proposeRow, parseVoltage, TYPE_PREFIX } from "../src/core/propose.js";
import { supplyCandidates } from "../src/core/supplies.js";
import { protCandidates } from "../src/core/protection.js";
import { diagKey } from "../src/core/diagnostics.js";
import { TYPE_VARIANTS, idKey } from "../src/core/types.js";
import { rowsToCsv } from "../src/io/csv.js";
import { openPage } from "./lib/headless.mjs";

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const SEED = +(flag("--seed") ?? 2026), N = +(flag("--n") ?? 200);
const CHECK = args.includes("--check");
const OUT = path.resolve(ROOT, flag("--out") ?? "testdata/proposals");

/* ---------------------------------------------------------------- the replay */
const variantOf = t => TYPE_VARIANTS[String(t || "").trim().toLowerCase().replace(/\s+/g, " ")] || null;
const sameVolts = (a, b) => { const x = parseVoltage(a), y = parseVoltage(b); if (!x || !y) return String(a || "").trim() === String(b || "").trim(); return x.primary === y.primary && (x.secondary ?? null) === (y.secondary ?? null); };
const tokens = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
const COST = { blank: 1, wrong: 1.5, over: 1 };

/** The cost of getting `intended` into a cell offered `list`: 0 proposed right, 1 a pick from the top four or a typed value, 2 a pick further down. */
function pickCost(intended, list) {
  const i = list.findIndex(v => v === intended);
  return i < 0 ? { cost: 1, offered: false, rank: null } : { cost: i < 4 ? 1 : 2, offered: true, rank: i + 1 };
}

/**
 * Replay one site: rows in `order`, each dropped on its supply (`drop`) or
 * added from the palette with no target (`click`), the proposal compared with
 * the row the sheet wanted, then the wanted row pushed and the next taken.
 */
export function replay(cfg, orderKey, mode, pool, quick) {
  const order = cfg[orderKey];
  const placed = [], out = [];
  for (const i of order) {
    const row = cfg.rows[i];
    const t = canon(row.type), variant = variantOf(row.type);
    const { items, order: ids } = buildModel(normalizeRows(placed));
    const sup = tokens(row.from), first = sup[0] || "";
    const supRow = first ? placed.find(r => idKey(r.id) === idKey(first)) : null;
    const st = supRow ? canon(supRow.type) : first ? "?" : "(root)";
    /* the board a way leaves — an item dropped on a feeder is really on that board */
    const wayBoard = st === "feeder" ? (() => { const b = placed.find(r => idKey(r.id) === idKey(tokens(supRow.from)[0] || "")); return b ? canon(b.type) : "?"; })() : null;
    const isRoot = !first;
    /* A root has no supply, but a surveyor still drops it somewhere: a genset
       on the board its changeover will tie to, a second incomer nowhere in
       particular. The target is the placed board a later row will join it
       to — the coupler's other end, or the board that names it — else "". */
    let rootTarget = "";
    if (isRoot && mode === "drop") {
      for (const later of cfg.rows) {
        const ts = tokens(later.from); if (!ts.some(x => idKey(x) === idKey(row.id))) continue;
        const other = ts.map(x => placed.find(r => idKey(r.id) === idKey(x))).find(r => r && ["lv busbar", "mv busbar", "rmu", "mcc"].includes(canon(r.type)));
        if (other) { rootTarget = other.id; break; }
      }
    }
    const targetId = mode === "drop" ? (supRow ? supRow.id : rootTarget) : "";
    const p = proposeRow(items, ids, { type: row.type, targetId });
    const rec = (field, cls, kind, extra) => out.push({ cfg: cfg.id, order: orderKey, mode, row: row.id, type: t, supplyType: st, field, cls, kind, ...extra });
    const lab = (field, intended, proposed) => provenance(pool, t, st, field, intended, proposed);

    /* supply */
    if (mode === "click" && !isRoot) {
      const cands = supplyCandidates(items, ids, t);
      const at = cands.findIndex(c => idKey(c.id) === idKey(first));
      const want = cands[at];
      if (idKey(p.from) !== idKey(first)) {
        const got = placed.find(r => idKey(r.id) === idKey(p.from));
        const sameKind = got && canon(got.type) === st;
        rec("from", sameKind ? "SUPPLY_LAST_WINS" : "SUPPLY_RANK", "wrong", { cost: at >= 0 && at < 3 ? 1 : 2, proposed: p.from, intended: first, proposedType: got ? canon(got.type) : "?", rank: at + 1, rankOf: want ? want.rank : null, label: "POOL" });
      }
    }
    if (sup.length > 1) rec("from", "SECOND_SUPPLY", "blank", { cost: 1, proposed: p.from, intended: row.from, label: "POOL" });

    /* device */
    const ic = protCanon(row.prot), pc = protCanon(p.prot);
    const protList = protCandidates(t, variant).map(c => c.value);
    if (ic !== pc) {
      const kind = !row.prot.trim() ? "over" : !p.prot ? "blank" : "wrong";
      let cls = kind === "over" ? "DELETE_PROPOSED" : "PROT_DEFAULT";
      if (st === "feeder" && kind !== "over") cls = "PLACEHOLDER_CHAIN";
      if (t === "rmu" && sup.length > 1 && pc === "lbs" && ic !== "lbs") cls = "SECOND_END_STALE_PROT";
      const pk = pickCost(row.prot.trim(), protList);
      rec("prot", cls, kind, { cost: kind === "over" ? COST.over : Math.max(COST[kind], pk.cost), proposed: p.prot, intended: row.prot, rank: pk.rank, ...lab("prot", row.prot, p.prot) });
      if (row.prot.trim() && !pk.offered && !row.prot.includes(",")) rec("prot", "OFFER_MISS", "info", { cost: 0, intended: row.prot, label: "POOL", poolSeen: seen(pool, t, "prot", row.prot) });
    } else if (row.prot.trim() && row.prot.trim() !== (p.prot || "").trim()) {
      rec("prot", "SPELLING", "spelling", { cost: 0, proposed: p.prot, intended: row.prot, label: "POOL" });
    }

    /* voltage */
    const volt = row.voltage.trim();
    if (!sameVolts(volt, p.voltage)) {
      if (isRoot && !targetId && !p.voltage) rec("voltage", "UNINFERABLE", "blank", { cost: 1, proposed: "", intended: volt, label: "BLANK" });
      else if (t === "transformer" && !p.voltage && (["lv busbar", "mcc"].includes(st) || (st === "feeder" && ["lv busbar", "mcc"].includes(wayBoard))))
        rec("voltage", "DELIBERATE_BLANK", "blank", { cost: 1, proposed: "", intended: volt, ...lab("voltage", volt, "") });
      else if (st === "feeder" && !p.voltage) rec("voltage", "PLACEHOLDER_CHAIN", "blank", { cost: 1, proposed: "", intended: volt, wayBoard, ...lab("voltage", volt, "") });
      else {
        const kind = !volt ? "over" : !p.voltage ? "blank" : "wrong";
        rec("voltage", kind === "over" ? "DELETE_PROPOSED" : "VOLT_DEFAULT", kind, { cost: COST[kind], proposed: p.voltage, intended: volt, ...lab("voltage", volt, p.voltage) });
      }
      if (volt && !quick.quickVolt(row.type).includes(volt)) rec("voltage", "OFFER_MISS", "info", { cost: 0, intended: volt, label: "POOL", poolSeen: seen(pool, t, "voltage", volt) });
    }

    /* rating: never proposed — the cost of filling it, and whether the list had it */
    if (row.rating.trim()) {
      const pk = pickCost(row.rating.trim(), quick.quickRating(row.type));
      rec("rating", "FILL", "fill", { cost: pk.cost, intended: row.rating, rank: pk.rank, label: "POOL" });
      if (!pk.offered) rec("rating", "OFFER_MISS", "info", { cost: 0, intended: row.rating, label: "POOL", poolSeen: seen(pool, t, "rating", row.rating) });
    }
    if (row.desc.trim()) rec("desc", "FILL", "fill", { cost: 1, intended: row.desc, label: "POOL" });
    if (row.notes.trim()) rec("notes", "FILL", "fill", { cost: 1, intended: row.notes, label: "POOL" });

    /* the ID: a site convention, reported once as a table, never a correction */
    const pre = /^[A-Za-z]+/.exec(row.id), ppre = /^[A-Za-z]+/.exec(p.id);
    if (pre && ppre && pre[0].toUpperCase() !== ppre[0].toUpperCase()) rec("id", "ID_PREFIX", "info", { cost: 0, proposed: ppre[0], intended: pre[0].toUpperCase(), label: "POOL" });

    placed.push(row);
  }
  return out;
}

/** POOL / MIXED / OPINION / BLANK for one correction, with the pool shares behind it. */
export function provenance(pool, type, supplyType, field, intended, proposed) {
  if (!String(intended || "").trim()) return { label: "BLANK", poolIntended: 0, poolProposed: 0 };
  const a = share(pool, type, supplyType, field, intended), b = share(pool, type, supplyType, field, proposed);
  /* a share of 1.0 in a slice of two rows is not evidence: POOL needs at least
     three rows behind the slice it is read from */
  const label = a.rows >= 3 && a.fixtures >= 2 && a.share >= 0.25 && a.share > b.share ? "POOL" : a.share >= 0.10 ? "MIXED" : "OPINION";
  return { label, poolIntended: +a.share.toFixed(3), poolProposed: +b.share.toFixed(3), poolRows: a.rows, poolFixtures: a.fixtures };
}

/** The engine's own verdict on a plausible sheet. */
function engineFindings(cfg) {
  const out = draw({ site: cfg.id }, cfg.rows, { check: true });
  const f = [];
  for (const d of out.diagnostics) f.push({ cfg: cfg.id, cls: "ENGINE_WARNING", key: diagKey(d), code: d.code, ids: d.ids, message: d.message });
  for (const e of out.check.edges.disconnected) f.push({ cfg: cfg.id, cls: "DISCONNECTED", key: e });
  for (const e of out.check.edges.via) f.push({ cfg: cfg.id, cls: "VIA", key: e });
  for (const m of out.check.items.missing) f.push({ cfg: cfg.id, cls: "MISSING", key: m });
  if (out.check.overlaps) f.push({ cfg: cfg.id, cls: "OVERLAP", key: String(out.check.overlaps) });
  return f;
}

/* ---------------------------------------------------------------- aggregation */
export const classKey = c => {
  if (["PROT_DEFAULT", "VOLT_DEFAULT", "PLACEHOLDER_CHAIN", "DELETE_PROPOSED", "SECOND_END_STALE_PROT", "DELIBERATE_BLANK"].includes(c.cls))
    return `${c.cls}|${c.type}|${c.supplyType}|${c.field}|${c.field === "prot" ? protCanon(c.proposed) : c.proposed || ""}→${c.field === "prot" ? protCanon(c.intended) : c.intended}`;
  if (c.cls === "OFFER_MISS") return `${c.cls}|${c.type}|${c.field}|${c.intended}`;
  if (c.cls === "ID_PREFIX") return `${c.cls}|${c.type}|${c.proposed}→${c.intended}`;
  if (c.cls === "SPELLING") return `${c.cls}|${c.type}|${c.intended}→${c.proposed}`;
  return `${c.cls}|${c.type}|${c.supplyType}`;
};
const majority = xs => { const n = {}; for (const x of xs) n[x] = (n[x] || 0) + 1; return Object.entries(n).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]; };
const r3 = x => +(+x).toFixed(3);

/**
 * Classes over one set of corrections: breadth = sites affected / sites,
 * depth = mean cost per affected row, potential = breadth × depth × mean P.
 * Σ would let a board with twenty feeders win by volume; this does not.
 */
function aggregate(corrs, cfgById, nCfgs, pool) {
  const by = new Map();
  for (const c of corrs) { const k = classKey(c); if (!by.has(k)) by.set(k, []); by.get(k).push(c); }
  const out = [];
  for (const [key, cs] of by) {
    const cfgs = [...new Set(cs.map(c => c.cfg))];
    const rowsAffected = new Set(cs.map(c => `${c.cfg}|${c.row}`)).size;
    const cost = cs.reduce((a, c) => a + (c.cost || 0), 0);
    const meanP = cfgs.reduce((a, id) => a + cfgById.get(id).P, 0) / cfgs.length;
    const breadth = cfgs.length / nCfgs, depth = rowsAffected ? cost / rowsAffected : 0;
    const label = majority(cs.map(c => c.label || "POOL"));
    const arch = {}; for (const id of cfgs) for (const a of cfgById.get(id).archetypes) arch[a] = (arch[a] || 0) + 1;
    out.push({ key, cls: cs[0].cls, type: cs[0].type, supplyType: cs[0].supplyType, field: cs[0].field,
      proposed: majority(cs.map(c => c.proposed ?? "")), intended: majority(cs.map(c => c.intended ?? "")), kind: majority(cs.map(c => c.kind)), label,
      poolIntended: r3(cs.reduce((a, c) => a + (c.poolIntended || 0), 0) / cs.length), poolProposed: r3(cs.reduce((a, c) => a + (c.poolProposed || 0), 0) / cs.length),
      poolRows: Math.round(cs.reduce((a, c) => a + (c.poolRows || 0), 0) / cs.length), poolFixtures: Math.round(cs.reduce((a, c) => a + (c.poolFixtures || 0), 0) / cs.length),
      rows: cs.length, rowsAffected, sites: cfgs.length, breadth: r3(breadth), depth: r3(depth), meanP: r3(meanP), potential: r3(breadth * depth * meanP),
      archetypes: arch, examples: cfgs.sort((a, b) => cfgById.get(b).P - cfgById.get(a).P).slice(0, 3), change: suggest({ ...cs[0], proposedType: majority(cs.map(c => c.proposedType || "")) }, pool) });
  }
  return out.sort((a, b) => b.potential - a.potential || a.key.localeCompare(b.key));
}

/** The engine change that would remove a class, phrased against docs/EXTENDING.md "A proposal rule". */
function suggest(c, pool) {
  const T = c.type, S = c.supplyType, P = c.proposed || "(blank)", I = c.intended || "(blank)";
  switch (c.cls) {
    case "PROT_DEFAULT":
      if (c.kind !== "blank") return `proposeProt: a ${T} fed from ${S} → ${I} instead of ${P} (one line in the supply-type chain)`;
      if (T === "feeder") return `deliberate: a feeder is proposed blank so that equipment hung on it gets one device, not two (PR #11). The pool writes a device on nearly every way. A way out: propose ${I} on the drop, and clear it when something is dropped onto the feeder while the cell is still the engine's (it is tinted, so the page knows)`;
      return `proposeProt: give a ${T} a default (${I}) — TYPE_DEFAULT_PROT has none`;
    case "VOLT_DEFAULT": return `proposeVoltage: a ${T} fed from ${S} should read ${I}, not ${P} — a case in the supply-type chain`;
    case "PLACEHOLDER_CHAIN": return `proposeProt/proposeVoltage: resolve a Feeder supply to the board it is a way of (layout.feederBoard) before choosing — the way is a placeholder, its board is what the item is really on`;
    case "DELETE_PROPOSED": return `the sheet leaves this ${c.field} empty on a ${T}; a blank is not evidence (one tester's habit), so no change unless the pool's filled cells agree`;
    case "SUPPLY_RANK": {
      const w = (pool && pool.supplies[T]) || {}, wi = w[S] || 0, wp = w[c.proposedType] || 0;
      return wi > wp
        ? `USUAL_SUPPLIES[${T.toUpperCase().replace(" ", "_")}]: put ${S} ahead of ${c.proposedType} — the pool has ${T}s on ${S} ${(wi / (wp || 1e-9)).toFixed(1)}× as often, and defaultSupply lands a palette click on the first usual kind`
        : `no change: the pool has ${T}s on ${c.proposedType} more often than on ${S}, so the click lands on the commoner kind; this one is dropped on its supply instead`;
    }
    case "SUPPLY_LAST_WINS": return `a palette click with nothing selected lands on the bottom-most ${S}; with two on the sheet the surveyor drops the chip, or selects the board first (a click adds under the selected row)`;
    case "SECOND_SUPPLY": return `a second supply is never proposed; the page could offer it when the sheet has exactly two candidates of the same kind (a twin board, a ring's other end)`;
    case "SECOND_END_STALE_PROT": return `re-run proposeProt when Shift-drag adds a second supply: "LBS, LBS" for an RMU is only proposed if the comma is already there at drop time (propose.js:152)`;
    case "DELIBERATE_BLANK": return `proposeVoltage leaves an LV/LV transformer's ratio blank on purpose; if one ratio dominates the pool, propose it`;
    case "UNINFERABLE": return `the first root's voltage cannot be known; the page could remember the last site's level`;
    case "OFFER_MISS": return c.field === "prot" ? `PROT_LABELS (src/core/protection.js): offer the spelling ${I}; the reader already understands it`
      : `QUICK.${c.field === "rating" ? "rating" : "volt"}: add ${I} to the ${T} list (src/ui/app.js)`;
    case "SPELLING": return `the picker offers ${P}; the sheet writes ${I}. Add the spelling to PROT_LABELS or leave it (the reader understands both)`;
    case "ID_PREFIX": return `TYPE_PREFIX["${T}"] is ${P}; this sheet's convention is ${I}. A per-site prefix scheme, not a change of default`;
    case "FILL": return `never proposed; the cost of typing it`;
    default: return "";
  }
}

/* ---------------------------------------------------------------- run */
export function runAudit({ seed = SEED, n = N } = {}) {
  const pool = loadPool(), quick = loadQuick();
  const cfgs = generate(seed, n, pool);
  const ok = cfgs.filter(c => !c.rejected);
  const cfgById = new Map(cfgs.map(c => [c.id, c]));
  const corr = { drop: [], click: [] };
  for (const c of ok) for (const orderKey of ["networkOrder", "surveyOrder"]) for (const mode of ["drop", "click"])
    corr[mode].push(...replay(c, orderKey, mode, pool, quick));
  const engine = ok.flatMap(engineFindings);

  /* a correction that appears in either order counts once per site+row+field */
  const dedupe = cs => { const m = new Map(); for (const c of cs) { const k = `${c.cfg}|${c.row}|${c.field}|${c.cls}`; if (!m.has(k)) m.set(k, c); } return [...m.values()]; };
  const drop = dedupe(corr.drop), click = dedupe(corr.click);
  const isFinding = c => !["FILL", "UNINFERABLE", "SPELLING", "ID_PREFIX", "OFFER_MISS", "DELIBERATE_BLANK"].includes(c.cls);
  const classes = aggregate(drop.filter(isFinding), cfgById, ok.length, pool);
  const clickClasses = aggregate(click.filter(c => isFinding(c) && ["SUPPLY_RANK", "SUPPLY_LAST_WINS"].includes(c.cls)), cfgById, ok.length, pool);
  const first50 = new Set(ok.slice(0, 50).map(c => c.id));
  const classes50 = aggregate(drop.filter(c => isFinding(c) && first50.has(c.cfg)), cfgById, Math.min(50, ok.length, pool));
  const top = xs => xs.slice(0, 10).map(x => x.key);
  const agree = top(classes).filter(k => top(classes50).includes(k)).length;

  /* engine findings, per key */
  const eng = {};
  for (const f of engine) { const k = `${f.cls}|${f.cls === "ENGINE_WARNING" ? f.code : f.key.replace(/[A-Z]+\d+/g, "•")}`; (eng[k] ||= { key: k, cls: f.cls, sites: new Set(), examples: [] }); eng[k].sites.add(f.cfg); if (eng[k].examples.length < 3) eng[k].examples.push(f.cfg + ": " + (f.message || f.key)); }
  const engineClasses = Object.values(eng).map(e => ({ key: e.key, cls: e.cls, sites: e.sites.size, breadth: r3(e.sites.size / ok.length),
    meanP: r3([...e.sites].reduce((a, id) => a + cfgById.get(id).P, 0) / e.sites.size), examples: e.examples })).sort((a, b) => b.sites - a.sites || a.key.localeCompare(b.key));

  /* the information tables */
  const offer = aggregate(drop.filter(c => c.cls === "OFFER_MISS"), cfgById, ok.length, pool).map(o => ({ ...o, poolSeen: seen(pool, o.type, o.field, o.intended) })).sort((a, b) => b.poolSeen - a.poolSeen || b.sites - a.sites || a.key.localeCompare(b.key));
  const deliberate = aggregate(drop.filter(c => c.cls === "DELIBERATE_BLANK"), cfgById, ok.length, pool);
  const uninferable = drop.filter(c => c.cls === "UNINFERABLE").length;
  const spelling = aggregate(drop.filter(c => c.cls === "SPELLING"), cfgById, ok.length, pool);
  const prefixes = {};
  for (const [t, pre] of Object.entries(pool.prefixes)) {
    const label = Object.keys(TYPE_PREFIX).find(l => canon(l) === t && !TYPE_VARIANTS[l.toLowerCase()]) || t;
    prefixes[t] = { engine: TYPE_PREFIX[label] || "?", pool: Object.entries(pre).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p, w]) => `${p} ${r3(w)}`) };
  }
  /* fill cost per row, the baseline's unit */
  const fillRows = new Set(drop.map(c => `${c.cfg}|${c.row}`)).size;
  const fillCost = drop.reduce((a, c) => a + (c.cost || 0), 0);

  /* per archetype: the classes' potential restricted to sites of that shape */
  const perArchetype = {};
  for (const a of ARCHETYPE_LIST) {
    const ids = new Set(ok.filter(c => c.archetypes.includes(a)).map(c => c.id));
    if (!ids.size) continue;
    perArchetype[a] = { sites: ids.size, A: r3(((pool.archetypes[a] || 0) + 1) / (pool.fixtures.length + ARCHETYPE_LIST.length)),
      top: aggregate(drop.filter(c => isFinding(c) && ids.has(c.cfg)), cfgById, ids.size, pool).slice(0, 5).map(x => ({ key: x.key, potential: x.potential, sites: x.sites, label: x.label })) };
  }

  let engineRev = "unknown"; try { engineRev = execSync("git rev-parse --short HEAD", { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch {}
  const header = { tool: "proposal-audit", seed, n, sites: ok.length, rejected: cfgs.length - ok.length, engine: engineRev, poolHash: pool.hash, poolFixtures: pool.fixtures.length, poolGroups: ["sites", "audit", "examples"],
    unit: "cost is in the entry baseline's unit: 1 per value entered or picked from the top four, 2 for a pick further down, 1.5 for a wrong proposal (it can ship), 0 for a right one",
    ranking: "potential = breadth (sites affected / sites) × depth (mean cost per affected row) × mean P of the affected sites; headline is drop mode, both orders; only POOL-labelled classes are high potential",
    sample: { first50TopTenAgree: agree, of: 10 } };
  const configs = cfgs.map(c => ({ id: c.id, archetypes: c.archetypes, rows: c.rows.length, P: +c.P.toFixed(5), A: r3(c.factors.A), C: r3(c.factors.C), V: r3(c.factors.V),
    lowest: c.lowest.check ? `${c.lowest.check} (${c.lowest.rows.join(",")})` : `${c.lowest.factor}`, injected: c.injected, rejected: c.rejected,
    corrections: drop.filter(x => x.cfg === c.id && isFinding(x)).length, fill: r3(drop.filter(x => x.cfg === c.id).reduce((a, x) => a + (x.cost || 0), 0) / c.rows.length) }))
    .sort((a, b) => b.P - a.P || a.id.localeCompare(b.id));
  return { header, configs, classes, clickClasses, engineClasses, offer, deliberate, uninferable, spelling, prefixes,
    fill: { rows: fillRows, cost: r3(fillCost), perRow: r3(fillCost / fillRows) }, perArchetype, cfgs };
}

/* ---------------------------------------------------------------- the report */
function md(res) {
  const h = res.header, L = [];
  const t = (cols, rows) => { L.push("| " + cols.join(" | ") + " |", "|" + cols.map(() => "---").join("|") + "|"); for (const r of rows) L.push("| " + r.map(x => String(x ?? "").replace(/\|/g, "\\|")).join(" | ") + " |"); L.push(""); };
  const arrow = c => `${c.proposed || "—"} → ${c.intended || "—"}`;
  L.push(`# Proposal audit — generated, do not edit`, ``,
    `Run \`node tools/proposal-audit.mjs\` to regenerate. Seed ${h.seed}, ${h.n} sites generated, ${h.sites} plausible (${h.rejected} rejected by the consistency checks), engine ${h.engine}, pool ${h.poolHash} (${h.poolFixtures} field-like fixtures: ${h.poolGroups.join(", ")}).`, ``,
    `**What this measures.** Each site is built the way a surveyor builds it: drop the item on its supply, read what the engine pre-filled, correct what is wrong, fill the rest. A *correction* is a proposed value the sheet did not want. ${h.unit}. ${h.ranking}.`, ``,
    `**Provenance.** POOL: the pool's own sheets agree with the correction, not with the engine. MIXED: the pool has some of it. OPINION: only the generator wanted this. BLANK: the sheet left the cell empty — never evidence.`, ``,
    `Sample check: the top ten classes over the first 50 sites agree with the full run on ${h.sample.first50TopTenAgree} of ${h.sample.of}.`, ``);

  L.push(`## High potential — corrections the pool backs`, ``);
  const pool = res.classes.filter(c => c.label === "POOL");
  t(["#", "class", "type", "fed from", "correction", "pool share (rows / sheets)", "sites", "breadth", "depth", "mean P", "potential", "proposed change"],
    pool.slice(0, 15).map((c, i) => [i + 1, c.cls, c.type, c.supplyType, c.field === "from" ? c.intended || "second supply" : arrow(c), c.field === "from" ? "—" : `${c.poolIntended} (${c.poolRows} / ${c.poolFixtures})`, c.sites, c.breadth, c.depth, c.meanP, c.potential, c.change]));
  L.push(`## Generator opinion — corrections the pool does not back`, ``);
  t(["class", "type", "fed from", "correction", "label", "pool: intended / proposed (rows)", "sites", "potential", "note"],
    res.classes.filter(c => c.label !== "POOL").slice(0, 15).map(c => [c.cls, c.type, c.supplyType, arrow(c), c.label, `${c.poolIntended} / ${c.poolProposed} (${c.poolRows})`, c.sites, c.potential, c.change]));
  L.push(`## The palette click — where a row lands with no target`, ``, `In \`click\` mode nothing is selected and the supply is \`defaultSupply\`: SUPPLY_RANK is the wrong *kind* of supply, SUPPLY_LAST_WINS the right kind but the bottom-most one when the sheet has several.`, ``);
  t(["class", "type", "intended supply type", "sites", "breadth", "mean pick rank", "potential", "proposed change"],
    res.clickClasses.slice(0, 10).map(c => [c.cls, c.type, c.supplyType, c.sites, c.breadth, c.depth, c.potential, c.change]));
  L.push(`## The engine's own verdict on plausible sites`, ``);
  t(["finding", "sites", "breadth", "mean P", "example"], res.engineClasses.map(e => [e.key, e.sites, e.breadth, e.meanP, e.examples[0]]));
  L.push(`## Values the lists do not offer`, ``, `Typing costs the same one action as a pick, so these are information, ranked by how often the pool writes them.`, ``);
  t(["type", "field", "value", "pool rows", "sites here", "change"], res.offer.slice(0, 15).map(o => [o.type, o.field, o.intended, o.poolSeen, o.sites, o.change]));
  L.push(`## Left blank on purpose, and what the pool writes there`, ``);
  t(["type", "fed from", "intended", "label", "pool share", "sites"], res.deliberate.map(c => [c.type, c.supplyType, c.intended, c.label, c.poolIntended, c.sites]));
  L.push(`Uninferable: ${res.uninferable} root voltages (a root nothing on the sheet yet names — the first incomer, a second one), excluded from every ranking.`, ``);
  L.push(`## ID prefixes — the engine's against the pool's`, ``);
  t(["type", "engine", "pool (weight)"], Object.entries(res.prefixes).sort().map(([t_, p]) => [t_, p.engine, p.pool.join(", ")]));
  L.push(`## Fill cost`, ``, `${res.fill.rows} rows placed, ${res.fill.cost} actions, **${res.fill.perRow} per row** in the baseline's unit (desc and notes always cost 1 each; they are never proposed).`, ``);
  L.push(`## Per archetype`, ``);
  for (const [a, v] of Object.entries(res.perArchetype)) { L.push(`**${a}** — ${v.sites} sites, A = ${v.A}`, ``); t(["class", "label", "sites", "potential"], v.top.map(x => [x.key, x.label, x.sites, x.potential])); }
  L.push(`## Sites, by plausibility`, ``);
  t(["site", "P", "A", "C", "V", "lowest factor", "rows", "shapes", "corrections", "fill / row"],
    res.configs.filter(c => !c.rejected).slice(0, 40).map(c => [c.id, c.P, c.A, c.C, c.V, c.lowest, c.rows, c.archetypes.join(" "), c.corrections, c.fill]));
  L.push(`Rejected (${res.configs.filter(c => c.rejected).length}): ` + res.configs.filter(c => c.rejected).map(c => `${c.id} — ${c.lowest}${c.injected ? ` (injected: ${c.injected})` : ""}`).join("; "), ``);
  return L.join("\n");
}

/* ---------------------------------------------------------------- the page pass
 *
 * The engine pass proves what proposeRow returns; this proves the page hands
 * the surveyor exactly that, through the same call a chip drop makes
 * (addRowFor), and reads where the intended value sits in the real pickers.
 * One sheet per shape is enough: the identity depends on (type, supply), not
 * on which site. Needs the headless Chromium (Node ≥ 22). */
export async function pagePass(res, { log = console.log } = {}) {
  const ok = res.cfgs.filter(c => !c.rejected).sort((a, b) => b.P - a.P);
  const sheets = [];
  for (const a of ARCHETYPE_LIST) { const c = ok.find(x => x.archetypes.includes(a) && !sheets.includes(x)); if (c) sheets.push(c); }
  const pg = await openPage();
  const q = JSON.stringify;
  let drops = 0, mismatches = [], positions = {}, spliceAtEnd = 0;
  try {
    for (const c of sheets) {
      await pg.evaluate(`(function(){ state.rows=[]; rebuildTable(); redraw(); })()`);
      const placed = [];
      for (const i of c.networkOrder) {
        const row = c.rows[i];
        const sup = tokens(row.from), first = sup[0] || "";
        const supRow = first ? placed.find(r => idKey(r.id) === idKey(first)) : null;
        const st = supRow ? canon(supRow.type) : "(root)";
        let target = supRow ? supRow.id : "";
        if (!first) for (const later of c.rows) { const ts = tokens(later.from); if (!ts.some(x => idKey(x) === idKey(row.id))) continue;
          const other = ts.map(x => placed.find(r => idKey(r.id) === idKey(x))).find(r => r && ["lv busbar", "mv busbar", "rmu", "mcc"].includes(canon(r.type))); if (other) { target = other.id; break; } }
        /* the engine's answer, then the page's, through the drop */
        const { items, order } = buildModel(normalizeRows(placed));
        const want = proposeRow(items, order, { type: row.type, targetId: target });
        const got = JSON.parse(await pg.evaluate(`JSON.stringify(addRowFor(${q(row.type)}, ${q(target)}))`));
        drops++;
        for (const f of ["id", "prot", "voltage", "from"]) if ((got[f] || "") !== (want[f] || "")) mismatches.push({ sheet: c.id, row: row.id, field: f, page: got[f], engine: want[f] });
        const at = await pg.evaluate(`rowIndexOf(${q(got.id)})`), len = await pg.evaluate(`state.rows.length`);
        if (at === len - 1) spliceAtEnd++;
        /* where the intended values sit in the real pickers */
        for (const f of ["prot", "voltage", "rating"]) {
          const intended = String(row[f] || "").trim(); if (!intended) continue;
          const key = `${canon(row.type)}|${st}|${f}|${intended}`;
          if (key in positions) continue;
          const opts = JSON.parse(await pg.evaluate(`(function(){ const el=document.querySelector('tr[data-i="${at}"] [data-f="${f}"]'); el.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
            const p=document.querySelector('#picker'); return JSON.stringify(p.hidden?[]:[...p.querySelectorAll('.opt b')].map(b=>b.textContent)); })()`));
          const k = opts.indexOf(intended);
          positions[key] = k < 0 ? null : k + 1;
        }
        await pg.evaluate(`closePicker()`);
        /* the surveyor corrects the row to what the sheet wanted */
        await pg.evaluate(`(function(){ const i=rowIndexOf(${q(got.id)}); const r=state.rows[i];
          Object.assign(r, ${q({ id: row.id, desc: row.desc, rating: row.rating, voltage: row.voltage, prot: row.prot, from: row.from, notes: row.notes })}); delete r._p; rebuildTable(); redraw(); })()`);
        placed.push(row);
      }
      log(`  page: ${c.id} ${c.archetypes.join(",")} — ${c.rows.length} drops`);
    }
  } finally { pg.close(); }
  const vals = Object.values(positions);
  return { sheets: sheets.map(c => c.id), drops, identityMismatches: mismatches, spliceAtEnd, pageErrors: pg.errors.slice(0, 5),
    picker: { triples: vals.length, top4: vals.filter(v => v !== null && v <= 4).length, lower: vals.filter(v => v !== null && v > 4).length, notOffered: vals.filter(v => v === null).length,
      notOfferedKeys: Object.entries(positions).filter(([, v]) => v === null).map(([k]) => k).sort() } };
}
function pageMd(page) {
  const L = [`## The page pass`, ``,
    `${page.sheets.length} sheets, one per shape (${page.sheets.join(", ")}), rebuilt in the page through \`addRowFor\` — the same call a chip drop makes — and each proposal compared with the engine's: **${page.identityMismatches.length} mismatches in ${page.drops} drops**. ${page.spliceAtEnd} of ${page.drops} rows were spliced at the end of the table; the rest after their supply's last way. Page errors: ${page.pageErrors.length}.`, ``,
    `In the real pickers, of ${page.picker.triples} distinct (type, supply, field, value) triples the sheets asked for: **${page.picker.top4} in the top four, ${page.picker.lower} further down, ${page.picker.notOffered} not offered** (${page.picker.notOfferedKeys.slice(0, 12).join("; ")}${page.picker.notOfferedKeys.length > 12 ? "; …" : ""}).`, ``];
  if (page.identityMismatches.length) { L.push(`| sheet | row | field | page | engine |`, `|---|---|---|---|---|`); for (const m of page.identityMismatches.slice(0, 20)) L.push(`| ${m.sheet} | ${m.row} | ${m.field} | ${m.page} | ${m.engine} |`); L.push(``); }
  return L.join("\n");
}

/* ---------------------------------------------------------------- main */
if (import.meta.url === `file://${process.argv[1]}`) {
  const res = runAudit();
  const { cfgs, ...json } = res;
  const text = JSON.stringify(json, null, 1) + "\n";
  const file = path.join(OUT, "audit.json");
  const strip = s => s.replace(/"engine": "[^"]*"/, '"engine": "…"');
  if (CHECK) {
    const have = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
    if (strip(have) === strip(text)) { console.log(`audit holds: ${json.header.sites} sites, ${json.classes.length} classes`); process.exit(0); }
    const h = have ? JSON.parse(have).header : {};
    const why = [h.seed !== json.header.seed && "seed", h.poolHash !== json.header.poolHash && "pool", h.n !== json.header.n && "n"].filter(Boolean);
    console.log(`audit differs from ${path.relative(ROOT, file)}${why.length ? ` — the header changed: ${why.join(", ")}` : " — the engine or the grammar changed"}; run without --check to accept`);
    process.exit(1);
  }
  fs.mkdirSync(path.join(OUT, "configs"), { recursive: true });
  fs.writeFileSync(file, text);
  const pageFile = path.join(OUT, "page.json");
  if (args.includes("--page")) fs.writeFileSync(pageFile, JSON.stringify(await pagePass(res), null, 1) + "\n");
  const page = fs.existsSync(pageFile) ? JSON.parse(fs.readFileSync(pageFile, "utf8")) : null;
  fs.writeFileSync(path.join(OUT, "AUDIT.md"), md(res) + (page ? "\n" + pageMd(page) : ""));
  for (const f of fs.readdirSync(path.join(OUT, "configs"))) fs.unlinkSync(path.join(OUT, "configs", f));
  cfgs.filter(c => !c.rejected).sort((a, b) => b.P - a.P).slice(0, 10).forEach((c, i) =>
    fs.writeFileSync(path.join(OUT, "configs", `${String(i + 1).padStart(2, "0")}_${c.id}_${c.archetypes.filter(a => a !== "single_tx")[0] || "single_tx"}.csv`), rowsToCsv(c.rows)));
  console.log(`${json.header.sites} plausible sites of ${json.header.n}; ${json.classes.length} correction classes, ${json.classes.filter(c => c.label === "POOL").length} pool-backed; fill ${json.fill.perRow} actions/row`);
  console.log(`wrote ${path.relative(ROOT, OUT)}/{audit.json,AUDIT.md,configs/}`);
  for (const c of json.classes.filter(c => c.label === "POOL").slice(0, 8)) console.log(`  ${String(c.potential).padEnd(6)} ${c.cls.padEnd(20)} ${c.type.padEnd(14)} from ${c.supplyType.padEnd(11)} ${c.field.padEnd(8)} ${(c.proposed || "—")} → ${c.intended || "—"}   [${c.sites} sites]`);
}
