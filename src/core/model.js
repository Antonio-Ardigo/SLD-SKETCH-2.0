import { MV_INCOMER, RMU, MV_BUSBAR, TRANSFORMER, PUMP, GENERATOR, LV_BUSBAR, FEEDER, MCC, BUS_COUPLER, CAPACITOR, EARTHING, ARRESTER, TERMINALS, ALIASES, CAP_WORDS, EARTH_WORDS, ARRESTER_WORDS, words, hasWord, earthBelow, PROT_ALIASES, TYPE_VARIANTS } from "./types.js";
import { genFeeds } from "./geometry.js";
import { canSupply, isRoot } from "./supplies.js";
import { txBoard } from "./layout.js";
import { makeDiag } from "./diagnostics.js";

/* ------------------------------------------------ model helpers */
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function childrenOf(items, order, pid, types){
  const out=[];
  for(const oid of order){
    const it=items[oid];
    if(it.parents.includes(pid) && (!types || types.includes(it.type))) out.push(it);
  }
  return out;
}

/* build items from table rows; returns {items, order, errors, warnings} */
function buildModel(rows){
  const items={}, order=[], errors=[], warnings=[], diagnostics=[];
  /* every message is also a structured diagnostic: code + the rows it names */
  const warn=(code,ids,msg,row)=>{ warnings.push(msg); diagnostics.push(makeDiag(code,ids,msg,row)); };
  const err=(code,ids,msg,row)=>{ errors.push(msg); diagnostics.push(makeDiag(code,ids,msg,row)); };
  rows.forEach((r,i)=>{
    const id=r.id.trim();
    if(!id){
      const any=[r.type,r.desc,r.rating,r.voltage,r.from,r.notes].some(v=>v.trim());
      if(any) warn("ROW_NO_ID",[],`Row ${i+1} has data but no ID — it is ignored.`,i+1);
      return;
    }
    if(items[id]){ err("DUP_ID",[id],`Duplicate ID "${id}" (row ${i+1}).`,i+1); return; }
    const rawType=r.type.trim().toLowerCase().replace(/\s+/g," ");
    const type = ALIASES[rawType] || null;
    if(!type) warn("UNKNOWN_TYPE",[id],`Row "${id}": unknown type "${r.type}" — drawn as a feeder.`);
    items[id]={ id, type: type||FEEDER, desc:r.desc.trim(), rating:r.rating.trim(),
      voltage:r.voltage.trim(), notes:r.notes.trim(),
      parents:r.from.split(",").map(s=>s.trim()).filter(Boolean),
      prots:(r.prot||"").split(",").map(s=>s.trim()).filter(Boolean),
      variant:TYPE_VARIANTS[rawType]||null, label:r.type.trim(),   /* the symbol variant and the label the surveyor wrote */
      x:null, xLeft:null, xRight:null, land:{}, tee:{} };
    order.push(id);
  });
  for(const id of order){           /* a feeder row whose words say capacitor
                                       bank / NER / arrester is that item */
    const it=items[id];
    if(it.type===FEEDER){
      const w=words(it);
      if(hasWord(w,CAP_WORDS)) it.type=CAPACITOR;
      else if(hasWord(w,ARRESTER_WORDS)) it.type=ARRESTER;
      else if(hasWord(w,EARTH_WORDS)) it.type=EARTHING;
    }
  }
  /* rows that feed from each other round a loop that no supply reaches
     (a ring of RMUs is a loop too, but an incomer feeds it) */
  const anc={};
  for(const id of order){
    const seen=new Set(), stack=[...items[id].parents];
    while(stack.length){
      const q=stack.pop();
      if(seen.has(q) || !items[q]) continue;
      seen.add(q); stack.push(...items[q].parents);
    }
    anc[id]=seen;
  }
  const seenLoops=new Set();
  for(const id of order){
    if(!anc[id].has(id)) continue;                       /* not on a loop */
    if([...anc[id]].some(a=>!items[a].parents.length)) continue;  /* a root feeds it */
    const loop=[...anc[id]].filter(x=>anc[x].has(id)).sort();
    const key=loop.join("|");
    if(!seenLoops.has(key)){
      seenLoops.add(key);
      warn("LOOP_NO_SUPPLY",loop,loop.map(n=>`"${n}"`).join(", ")+` feed from each other — the loop has no supply; drawn floating.`);
    }
  }
  for(const id of order){
    const it=items[id];
    for(const p of it.parents)
      if(!items[p]) err("UNKNOWN_SUPPLY",[id,p],`"${id}" feeds from unknown ID "${p}" — check the Feeds from column.`);
    if(it.type===TRANSFORMER){
      const up=order.map(q=>items[q]).filter(c=>c.parents.includes(it.id)
                                            && [MV_BUSBAR,RMU].includes(c.type));
      const dn=order.map(q=>items[q]).filter(c=>c.parents.includes(it.id)
                                            && c.type===LV_BUSBAR);
      if(up.length && dn.length)
        warn("TX_BOTH_LEVELS",[id],`"${id}" feeds both an MV and an LV board — drawn as a step-up.`);
    }
    if([TRANSFORMER].includes(it.type) && !it.parents.length)
      warn("TX_NO_SUPPLY",[id],`"${id}" has no Feeds From — drawn with an open supply terminal.`);
    else if(!it.parents.length && !isRoot(it.type))
      warn("NO_SUPPLY",[id],`"${id}" has no Feeds From — drawn without a supply.`);
    /* a supply that cannot feed this row: the row draws floating */
    for(const p of it.parents){
      if(!items[p]) continue;
      const pt=items[p].type;
      if(!canSupply(pt,it.type))
        warn("IMPOSSIBLE_SUPPLY",[id,p],`"${id}" feeds from "${p}" (${pt}) — a ${pt} cannot supply a ${it.type}; drawn floating.`);
    }
    if(it.type===MCC || it.type===PUMP)
      for(const p of it.parents)
        if(items[p] && items[p].type===TRANSFORMER && txBoard(items,items[p]))
          warn("LOAD_ON_BOARD_TX",[id,p],`"${id}" feeds from transformer "${p}", which feeds board "${txBoard(items,items[p]).id}" — drawn as a way of that board (put the board in Feeds From).`);
    if(it.type===MCC)
      for(const p of it.parents)
        if(items[p] && [MV_BUSBAR,RMU].includes(items[p].type))
          warn("MCC_ON_MV",[id,p],`MCC "${id}" feeds from MV gear "${p}" — an MCC is an LV assembly; add a transformer and an LV board in between.`);
        else if(items[p] && ![LV_BUSBAR,MCC,TRANSFORMER].includes(items[p].type))
          warn("MCC_BAD_SUPPLY",[id,p],`MCC "${id}" feeds from "${p}" (${items[p].type}) — an MCC takes its supply from an LV board, an MCC or a transformer.`);
    if(it.type===TRANSFORMER && it.parents.length
       && !order.some(q=>items[q].parents.includes(it.id))
       && !earthBelow(items,it))
      warn("TX_NO_LOAD",[id],`"${id}" has nothing on its output — drawn with an open outgoing terminal; put "${id}" in the Feeds From of whatever it supplies.`);
    if(it.type===GENERATOR && !order.some(q=>items[q].parents.includes(it.id))
       && !it.parents.some(p=>items[p] && items[p].type===TRANSFORMER)
       && !genFeeds(items,order,it).length)
      warn("GEN_NO_LOAD",[id],`Generator "${id}" feeds nothing.`);
    if(it.prots.length && it.type===MV_INCOMER)
      warn("PROT_ON_INCOMER",[id],`"${id}": protection on an MV incomer is on the utility side — not drawn.`);
    else if(![LV_BUSBAR,MV_BUSBAR,BUS_COUPLER].includes(it.type))
      for(const raw of it.prots)
        if(!PROT_ALIASES[raw.toLowerCase().split(/\s+/).join(" ")])
          warn("UNKNOWN_PROT",[id],`"${id}": unknown protection "${raw}" — the default symbol is drawn.`);
  }
  return {items, order, errors, warnings, diagnostics};
}

export { esc, childrenOf, buildModel };
