/* Which supply can feed which row — one table, read by the reader, the
 * proposal and the page's Feeds From picker.
 *
 * The knowledge used to sit in two places: model.js judged an impossible
 * supply, and the picker judged nothing at all and offered every ID on the
 * sheet as an equal. Here it is once, as a pure function of two canonical
 * types (constitution §2: nothing below reads or writes topology — it only
 * says what a supply would mean if the surveyor chose it).
 *
 *   supplyRank(parentType, childType) → 2 usual | 1 possible | 0 impossible
 *   canSupply(parentType, childType)  → the reader's predicate (rank > 0)
 *   supplyCandidates(items, order, childType, opts) → every ID, best first
 *   defaultSupply(items, order, childType) → the one a new row starts on
 */
import { MV_INCOMER, RMU, MV_BUSBAR, TRANSFORMER, PUMP, GENERATOR, LV_BUSBAR, FEEDER, MCC, BUS_COUPLER, CAPACITOR, EARTHING, ARRESTER, TERMINALS, TYPE_LABELS } from "./types.js";

/* the usual supplies of each row type, best first: what a surveyor would
   reach for, and what the engine has nothing to say about */
export const USUAL_SUPPLIES = {
  [MV_INCOMER]:  [],                                                  /* a root: the utility is off the sheet */
  [MV_BUSBAR]:   [MV_INCOMER, TRANSFORMER, MV_BUSBAR, RMU, GENERATOR],
  [RMU]:         [MV_INCOMER, RMU, MV_BUSBAR, TRANSFORMER, GENERATOR],
  [TRANSFORMER]: [MV_BUSBAR, RMU, LV_BUSBAR, MV_INCOMER, GENERATOR],
  [GENERATOR]:   [TRANSFORMER],                                       /* through its step-up; otherwise a root */
  [LV_BUSBAR]:   [TRANSFORMER, FEEDER, LV_BUSBAR, MCC, GENERATOR],
  [MCC]:         [LV_BUSBAR, MCC, TRANSFORMER],
  [PUMP]:        [LV_BUSBAR, MCC, MV_BUSBAR, RMU, TRANSFORMER],
  [FEEDER]:      [LV_BUSBAR, MCC, MV_BUSBAR, RMU],
  [BUS_COUPLER]: [LV_BUSBAR, MV_BUSBAR, GENERATOR],
  [CAPACITOR]:   [LV_BUSBAR, MV_BUSBAR, RMU, TRANSFORMER],
  [EARTHING]:    [LV_BUSBAR, MV_BUSBAR, RMU, TRANSFORMER],
  [ARRESTER]:    [LV_BUSBAR, MV_BUSBAR, RMU, TRANSFORMER],
};

/** How well a `parentType` supplies a `childType`: 2 usual, 1 possible, 0 impossible. */
export function supplyRank(parentType, childType){
  if(!parentType || !childType) return 0;
  /* rank 0 is the reader's own judgement, verbatim: these draw floating */
  if([PUMP,BUS_COUPLER].concat(TERMINALS).includes(parentType)) return 0;
  if(parentType===FEEDER && ![LV_BUSBAR,MCC].includes(childType)) return 0;
  if(parentType===MV_INCOMER && [PUMP,FEEDER,MCC,LV_BUSBAR].concat(TERMINALS).includes(childType)) return 0;
  return (USUAL_SUPPLIES[childType]||[]).includes(parentType) ? 2 : 1;
}

/** Can a `parentType` feed a `childType` at all? model.js's IMPOSSIBLE_SUPPLY. */
export function canSupply(parentType, childType){ return supplyRank(parentType, childType) > 0; }

/* the types whose supply is off the sheet: the reader lets them stand with no
   Feeds From, and a new one is proposed without a supply */
export const ROOT_TYPES = [MV_INCOMER, GENERATOR];

/** Is `type` a root — an incomer or a generator, fed from outside the drawing? */
export function isRoot(type){ return ROOT_TYPES.includes(type); }

/** The Type label a canonical type is written with ("lv busbar" → "LV Busbar"). */
export function typeLabel(type){
  const e = TYPE_LABELS.find(t => t[1]===type && !t[2]);
  return e ? e[0] : String(type||"");
}

function candidateLabel(item, rank, childType){
  const head = typeLabel(item.type) + (item.desc ? " · " + item.desc : "");
  if(rank===2) return head;
  const kid = typeLabel(childType);
  return head + (rank===1 ? ` — unusual for a ${kid}` : ` — cannot feed a ${kid}`);
}

/**
 * Every ID on the sheet as a possible supply for a new `childType`, best
 * first: the usual supplies in the order of the table above, then what is
 * merely possible, then what the reader would call impossible. Nothing is
 * hidden — the order is the advice. Within one supply type the bottom-most
 * row wins, because a survey is filled downwards and the newest board is
 * the one being worked on.
 *
 *   exclude    — IDs to leave out (the row's own, the ones already named)
 *   sameKindAs — a canonical type to promote within its rank: the second end
 *                of a bus coupler, or the second link of a ring RMU
 */
export function supplyCandidates(items, order, childType, { exclude = [], sameKindAs = null } = {}){
  const skip = new Set(exclude.map(s => String(s||"").trim()).filter(Boolean));
  const usual = USUAL_SUPPLIES[childType] || [];
  const out = [];
  order.forEach((id, at) => {
    if(skip.has(id)) return;
    const it = items[id];
    if(!it) return;
    const rank = supplyRank(it.type, childType), pref = usual.indexOf(it.type);
    out.push({ id, type: it.type, rank, label: candidateLabel(it, rank, childType),
      _kin: sameKindAs && it.type===sameKindAs ? 0 : 1,
      _pref: pref<0 ? usual.length : pref, _at: at });
  });
  out.sort((a,b) => b.rank-a.rank || a._kin-b._kin || a._pref-b._pref || b._at-a._at);
  return out.map(({id,type,rank,label}) => ({id,type,rank,label}));
}

/** The supply a new `childType` starts on: the best candidate that can feed it, else "". */
export function defaultSupply(items, order, childType){
  if(isRoot(childType)) return "";        /* its supply is off the sheet */
  const best = supplyCandidates(items, order, childType).find(c => c.rank>0);
  return best ? best.id : "";
}
