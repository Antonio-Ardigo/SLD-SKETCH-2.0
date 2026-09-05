/* The pool as evidence: what real survey sheets actually say.
 *
 * The proposal audit labels every finding by whether the pool agrees with the
 * engine or with the generated site, so the pool must be evidence and not
 * opinion. Most fixtures are not: features/, warnings/, topics/ and levels/
 * were written to exercise a bug once it was found (the README says so), and
 * their frequencies are the engine author's. Three rules follow:
 *
 *   field-like groups only     sites/, audit/, examples/ — sheets written as
 *                              sheets, by testers or as worked examples
 *   one merged fixture out     audit/w10_everything is w01+w02+w03 concatenated
 *                              and would count one tester twice
 *   a blank is missing data    47 of the pool's 72 blank pump Protections are
 *                              one tester's habit; a blank never becomes the
 *                              "usual" value of anything
 *
 * Frequencies are weighted per fixture (1/rows), so a 95-row sheet does not
 * outvote nine 12-row ones.
 *
 *   loadPool()  → { fixtures, slices, prefixes, archetypes, hash }
 *   slice(pool, type, supplyType, field) → { value: weight }   (canonical keys)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { listCases, loadCase } from "./cases.mjs";
import { ALIASES, PROT_ALIASES, idKey } from "../../src/core/types.js";

export const FIELD_GROUPS = ["sites", "audit", "examples"];
export const EXCLUDED = ["audit/w10_everything"];

/** Canonical type of a Type label as written, or null. */
export const canon = t => ALIASES[String(t || "").trim().toLowerCase().replace(/\s+/g, " ")] || null;
/** A Protection cell as the reader understands it: canonical kind, else the trimmed word, else "". */
export const protCanon = p => {
  const s = String(p || "").trim();
  if (!s) return "";
  return PROT_ALIASES[s.toLowerCase().split(/\s+/).join(" ")] || s;
};

const FIELDS = ["prot", "voltage", "rating"];

function relOf(dir) { return path.relative(path.join(dir, "..", ".."), dir).split(path.sep).join("/"); }

/** The field-like fixtures, in a stable order, w10 left out. */
export function fieldCases() {
  const out = [];
  for (const g of FIELD_GROUPS)
    for (const dir of listCases(g)) {
      const rel = relOf(dir);
      if (EXCLUDED.includes(rel)) continue;
      const c = loadCase(dir);
      if (!c.rows.length) continue;
      out.push({ rel, ...c });
    }
  return out;
}

/** sha1 of the field-like rows.csv files, so a report can say whether the pool moved. */
export function poolHash(cases = fieldCases()) {
  const h = crypto.createHash("sha1");
  for (const c of cases) h.update(c.rel + "\n" + fs.readFileSync(path.join(c.dir, "rows.csv"), "utf8"));
  return h.digest("hex").slice(0, 12);
}

/* the supply type of a row: its first Feeds From token, resolved on its own sheet */
function supplyTypeOf(row, byKey) {
  const first = String(row.from || "").split(",").map(s => s.trim()).filter(Boolean)[0];
  if (!first) return "";
  const hit = byKey.get(idKey(first));
  return hit ? canon(hit.type) || "?" : "?";
}

/** Slice key: canonical type | canonical supply type | field. */
export const sliceKey = (type, supplyType, field) => `${type}|${supplyType}|${field}`;

/**
 * Build the pool. `slices[key][value] = Σ (1/rows of the fixture)` over the
 * rows in that (type, supplyType, field) slice — blank values are not counted.
 * `prefixes[type][prefix] = weight` reads the letters before the first digit
 * of each ID. `archetypes[name] = fixtures` counts what each sheet contains.
 */
export function loadPool() {
  const cases = fieldCases();
  const slices = {}, counts = {}, writers = {}, prefixes = {}, archetypes = {}, supplies = {};
  const bump = (obj, k, v, w) => { (obj[k] ||= {}); obj[k][v] = (obj[k][v] || 0) + w; };
  const wrote = (k, v, rel) => { (writers[k] ||= {}); (writers[k][v] ||= new Set()).add(rel); };
  for (const c of cases) {
    const rows = c.rows.filter(r => String(r.id || "").trim());
    const w = 1 / rows.length;
    const byKey = new Map(rows.map(r => [idKey(r.id), r]));
    const seen = new Set();
    for (const r of rows) {
      const t = canon(r.type); if (!t) continue;
      const st = supplyTypeOf(r, byKey);
      bump(supplies, t, st || "(root)", w);
      for (const f of FIELDS) {
        const raw = String(r[f] || "").trim();
        if (!raw) continue;                                  /* missing data, not a value */
        const v = f === "prot" ? protCanon(raw) : raw;
        bump(slices, sliceKey(t, st, f), v, w);
        bump(slices, sliceKey(t, "*", f), v, w);              /* the type regardless of supply */
        bump(counts, sliceKey(t, st, f), v, 1);               /* rows, for "how much evidence is this" */
        bump(counts, sliceKey(t, "*", f), v, 1);
        wrote(sliceKey(t, st, f), v, c.rel); wrote(sliceKey(t, "*", f), v, c.rel);
      }
      const pre = /^[A-Za-z]+/.exec(String(r.id).trim());
      if (pre) bump(prefixes, t, pre[0].toUpperCase(), w);
      for (const a of archetypesOfRow(r, t, st, byKey)) seen.add(a);
    }
    for (const a of seen) archetypes[a] = (archetypes[a] || 0) + 1;
  }
  return { fixtures: cases.map(c => c.rel), slices, counts, writers, prefixes, archetypes, supplies, hash: poolHash(cases) };
}

/* The archetypes a sheet exhibits — the same names the generator uses, so
   its A factor can be read straight off the pool. */
export const ARCHETYPES = [
  "single_tx", "twin_tx_coupler", "rmu_ring", "pump_station_mcc", "dual_mv_boards",
  "genset_changeover", "pfc", "lv_subboards", "mv_motors", "hv_primary", "ups_dc", "ner",
];
function archetypesOfRow(r, t, st, byKey) {
  const out = [];
  const volts = String(r.voltage || "");
  if (t === "transformer") out.push("single_tx");
  if (t === "bus coupler") {
    const ends = String(r.from || "").split(",").map(s => byKey.get(idKey(s.trim()))).filter(Boolean);
    if (ends.some(e => canon(e.type) === "generator")) out.push("genset_changeover");
    else if (ends.length >= 2 && ends.every(e => canon(e.type) === "lv busbar")) out.push("twin_tx_coupler");
    else if (ends.length >= 2 && ends.every(e => canon(e.type) === "mv busbar")) out.push("dual_mv_boards");
  }
  if (t === "rmu" && st === "rmu") out.push("rmu_ring");
  if (t === "pump" && st === "mcc") out.push("pump_station_mcc");
  if (t === "pump" && (st === "mv busbar" || st === "rmu")) out.push("mv_motors");
  if (t === "capacitor bank") out.push("pfc");
  if (t === "lv busbar" && (st === "feeder" || st === "lv busbar")) out.push("lv_subboards");
  if (/\b(33|66|132)\s*kv\b/i.test(volts) && ["mv incomer", "mv busbar", "transformer"].includes(t)) out.push("hv_primary");
  if (/\bdc\b/i.test(volts) || /^(ups|inverter|battery|dc busbar)$/i.test(String(r.type || "").trim())) out.push("ups_dc");
  if (t === "earthing") out.push("ner");
  return out;
}

/** The weights of one slice, falling back to the supply-agnostic slice when the exact one is empty. */
export function slice(pool, type, supplyType, field) {
  return pool.slices[sliceKey(type, supplyType, field)] || pool.slices[sliceKey(type, "*", field)] || {};
}
/** How many field-like rows of `type` ever wrote `value` in `field`, whatever their supply. */
export function seen(pool, type, field, value) {
  const v = field === "prot" ? protCanon(value) : String(value || "").trim();
  return (pool.counts[sliceKey(type, "*", field)] || {})[v] || 0;
}
/** The share of `value` in a slice (0..1), the slice's total weight, and how many rows it rests on. */
export function share(pool, type, supplyType, field, value) {
  const exact = pool.slices[sliceKey(type, supplyType, field)];
  const s = exact || pool.slices[sliceKey(type, "*", field)] || {};
  const rowsIn = Object.values(pool.counts[sliceKey(type, exact ? supplyType : "*", field)] || {}).reduce((a, b) => a + b, 0);
  const total = Object.values(s).reduce((a, b) => a + b, 0);
  const v = field === "prot" ? protCanon(value) : String(value || "").trim();
  const fixtures = ((pool.writers[sliceKey(type, exact ? supplyType : "*", field)] || {})[v] || new Set()).size;
  return { share: total ? (s[v] || 0) / total : 0, total, n: Object.keys(s).length, rows: rowsIn, fixtures, exact: !!exact };
}
