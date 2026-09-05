/* Plausible sites, generated and scored.
 *
 * A seeded grammar of the shapes a survey sheet actually takes — a substation
 * with one transformer, twins with a tie, a ring of RMUs, a pump station with
 * its MCC — each emitting 16 to 30 rows with ratings, voltages and words drawn
 * from what the pool writes. Every site is emitted in two orders: network
 * order (top of the network first, as the fixtures are written) and survey
 * order (a board, then its ways, then what hangs on the ways — how a person
 * walks a switchroom).
 *
 * Plausibility is a structured score, not a mean of anyone's priors:
 *
 *   P = A × C × V
 *   A  how often field-like fixtures show this shape (Laplace-smoothed)
 *   C  hard consistency checks, multiplied; any 0 rejects the site
 *   V  how often the pool has written each cell's value
 *
 * A few sites are given one deliberate fault (`injected`) so the checks have
 * something to reject and the ranking has a floor.
 *
 *   generate(seed, n, pool) → configs
 *   score(rows, pool)       → { A, C, V, P, checks, lowest }
 */
import { ARCHETYPES, canon, share, seen } from "./pool.mjs";
import { idKey, words, hasWord, EARTH_WORDS } from "../../src/core/types.js";

export const ARCHETYPE_LIST = ARCHETYPES;

/* ---------------------------------------------------------------- randomness */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, xs) => xs[Math.floor(rng() * xs.length)];
const chance = (rng, p) => rng() < p;
const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/* ---------------------------------------------------------------- vocabulary (what the pool writes) */
const V = {
  mvVolts: ["11 kV", "11 kV", "11 kV", "11 kV", "33 kV", "3.3 kV"],
  boardA: ["630 A", "800 A", "1250 A", "1600 A", "1600 A", "2000 A", "2500 A", "3200 A"],
  mvBoardA: ["630 A", "1250 A", "1250 A", "2000 A"],
  rmuA: ["630 A", "630 A", "630 A", "400 A"],
  txKva: ["315 kVA", "500 kVA", "800 kVA", "1000 kVA", "1000 kVA", "1000 kVA", "1250 kVA", "1600 kVA", "2000 kVA"],
  bigTx: ["10 MVA", "20 MVA", "2 MVA", "5 MVA"],
  feederA: ["32 A", "63 A", "63 A", "100 A", "100 A", "160 A", "250 A", "250 A", "250 A", "400 A", "630 A"],
  lvKw: ["7.5 kW", "11 kW", "15 kW", "22 kW", "30 kW", "37 kW", "45 kW", "55 kW", "75 kW", "110 kW", "160 kW"],
  mvKw: ["160 kW", "355 kW", "500 kW", "630 kW", "800 kW", "1.2 MW", "1.5 MW"],
  mccA: ["160 A", "250 A", "400 A", "400 A", "630 A"],
  genKva: ["500 kVA", "800 kVA", "1000 kVA", "1250 kVA", "2 MVA"],
  capKvar: ["200 kvar", "300 kvar", "400 kvar", "1.5 Mvar", "1200 kvar"],
  nerA: ["100 A", "300 A 10 s", "400 A"],
  incomerDesc: ["Utility incomer A", "Utility incomer B", "Primary substation", "Utility 11 kV"],
  mvbDesc: ["11 kV switchboard", "11 kV board A", "11 kV board B", "Primary 11 kV board", "11 kV main board"],
  rmuDesc: ["works", "village", "school", "depot", "farm", "pumping station", "reservoir"],
  txDesc: ["Intake tx, Dyn11", "Filter tx, Dyn11", "Chemical tx, Dyn11", "HL pump tx, Dyn11", "Sludge tx, Dyn11", "Main tx", "Riser R1, Dyn11", "Riser R2, Dyn11"],
  boardDesc: ["Intake MSB", "Filter MSB", "Main LV board", "Chemical MSB", "HL pump MSB", "LV board R1", "LV board R2", "Annexe DB"],
  mccDesc: ["Intake pump MCC", "Backwash MCC", "Dosing MCC", "HL pump MCC", "Sludge MCC", "Blower MCC"],
  pumpDesc: ["Raw water pump", "Backwash pump", "HL pump", "Sludge pump", "CHW pump", "Borehole pump", "Dosing pump", "Blower"],
  feederDesc: ["Intake lighting", "Filter gallery DB", "Backwash valves", "Gallery lighting", "Chemical building DB", "Sockets east", "Small power", "HVAC", "Workshop DB", "Spare"],
  feederProt: ["CB", "CB", "CB", "MCB", "MCCB"],
  boardProt: ["CB", "CB", "CB", "CB", "MCCB", "ACB"],
  lvPumpProt: ["Fused contactor", "Fused contactor", "Fused contactor", "CB", ""],   /* the pool: every filled cell on an MCC way is a fused contactor; a contactor alone is 10% of motors anywhere */
  mvPumpProt: ["Fuse-contactor", "Fuse-contactor", "Fused contactor", "CB"],
};

/* ---------------------------------------------------------------- the grammar */
class Sheet {
  constructor(rng, scheme) { this.rng = rng; this.rows = []; this.n = {}; this.scheme = scheme; this.children = new Map(); }
  next(type) {
    const pre = this.scheme[type] || "X";
    this.n[pre] = (this.n[pre] || 0) + 1;
    return pre + this.n[pre];
  }
  add(type, fields) {
    const row = { id: fields.id || this.next(type), type, desc: "", rating: "", voltage: "", prot: "", from: "", notes: "", ...fields };
    /* a surveyor numbers a repeated description rather than writing it twice */
    if (row.desc && !/\d$/.test(row.desc)) {
      const same = this.rows.filter(r => r.desc === row.desc || r.desc.startsWith(row.desc + " ")).length;
      if (same) row.desc = `${row.desc} ${same + 1}`;
    }
    this.rows.push(row);
    for (const p of row.from.split(",").map(s => s.trim()).filter(Boolean))
      this.children.set(p, (this.children.get(p) || []).concat([row.id]));
    return row;
  }
  byId(id) { return this.rows.find(r => r.id === id); }
}
/* site ID conventions — what the pool's testers actually use */
const SCHEMES = [
  { "MV Incomer": "MV", "MV Busbar": "MVB", "RMU": "RMU", "Transformer": "TX", "LV Busbar": "BB", "Feeder": "F", "Pump": "P", "MCC": "MCC", "Bus Coupler": "BC", "Generator": "G", "Capacitor Bank": "CAP", "Earthing/NER": "NER", "Surge Arrester": "SA", "UPS": "UPS", "Battery": "BAT", "DC Busbar": "DCB" },
  { "MV Incomer": "INC", "MV Busbar": "MVB", "RMU": "RMU", "Transformer": "TX", "LV Busbar": "MSB", "Feeder": "F", "Pump": "P", "MCC": "MCC", "Bus Coupler": "TIE", "Generator": "DG", "Capacitor Bank": "PFC", "Earthing/NER": "NER", "Surge Arrester": "SA", "UPS": "UPS", "Battery": "BAT", "DC Busbar": "DCB" },
  { "MV Incomer": "MV", "MV Busbar": "MVB", "RMU": "R", "Transformer": "T", "LV Busbar": "LVB", "Feeder": "F", "Pump": "M", "MCC": "MCC", "Bus Coupler": "BC", "Generator": "G", "Capacitor Bank": "CAP", "Earthing/NER": "NER", "Surge Arrester": "SA", "UPS": "UPS", "Battery": "BAT", "DC Busbar": "DCB" },
];

/* the board an LV sheet puts under a transformer: full-load current, then the
   next standard rating up (occasionally the one above that) */
const KVA = s => { const m = /^(\d+(?:\.\d+)?)\s*(k|m)va\b/i.exec(s); return m ? +m[1] * (m[2].toLowerCase() === "m" ? 1000 : 1) : 1000; };
const BOARD_LADDER = [250, 400, 630, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000];
function boardFor(rng, tx, lv) {
  const fla = KVA(tx.rating) * 1000 / (Math.sqrt(3) * (lv === "690 V" ? 690 : 400));
  const i = BOARD_LADDER.findIndex(a => a >= fla);
  const pickAt = Math.min(BOARD_LADDER.length - 1, (i < 0 ? BOARD_LADDER.length - 1 : i) + (chance(rng, 0.3) ? 1 : 0));
  return `${BOARD_LADDER[pickAt]} A`;
}
const ratio = (mv, lv) => `${mv.replace(" kV", "")}/${lv === "400 V" ? "0.4" : lv === "690 V" ? "0.69" : "0.23"} kV`;

function feedersOn(sh, board, lv, count, tags) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const spare = chance(sh.rng, 0.08);
    const r = sh.add("Feeder", { desc: spare ? "Spare" : pick(sh.rng, V.feederDesc), rating: pick(sh.rng, V.feederA), voltage: lv,
      prot: pick(sh.rng, V.feederProt), from: board.id, notes: spare ? "Spare" : "" });
    ids.push(r.id);
  }
  tags.add("single_tx");
  return ids;
}
function pumpsOn(sh, host, lv, count, protList) {
  for (let i = 0; i < count; i++)
    sh.add("Pump", { desc: `${pick(sh.rng, V.pumpDesc)} ${i + 1}`, rating: pick(sh.rng, V.lvKw), voltage: lv,
      prot: pick(sh.rng, protList), from: host.id, notes: chance(sh.rng, 0.25) ? "VSD" : "" });
}
function lvBoard(sh, tx, lv, tags, opts = {}) {
  const bb = sh.add("LV Busbar", { desc: pick(sh.rng, V.boardDesc), rating: boardFor(sh.rng, tx, lv), voltage: lv, prot: pick(sh.rng, V.boardProt), from: tx.id });
  feedersOn(sh, bb, lv, int(sh.rng, 2, 5), tags);
  if (chance(sh.rng, 0.55)) {                                   /* an MCC with its motors */
    const mcc = sh.add("MCC", { desc: pick(sh.rng, V.mccDesc), rating: pick(sh.rng, V.mccA), voltage: lv, prot: "CB", from: bb.id });
    pumpsOn(sh, mcc, lv, int(sh.rng, 2, 4), V.lvPumpProt); tags.add("pump_station_mcc");
  }
  if (chance(sh.rng, 0.35)) pumpsOn(sh, bb, lv, int(sh.rng, 1, 2), ["CB", "Contactor", "CB"]);
  if (chance(sh.rng, 0.30)) {                                   /* a sub-board on a way */
    const f = sh.add("Feeder", { desc: "Annexe feeder", rating: pick(sh.rng, ["160 A", "250 A", "400 A"]), voltage: lv, prot: "MCCB", from: bb.id });
    const db = sh.add("LV Busbar", { desc: "Annexe DB", rating: pick(sh.rng, ["250 A", "400 A", "630 A"]), voltage: lv, prot: "MCCB", from: f.id });
    feedersOn(sh, db, lv, int(sh.rng, 2, 3), tags); tags.add("lv_subboards");
  }
  if (chance(sh.rng, 0.18)) {                                   /* equipment hung on a way — the placeholder */
    const f = sh.add("Feeder", { desc: "Way to the pump", rating: "63 A", voltage: lv, prot: chance(sh.rng, 0.5) ? "" : "MCCB", from: bb.id });
    sh.add("Pump", { desc: "Transfer pump", rating: pick(sh.rng, V.lvKw), voltage: lv, prot: "Contactor", from: f.id });
  }
  if (chance(sh.rng, 0.08)) {                                   /* a small LV/LV transformer on a way: a 230 V or isolation set */
    const f = sh.add("Feeder", { desc: "Way to the site tx", rating: "100 A", voltage: lv, prot: "MCCB", from: bb.id });
    const t = sh.add("Transformer", { desc: "Site tx, Dyn11", rating: pick(sh.rng, ["50 kVA", "100 kVA"]), voltage: "0.4/0.23 kV", prot: "CB", from: f.id });
    const db = sh.add("LV Busbar", { desc: "230 V board", rating: "250 A", voltage: "230 V", prot: "MCCB", from: t.id });
    feedersOn(sh, db, "230 V", 2, tags); tags.add("lv_subboards");
  }
  if (chance(sh.rng, 0.22)) { sh.add("Capacitor Bank", { desc: pick(sh.rng, ["PFC bank", "Power factor correction"]), rating: pick(sh.rng, V.capKvar), voltage: lv, prot: "CB", from: bb.id }); tags.add("pfc"); }
  if (chance(sh.rng, 0.10)) { sh.add("Surge Arrester", { desc: "LV SPD", voltage: lv, from: bb.id }); }
  return bb;
}
function txTo(sh, mvNode, mv, lv, tags, prot) {
  const big = mv === "33 kV";
  return sh.add("Transformer", { desc: pick(sh.rng, V.txDesc), rating: pick(sh.rng, big ? V.bigTx : V.txKva), voltage: ratio(mv, lv),
    prot: prot ?? (canon(mvNode.type) === "rmu" ? "Fuse-switch" : "CB"), from: mvNode.id });
}

/* one site */
function build(rng, seedId) {
  const sh = new Sheet(rng, pick(rng, SCHEMES));
  const tags = new Set();
  const mv = pick(rng, V.mvVolts), lv = "400 V";
  if (mv === "33 kV") tags.add("hv_primary");
  const inc = sh.add("MV Incomer", { desc: pick(rng, V.incomerDesc), voltage: mv });
  const shape = pick(rng, ["single", "single", "twin", "twin", "ring", "ring", "dual_mv", "pump_station"]);
  if (shape === "ring") {
    /* a chain of RMUs, each fed from the one before; closed into a ring six
       times in ten, when every unit names both neighbours and carries a
       switch on each cable — one device per supply, as the pool writes it */
    const n = int(rng, 3, 4); let prev = inc; const rmus = [];
    for (let i = 0; i < n; i++) {
      const r = sh.add("RMU", { desc: `RMU ${i + 1} (${pick(rng, V.rmuDesc)})`, rating: pick(rng, V.rmuA), voltage: mv, prot: "LBS", from: i === 0 ? inc.id : `${prev.id}` });
      rmus.push(r); prev = r;
    }
    if (chance(rng, 0.6)) {
      rmus[0].from = `${inc.id}, ${rmus[n - 1].id}`; rmus[0].prot = "LBS, LBS";
      for (let i = 1; i < n - 1; i++) { rmus[i].from = `${rmus[i - 1].id}, ${rmus[i + 1].id}`; rmus[i].prot = "LBS, LBS"; }
      rmus[n - 1].from = `${rmus[n - 2].id}, ${rmus[0].id}`; rmus[n - 1].prot = "LBS, LBS";
      sh.children.set(rmus[n - 1].id, (sh.children.get(rmus[n - 1].id) || []).concat([rmus[0].id]));
      rmus[n - 1].notes = "N.O. towards " + rmus[0].id;
    }
    tags.add("rmu_ring");
    for (const r of rmus) { const tx = txTo(sh, r, mv, lv, tags, "Fuse-switch"); lvBoard(sh, tx, lv, tags); }
    if (chance(rng, 0.3)) sh.add("Feeder", { desc: "Cable to the farm", rating: "63 A", voltage: mv, prot: "", from: pick(rng, rmus).id });
  } else {
    const mvb = sh.add("MV Busbar", { desc: pick(rng, V.mvbDesc), rating: pick(rng, V.mvBoardA), voltage: mv, prot: "CB", from: inc.id });
    if (shape === "dual_mv") {
      const inc2 = sh.add("MV Incomer", { desc: "Utility incomer B", voltage: mv });
      const mvb2 = sh.add("MV Busbar", { desc: "11 kV board B", rating: mvb.rating, voltage: mv, prot: "CB", from: inc2.id });
      sh.add("Bus Coupler", { desc: "11 kV bus section", rating: mvb.rating, voltage: mv, prot: "CB", from: `${mvb.id}, ${mvb2.id}`, notes: "Normally open" });
      tags.add("dual_mv_boards");
      for (const b of [mvb, mvb2]) { const tx = txTo(sh, b, mv, lv, tags); lvBoard(sh, tx, lv, tags); }
    } else if (shape === "twin") {
      const t1 = txTo(sh, mvb, mv, lv, tags), t2 = txTo(sh, mvb, mv, lv, tags);
      const b1 = lvBoard(sh, t1, lv, tags), b2 = lvBoard(sh, t2, lv, tags);
      sh.add("Bus Coupler", { desc: "LV tie", rating: b1.rating, voltage: lv, prot: "CB", from: `${b1.id}, ${b2.id}`, notes: "Normally open" });
      tags.add("twin_tx_coupler");
    } else if (shape === "pump_station") {
      const tx = txTo(sh, mvb, mv, lv, tags);
      const bb = lvBoard(sh, tx, lv, tags);
      const mcc = sh.add("MCC", { desc: "Main pump MCC", rating: pick(rng, ["400 A", "630 A"]), voltage: lv, prot: "CB", from: bb.id });
      pumpsOn(sh, mcc, lv, int(rng, 3, 5), V.lvPumpProt); tags.add("pump_station_mcc");
      if (chance(rng, 0.5)) { for (let i = 0; i < int(rng, 1, 3); i++) sh.add("Pump", { desc: `HL pump ${i + 1}`, rating: pick(rng, V.mvKw), voltage: mv, prot: pick(rng, V.mvPumpProt), from: mvb.id }); tags.add("mv_motors"); }
    } else {
      const tx = txTo(sh, mvb, mv, lv, tags);
      lvBoard(sh, tx, lv, tags);
      if (chance(rng, 0.25)) { sh.add("Pump", { desc: "HL pump 1", rating: pick(rng, V.mvKw), voltage: mv, prot: pick(rng, V.mvPumpProt), from: mvb.id }); tags.add("mv_motors"); }
    }
    if (chance(rng, 0.25)) sh.add("Feeder", { desc: "Export cable", rating: "400 A", voltage: mv, prot: "CB", from: mvb.id });
    if (chance(rng, 0.10)) {                                     /* a way out of the MV board carrying a transformer: the placeholder on the MV side */
      const w = sh.add("Feeder", { desc: "Way to the substation", rating: "630 A", voltage: mv, prot: chance(rng, 0.5) ? "" : "CB", from: mvb.id });
      const t = txTo(sh, w, mv, lv, tags); t.prot = "CB";
      lvBoard(sh, t, lv, tags);
    }
    if (chance(rng, 0.15)) { sh.add("Earthing/NER", { desc: "Neutral earthing resistor", rating: pick(rng, V.nerA), voltage: mv, from: mvb.id }); tags.add("ner"); }
    if (chance(rng, 0.2)) sh.add("Capacitor Bank", { desc: "PFC bank sec A", rating: "1.5 Mvar", voltage: mv, prot: "CB", from: mvb.id }), tags.add("pfc");
  }
  /* a standby set on a changeover */
  if (chance(rng, 0.2)) {
    const boards = sh.rows.filter(r => r.type === "LV Busbar");
    const bb = pick(rng, boards);
    const g = sh.add("Generator", { desc: pick(rng, ["Depot standby set", "Genset 1"]), rating: pick(rng, V.genKva), voltage: lv });
    sh.add("Bus Coupler", { desc: "ATS mains/gen", voltage: lv, prot: "CB", from: `${bb.id}, ${g.id}`, notes: "ATS" });
    tags.add("genset_changeover");
  }
  if (chance(rng, 0.08)) {
    const bb = pick(rng, sh.rows.filter(r => r.type === "LV Busbar"));
    const ups = sh.add("UPS", { desc: "Server room UPS", rating: "40 kVA", voltage: "400/400 V", prot: "CB", from: bb.id });
    sh.add("LV Busbar", { desc: "UPS board", rating: "100 A", voltage: lv, prot: "MCCB", from: ups.id });
    tags.add("ups_dc");
  }
  /* fill to sixteen with feeders on the biggest board */
  while (sh.rows.length < 16) {
    const boards = sh.rows.filter(r => r.type === "LV Busbar");
    feedersOn(sh, pick(rng, boards), lv, 1, tags);
  }
  /* trim past thirty by dropping leaf loads from the end — a way, a motor, a
     terminal item that nothing feeds from; never a board or a transformer */
  while (sh.rows.length > 30) {
    const leaf = sh.rows.map((r, k) => [r, k]).reverse()
      .find(([r]) => ["Feeder", "Pump", "Capacitor Bank", "Surge Arrester"].includes(r.type) && !(sh.children.get(r.id) || []).length);
    if (!leaf) break;
    sh.rows.splice(leaf[1], 1);
  }
  /* one deliberate fault on a few sites, so the checks have work and the ranking a floor */
  let injected = null;
  if (chance(rng, 0.08)) {
    const kind = pick(rng, ["pump_on_incomer", "feeder_off_pump", "ratio_mismatch", "mv_motor_tiny"]);
    if (kind === "pump_on_incomer") sh.add("Pump", { desc: "Pump on the incomer", rating: "200 kW", voltage: mv, prot: "CB", from: inc.id });
    else if (kind === "feeder_off_pump") { const p = sh.rows.find(r => r.type === "Pump"); if (p) sh.add("Feeder", { desc: "Feeder off a pump", rating: "32 A", voltage: lv, prot: "MCB", from: p.id }); }
    else if (kind === "ratio_mismatch") { const t = sh.rows.find(r => r.type === "Transformer"); if (t) t.voltage = "33/11 kV"; }
    else { const p = sh.rows.find(r => r.type === "Pump" && r.voltage === mv); if (p) p.rating = "22 kW"; }
    injected = kind;
    /* the fault may have added a row: keep the cap */
    while (sh.rows.length > 30) {
      const leaf = sh.rows.map((r, k) => [r, k]).reverse()
        .find(([r]) => ["Feeder", "Pump", "Capacitor Bank", "Surge Arrester"].includes(r.type) && !(sh.children.get(r.id) || []).length && r.id !== sh.rows[sh.rows.length - 1].id);
      if (!leaf) break;
      sh.rows.splice(leaf[1], 1);
    }
  }
  return { rows: sh.rows, archetypes: [...tags].sort(), injected, scheme: SCHEMES.indexOf(sh.scheme) };
}

/* ---------------------------------------------------------------- orders */
/** Network order: roots, then each depth in turn (how the fixtures are written).
    A row comes after *every* supply it names — a changeover between a board
    and a genset sits below the board, not beside the genset root. */
export function networkOrder(rows) {
  const byKey = new Map(rows.map((r, i) => [idKey(r.id), i]));
  const depth = new Array(rows.length).fill(null);
  const parents = r => String(r.from || "").split(",").map(s => byKey.get(idKey(s.trim()))).filter(i => i !== undefined);
  let changed = true, guard = 0;
  rows.forEach((r, i) => { if (!parents(r).length) depth[i] = 0; });
  while (changed && guard++ < 50) {
    changed = false;
    rows.forEach((r, i) => {
      if (depth[i] !== null) return;
      const ps = parents(r).map(j => depth[j]);
      if (ps.length && ps.every(d => d !== null)) { depth[i] = Math.max(...ps) + 1; changed = true; }
    });
  }
  /* a ring closes on itself: whoever is still unplaced takes the depth of its deepest placed supply, plus one */
  rows.forEach((r, i) => { if (depth[i] === null) { const ps = parents(r).map(j => depth[j]).filter(d => d !== null); depth[i] = ps.length ? Math.max(...ps) + 1 : 98; } });
  return rows.map((_, i) => i).sort((a, b) => depth[a] - depth[b] || a - b);
}
/** Survey order: a board, then its ways, then what hangs on those ways, then the next board. */
export function surveyOrder(rows) {
  const byKey = new Map(rows.map((r, i) => [idKey(r.id), i]));
  const kids = new Map();
  rows.forEach((r, i) => {
    const first = String(r.from || "").split(",").map(s => s.trim()).filter(Boolean)[0];
    const p = first !== undefined ? byKey.get(idKey(first)) : undefined;
    if (p !== undefined) kids.set(p, (kids.get(p) || []).concat([i]));
  });
  const out = [], seen = new Set();
  const isRoot = i => !String(rows[i].from || "").trim();
  /* a root some row names beside a board — a genset on a changeover — is
     added when the surveyor reaches that row, not at the top of the sheet */
  const named = new Set(rows.flatMap(r => String(r.from || "").split(",").map(s => byKey.get(idKey(s.trim()))).filter(j => j !== undefined && isRoot(j))));
  const visit = i => {
    if (seen.has(i)) return;
    for (const j of String(rows[i].from || "").split(",").map(s => byKey.get(idKey(s.trim()))).filter(j => j !== undefined && isRoot(j))) visit(j);
    seen.add(i); out.push(i);
    const ks = kids.get(i) || [];
    const isBoard = j => ["lv busbar", "mv busbar", "rmu", "mcc"].includes(canon(rows[j].type));
    for (const k of ks.filter(j => !isBoard(j))) visit(k);       /* the ways and equipment first */
    for (const k of ks.filter(isBoard)) visit(k);                /* then the boards below */
  };
  rows.forEach((r, i) => { if (isRoot(i) && !named.has(i)) visit(i); });
  rows.forEach((_, i) => visit(i));
  return out;
}

/* ---------------------------------------------------------------- the score */
const volts = s => { const m = /^(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*(k?v)\b/i.exec(String(s || "").trim().toLowerCase()); if (!m) return null; const k = m[3] === "kv" ? 1000 : 1; return { p: Math.round(+m[1] * k), s: m[2] !== undefined ? Math.round(+m[2] * k) : null }; };
const amps = s => { const m = /^(\d+(?:\.\d+)?)\s*a\b/i.exec(String(s || "").trim()); return m ? +m[1] : null; };
const kva = s => { const m = /^(\d+(?:\.\d+)?)\s*(k|m)va\b/i.exec(String(s || "").trim()); return m ? +m[1] * (m[2].toLowerCase() === "m" ? 1000 : 1) : null; };
const kw = s => { const m = /^(\d+(?:\.\d+)?)\s*(k|m)w\b/i.exec(String(s || "").trim()); return m ? +m[1] * (m[2].toLowerCase() === "m" ? 1000 : 1) : null; };

/** The consistency checks: each a pure function of the rows → the IDs that fail it. */
export const CHECKS = [
  { name: "VOLT_MATCHES_SUPPLY", penalty: 0, about: "a row's level is its supply's secondary (transformer) or level (board, RMU, MCC)",
    fails: (rows, ctx) => rows.filter(r => {
      const t = canon(r.type); if (["transformer", "bus coupler", "generator", "mv incomer"].includes(t)) return false;
      const v = volts(r.voltage), sup = ctx.supply(r); if (!v || !sup) return false;
      const sv = volts(sup.voltage); if (!sv) return false;
      const level = canon(sup.type) === "transformer" ? (sv.s ?? sv.p) : sv.p;
      return v.p !== level;
    }).map(r => r.id) },
  { name: "TX_RATIO_BRIDGES", penalty: 0, about: "a transformer's primary is its supply's level and its secondary the level of every board it feeds",
    fails: (rows, ctx) => rows.filter(r => {
      if (canon(r.type) !== "transformer") return false;
      const v = volts(r.voltage), sup = ctx.supply(r); if (!v || !v.s || !sup) return false;
      const sv = volts(sup.voltage); if (sv && sv.p !== v.p && !(canon(sup.type) === "generator")) return true;
      return ctx.kids(r).some(k => canon(k.type) === "lv busbar" && volts(k.voltage) && volts(k.voltage).p !== v.s);
    }).map(r => r.id) },
  { name: "COUPLER_SAME_LEVEL", penalty: 0, about: "a bus coupler's ends share a level",
    fails: (rows, ctx) => rows.filter(r => {
      if (canon(r.type) !== "bus coupler") return false;
      const ends = ctx.supplies(r).map(e => volts(e.voltage)).filter(Boolean);
      return ends.length >= 2 && new Set(ends.map(e => e.s ?? e.p)).size > 1;
    }).map(r => r.id) },
  { name: "ONE_ROOT_PER_NET", penalty: 0, about: "every row can be traced back to an incomer or a generator",
    fails: (rows, ctx) => rows.filter(r => !ctx.reachesRoot(r)).map(r => r.id) },
  { name: "SUPPLY_CAN_FEED", penalty: 0, about: "nothing is fed from a motor, a coupler or a terminal item, and an incomer feeds only gear",
    fails: (rows, ctx) => rows.filter(r => ctx.supplies(r).some(s => {
      const st = canon(s.type), t = canon(r.type);
      return ["pump", "bus coupler", "capacitor bank", "earthing", "surge arrester"].includes(st)
        || (st === "mv incomer" && !["mv busbar", "rmu", "transformer", "bus coupler"].includes(t));
    })).map(r => r.id) },
  { name: "MV_MOTOR_SIZE", penalty: 0.3, about: "a motor above 3 kV is 90 kW or more; one at 400 V is 500 kW or less, at 690 V 2.5 MW or less (a drive-fed set)",
    fails: rows => rows.filter(r => { if (canon(r.type) !== "pump") return false; const v = volts(r.voltage), k = kw(r.rating); if (!v || k === null) return false;
      return v.p >= 3000 ? k < 90 : v.p >= 600 ? k > 2500 : k > 500; }).map(r => r.id) },
  { name: "BOARD_A_VS_LOAD", penalty: 0.5, about: "an LV board's rating sits between its transformers' full-load current and 2.5 times it",
    fails: (rows, ctx) => rows.filter(r => {
      if (canon(r.type) !== "lv busbar") return false;
      const a = amps(r.rating), v = volts(r.voltage); if (a === null || !v) return false;
      const txs = ctx.supplies(r).filter(s => canon(s.type) === "transformer").map(s => kva(s.rating)).filter(x => x !== null);
      if (!txs.length) return false;
      const fla = txs.reduce((x, y) => x + y, 0) * 1000 / (Math.sqrt(3) * v.p);
      return a < fla * 0.6 || a > fla * 2.5;
    }).map(r => r.id) },
  { name: "FEEDER_A_LE_BOARD_A", penalty: 0.5, about: "a way is not rated above its board",
    fails: (rows, ctx) => rows.filter(r => { if (!["feeder", "mcc"].includes(canon(r.type))) return false; const a = amps(r.rating), sup = ctx.supply(r); if (a === null || !sup) return false; const b = amps(sup.rating); return b !== null && a > b; }).map(r => r.id) },
  { name: "NO_ORPHAN_TX", penalty: 0.6, about: "every transformer feeds something — except an earthing transformer, which ends in an earth by design",
    fails: (rows, ctx) => rows.filter(r => canon(r.type) === "transformer" && !ctx.kids(r).length
      && !hasWord(words({ desc: r.desc || "", notes: r.notes || "" }), EARTH_WORDS)).map(r => r.id) },
];

function context(rows) {
  const byKey = new Map(rows.map(r => [idKey(r.id), r]));
  const supplies = r => String(r.from || "").split(",").map(s => byKey.get(idKey(s.trim()))).filter(Boolean);
  const kids = r => rows.filter(k => supplies(k).includes(r));
  const rootMemo = new Map();
  const reachesRoot = (r, seen = new Set()) => {
    if (rootMemo.has(r.id)) return rootMemo.get(r.id);
    const t = canon(r.type);
    let ok = t === "mv incomer" || t === "generator";
    if (!ok && !seen.has(r.id)) { seen.add(r.id); ok = supplies(r).some(s => reachesRoot(s, seen)); }
    rootMemo.set(r.id, ok); return ok;
  };
  return { supply: r => supplies(r)[0] || null, supplies, kids, reachesRoot };
}

/** A, C, V and P for a sheet, with every check's result and the one factor that bit hardest. */
export function score(rows, pool, archetypes = null) {
  const ctx = context(rows);
  const checks = CHECKS.map(c => { const bad = c.fails(rows, ctx); return { name: c.name, value: bad.length ? c.penalty : 1, rows: bad }; });
  const C = checks.reduce((a, c) => a * c.value, 1);
  /* V: how often the pool has written each filled cell's value for this type */
  let cells = 0, real = 0;
  for (const r of rows) {
    const t = canon(r.type); if (!t) continue;
    for (const f of ["prot", "voltage", "rating"]) {
      const v = String(r[f] || "").trim(); if (!v) continue;
      const n = seen(pool, t, f, v);
      cells++; real += n >= 2 ? 1 : n === 1 ? 0.5 : 0.2;
    }
  }
  const Vf = cells ? real / cells : 1;
  /* A: Laplace-smoothed frequency of the site's shapes among field-like fixtures, geometric mean */
  const arch = archetypes || [];
  const N = pool.fixtures.length, K = ARCHETYPES.length;
  const A = arch.length ? Math.exp(arch.reduce((s, a) => s + Math.log(((pool.archetypes[a] || 0) + 1) / (N + K)), 0) / arch.length) : 1 / (N + K);
  const P = A * C * Vf;
  const failing = checks.filter(c => c.value < 1).sort((a, b) => a.value - b.value)[0];
  const lowest = failing ? { factor: "C", check: failing.name, value: failing.value, rows: failing.rows }
    : [["A", A], ["V", Vf]].sort((a, b) => a[1] - b[1]).map(([factor, value]) => ({ factor, value }))[0];
  return { A, C, V: Vf, P, checks, lowest };
}

/** `n` sites from `seed`, each scored; deterministic. */
export function generate(seed, n, pool) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(seed * 100003 + i);
    const { rows, archetypes, injected, scheme } = build(rng, i);
    const s = score(rows, pool, archetypes);
    out.push({ id: `${seed}-${String(i + 1).padStart(3, "0")}`, seed, index: i, archetypes, scheme, injected,
      rows, networkOrder: networkOrder(rows), surveyOrder: surveyOrder(rows),
      factors: { A: s.A, C: s.C, V: s.V }, P: s.P, lowest: s.lowest, checks: s.checks.filter(c => c.value < 1), rejected: s.P === 0 });
  }
  return out;
}
