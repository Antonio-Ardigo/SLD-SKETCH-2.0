/* ------------------------------------------------ types */
const MV_INCOMER="mv incomer", RMU="rmu", MV_BUSBAR="mv busbar",
      TRANSFORMER="transformer",
      PUMP="pump", GENERATOR="generator",
      LV_BUSBAR="lv busbar",
      FEEDER="feeder", MCC="mcc", BUS_COUPLER="bus coupler",
      CAPACITOR="capacitor bank", EARTHING="earthing",
      ARRESTER="surge arrester";
const TERMINALS=[CAPACITOR,EARTHING,ARRESTER];   /* loads with no outgoing */
const LV_LOADS=[FEEDER,MCC,PUMP].concat(TERMINALS);

/* An ID as identity. A survey is typed by hand, often over days and by more
   than one person, so "BB1", "bb1" and "BB 1" are one board — and every part
   of the app must agree about that, or it contradicts itself: the reader used
   to call "bb1" an unknown ID while the proposal refused to hand out "BB1"
   because it considered "bb1" to be holding it. Matching is still exact
   first; this is what a miss falls back to. */
const idKey = s => String(s==null?"":s).trim().toLowerCase().replace(/\s+/g,"");

const TYPE_LABELS = [
  ["MV Incomer", MV_INCOMER], ["MV Busbar", MV_BUSBAR], ["RMU", RMU],
  ["Generator", GENERATOR], ["Transformer", TRANSFORMER],
  ["Pump", PUMP],
  ["LV Busbar", LV_BUSBAR],
  ["Feeder", FEEDER], ["MCC", MCC], ["Bus Coupler", BUS_COUPLER],
  ["Capacitor Bank", CAPACITOR], ["Earthing/NER", EARTHING],
  ["Surge Arrester", ARRESTER],
  /* symbol variants of a family: the Type label chooses the glyph, the family the behaviour */
  ["UPS", TRANSFORMER, "ups"], ["Inverter", GENERATOR, "inverter"], ["Battery", GENERATOR, "battery"],
  ["DC Busbar", LV_BUSBAR, "dc"],
];
/* a Type label that is a variant of a family: {normalised label: variant} */
const TYPE_VARIANTS = {
  "ups":"ups", "ups system":"ups", "static ups":"ups", "uninterruptible power supply":"ups",
  "inverter":"inverter", "pv inverter":"inverter", "solar inverter":"inverter", "string inverter":"inverter", "central inverter":"inverter",
  "battery":"battery", "bess":"battery", "battery storage":"battery", "energy storage":"battery", "battery bank":"battery",
  "dc busbar":"dc", "dc board":"dc", "dc distribution":"dc", "dc distribution board":"dc", "dc bus":"dc",
};
const ALIASES = {
  "ups":TRANSFORMER, "ups system":TRANSFORMER, "static ups":TRANSFORMER, "uninterruptible power supply":TRANSFORMER,
  "inverter":GENERATOR, "pv inverter":GENERATOR, "solar inverter":GENERATOR, "string inverter":GENERATOR, "central inverter":GENERATOR,
  "battery":GENERATOR, "bess":GENERATOR, "battery storage":GENERATOR, "energy storage":GENERATOR, "battery bank":GENERATOR,
  "dc busbar":LV_BUSBAR, "dc board":LV_BUSBAR, "dc distribution":LV_BUSBAR, "dc distribution board":LV_BUSBAR, "dc bus":LV_BUSBAR,
  "mv incomer":MV_INCOMER, "incomer":MV_INCOMER, "mv":MV_INCOMER,
  "rmu":RMU, "ring main unit":RMU,
  "mv busbar":MV_BUSBAR, "mv board":MV_BUSBAR, "mv switchboard":MV_BUSBAR,
  "mv distribution board":MV_BUSBAR,
  "transformer":TRANSFORMER, "trafo":TRANSFORMER, "tx":TRANSFORMER,
  "su transformer":TRANSFORMER, "su tx":TRANSFORMER,   /* older sheets */
  "su trafo":TRANSFORMER, "step-up transformer":TRANSFORMER,
  "step up transformer":TRANSFORMER, "step-up":TRANSFORMER,
  "step up":TRANSFORMER,
  "pump":PUMP, "motor":PUMP, "load":PUMP,
  "generator":GENERATOR, "gen":GENERATOR, "genset":GENERATOR,
  "gen set":GENERATOR, "dg":GENERATOR, "alternator":GENERATOR,
  "lv busbar":LV_BUSBAR, "busbar":LV_BUSBAR, "lv board":LV_BUSBAR,
  "lv switchboard":LV_BUSBAR,
  "feeder":FEEDER, "lv feeder":FEEDER, "outgoing":FEEDER,
  "mcc":MCC, "motor control centre":MCC, "motor control center":MCC,
  "bus coupler":BUS_COUPLER, "coupler":BUS_COUPLER,
  "capacitor bank":CAPACITOR, "capacitor":CAPACITOR, "capacitors":CAPACITOR,
  "cap bank":CAPACITOR, "pfc":CAPACITOR, "power factor correction":CAPACITOR,
  "earthing":EARTHING, "ner":EARTHING, "ngr":EARTHING,
  "neutral earthing resistor":EARTHING, "neutral grounding resistor":EARTHING,
  "neutral resistor":EARTHING, "earthing resistor":EARTHING,
  "earthing transformer":EARTHING, "earthing tx":EARTHING,
  "grounding transformer":EARTHING, "earthing/ner":EARTHING,
  "surge arrester":ARRESTER, "arrester":ARRESTER,
  "lightning arrester":ARRESTER, "surge":ARRESTER
};
/* words in Description / Notes that say what a row is, whatever its Type */
const CAP_WORDS=["capacitor","pfc","kvar","power factor"];
const EARTH_WORDS=["ner","ngr","earthing","grounding","neutral","zig-zag","zigzag"];
const ARRESTER_WORDS=["arrester","surge"];
function words(item){ return (item.desc+" "+item.notes).toLowerCase(); }
function hasWord(text, ws){
  return ws.some(w=>new RegExp("(?<![a-z])"+w.replace(/[.*+?^${}()|[\]\\/-]/g,"\\$&")+"(?![a-z])").test(text));
}
function earthBelow(items, tx){
  /* a transformer with nothing on its output whose row says earthing /
     NER / zig-zag is an earthing transformer: it ends in an earth */
  return tx.type===TRANSFORMER
    && !Object.values(items).some(c=>c.parents.includes(tx.id))
    && hasWord(words(tx),EARTH_WORDS);
}
function stateWords(item){
  /* Notes that change how the item's way is drawn: spare / future / out of
     service dash the conductor, VSD puts a drive box on a motor's drop,
     N.O. marks an open way */
  const n=item.notes.trim().toLowerCase(), out=new Set();
  if(["spare","future","out of service","o/s"].some(w=>n.startsWith(w))) out.add("spare");
  if(hasWord(words(item),["vsd","vfd","drive"])) out.add("vsd");
  if(hasWord(n,["n.o.","n.o","normally open","open point","ring open","open here"])) out.add("no");
  return out;
}
const PROT_ALIASES = {
  "cb":"cb", "circuit breaker":"cb", "breaker":"cb", "acb":"cb",
  "mccb":"cb", "mcb":"cb", "vcb":"cb",
  "lbs":"lbs", "load break switch":"lbs", "load-break switch":"lbs",
  "switch":"lbs", "isolator":"lbs", "disconnector":"lbs",
  "fuse":"fuse", "fuses":"fuse",
  "fuse-switch":"fuse-switch", "fuse switch":"fuse-switch",
  "switch-fuse":"fuse-switch", "switch fuse":"fuse-switch",
  "sfu":"fuse-switch",
  "contactor":"contactor", "vacuum contactor":"contactor",
  "fuse-contactor":"fuse-contactor", "fuse contactor":"fuse-contactor",
  "fused contactor":"fuse-contactor", "contactor-fuse":"fuse-contactor",
  "motor starter":"fuse-contactor", "starter":"fuse-contactor"
};
/* Protection entry for item's supply from parentId: [raw, kind|null].
   One value covers every supply; a comma list matches Feeds From order. */
function protFor(item, parentId){
  if(!item.prots || !item.prots.length) return ["", null];
  let raw=item.prots[0];
  const named=item.supplies||item.parents;   /* the list the devices were written against */
  if(parentId!=null && item.prots.length>1 && named.includes(parentId)){
    const i=named.indexOf(parentId);
    if(i<item.prots.length) raw=item.prots[i];
  }
  return [raw, PROT_ALIASES[raw.toLowerCase().split(/\s+/).join(" ")]||null];
}

export { MV_INCOMER, RMU, MV_BUSBAR, TRANSFORMER, PUMP, GENERATOR, LV_BUSBAR, FEEDER, MCC, BUS_COUPLER, CAPACITOR, EARTHING, ARRESTER, TERMINALS, LV_LOADS, TYPE_LABELS, ALIASES, CAP_WORDS, EARTH_WORDS, ARRESTER_WORDS, words, hasWord, earthBelow, stateWords, PROT_ALIASES, protFor, TYPE_VARIANTS, idKey };
