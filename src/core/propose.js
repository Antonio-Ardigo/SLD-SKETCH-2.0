/* Proposals for a row being added.
 *
 * When the surveyor adds an item — drops a symbol on the drawing, clicks a
 * palette chip, presses "+ Add row" or Enter — the engine proposes the new
 * row's values and the page writes them into the table. Only that row, only
 * at that moment: afterwards it is an ordinary row and every cell is edited
 * as usual. Nothing here reads or changes connectivity (constitution §2): the
 * supply is the drop target or the neighbour's supply, the voltage is a label
 * inferred from that supply's label, the protection the usual device.
 *
 *   proposeRow(items, order, { type, targetId, sibling })
 *     → { id, type, desc, rating, voltage, prot, from, notes, proposed: [field…] }
 */
import { MV_INCOMER, MV_BUSBAR, RMU, TRANSFORMER, LV_BUSBAR, MCC, FEEDER, GENERATOR, ALIASES } from "./types.js";

/* the prefix of an auto-numbered ID, per Type label */
export const TYPE_PREFIX = {
  "MV Incomer": "MV", "Generator": "G", "MV Busbar": "MVB", "RMU": "RMU", "Transformer": "TX",
  "Pump": "P", "LV Busbar": "BB", "Feeder": "F", "MCC": "MCC", "Bus Coupler": "BC", "Capacitor Bank": "CAP",
  "Earthing/NER": "NER", "Surge Arrester": "SA", "UPS": "UPS", "Inverter": "INV", "Battery": "BAT", "DC Busbar": "DCB",
};

/* the usual device on a row's supply side, per Type label */
export const TYPE_DEFAULT_PROT = {
  "RMU": "LBS", "Transformer": "Fuse-switch", "LV Busbar": "CB", "Feeder": "CB", "MCC": "CB", "Pump": "Contactor",
  "MV Busbar": "CB", "Bus Coupler": "CB", "UPS": "CB", "DC Busbar": "CB",
};

/** The first free ID with the type's prefix (case-insensitive). */
export function nextId(type, existingIds) {
  const pre = TYPE_PREFIX[type] || "X";
  const used = new Set([...existingIds].map(s => String(s).trim().toUpperCase()));
  let n = 1;
  while (used.has((pre + n).toUpperCase())) n++;
  return pre + n;
}

/** "11/0.4 kV" → { primary: 11000, secondary: 400 }; "400 V" → { primary: 400 }; unreadable → null. */
export function parseVoltage(text) {
  const s = String(text || "").trim().toLowerCase().replace(/,/g, ".");
  const m = /^(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?\s*(k?v)\b/.exec(s);
  if (!m) return null;
  const k = m[3] === "kv" ? 1000 : 1;
  const out = { primary: Math.round(parseFloat(m[1]) * k) };
  if (m[2] !== undefined) out.secondary = Math.round(parseFloat(m[2]) * k);
  return out;
}

/** 400 → "400 V", 11000 → "11 kV", 3300 → "3.3 kV". */
export function formatVoltage(volts) {
  if (!volts) return "";
  if (volts < 1000) return `${volts} V`;
  const kv = volts / 1000;
  return `${Number.isInteger(kv) ? kv : +kv.toFixed(2)} kV`;
}

/** "11 kV" + 400 → "11/0.4 kV" — the ratio as surveyors write it. */
export function formatRatio(primary, secondary) {
  const hi = primary >= 1000, kv = v => (v / 1000).toString().replace(/^0\./, "0.");
  if (hi) return `${kv(primary)}/${kv(secondary)} kV`;
  return `${primary}/${secondary} V`;
}

const MV_GEAR = [MV_INCOMER, MV_BUSBAR, RMU];
const LV_GEAR = [LV_BUSBAR, MCC, FEEDER];

/** The LV level this sheet already uses (its most common LV busbar voltage), default 400 V. */
export function usualLvVolts(items, order) {
  const counts = new Map();
  for (const id of order) {
    const it = items[id];
    if (it.type !== LV_BUSBAR) continue;
    const v = parseVoltage(it.voltage);
    if (v && v.primary < 1000) counts.set(v.primary, (counts.get(v.primary) || 0) + 1);
  }
  let best = 400, n = 0;
  for (const [v, c] of counts) if (c > n) { best = v; n = c; }
  return best;
}

/** The voltage a new row of `type` fed from `supply` would carry, or "". */
export function proposeVoltage(items, order, type, supply) {
  if (!supply) return "";
  const canon = ALIASES[String(type).trim().toLowerCase()] || null;
  const sv = parseVoltage(supply.voltage);
  if (supply.type === TRANSFORMER) {
    return sv && sv.secondary ? formatVoltage(sv.secondary) : "";
  }
  if (MV_GEAR.includes(supply.type)) {
    if (!sv) return "";
    if (canon === TRANSFORMER) return formatRatio(sv.primary, usualLvVolts(items, order));
    return formatVoltage(sv.primary);
  }
  if (LV_GEAR.includes(supply.type) || supply.type === GENERATOR) {
    if (!sv) return "";
    if (canon === TRANSFORMER) return "";           /* an LV/LV or motor transformer: the ratio is the surveyor's call */
    return formatVoltage(sv.primary);
  }
  return "";
}

/** The usual protection for `type` fed from `supply` (a transformer off an MV busbar has a breaker, not a fuse-switch). */
export function proposeProt(type, supply) {
  let prot = TYPE_DEFAULT_PROT[type] || "";
  if (type === "Transformer" && supply && supply.type === MV_BUSBAR) prot = "CB";
  if (type === "Transformer" && supply && LV_GEAR.includes(supply.type)) prot = "CB";
  if (type === "Pump" && supply && MV_GEAR.includes(supply.type)) prot = "Fuse-contactor";
  if (type === "Pump" && supply && supply.type === LV_BUSBAR) prot = "CB";
  return prot;
}

/**
 * Propose a whole row. `items`/`order` is the current model (buildModel of the
 * rows on the sheet); `type` the Type label chosen (may be ""); `targetId` the
 * supply the item was dropped on (""); `sibling` the row above, whose supply
 * is proposed when there is no target.
 */
export function proposeRow(items, order, { type = "", targetId = "", sibling = null } = {}) {
  const row = { id: "", type, desc: "", rating: "", voltage: "", prot: "", from: "", notes: "", proposed: [] };
  const mark = f => { if (row[f] && !row.proposed.includes(f)) row.proposed.push(f); };

  row.from = targetId || (sibling && sibling.from ? sibling.from.trim() : "");
  mark("from");
  const supplyId = row.from.split(",").map(s => s.trim()).filter(Boolean)[0] || "";
  const supply = supplyId && items[supplyId] ? items[supplyId] : null;

  if (type) {
    row.id = nextId(type, order); mark("id");
    row.prot = proposeProt(type, supply);
    if (type === "RMU" && row.from.includes(",")) row.prot = "LBS, LBS";
    mark("prot");
    row.voltage = proposeVoltage(items, order, type, supply); mark("voltage");
  }
  return row;
}
