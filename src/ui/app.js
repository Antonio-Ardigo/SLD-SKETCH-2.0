import { TYPE_LABELS, ALIASES, TYPE_VARIANTS, MV_INCOMER, MV_BUSBAR, RMU, TRANSFORMER, PUMP, GENERATOR, LV_BUSBAR, FEEDER, MCC, BUS_COUPLER, CAPACITOR, EARTHING } from "../core/types.js";
import { esc, buildModel } from "../core/model.js";
import { layout } from "../core/layout.js";
import { applyView } from "../core/geometry.js";
import { normalizeView, VIEW_DEFAULTS } from "../core/views.js";
import { render } from "../core/render.js";
import { renderDxf } from "../core/dxf.js";
import { renderPdf } from "../core/pdf.js";
import { SVG } from "../core/svg.js";
import { symbolForType } from "../core/symbols/registry.js";
import { proposeRow, nextId } from "../core/propose.js";
import { supplyCandidates, typeLabel } from "../core/supplies.js";
import { protCandidates } from "../core/protection.js";
import { renameReferences, canFollowRename } from "../core/edit.js";
import { couplerDiagnostics } from "../core/couplers.js";
import { HEADERS, FIELDS, rowsToCsv, readCsv, readTable } from "../io/csv.js";
import { R, PRESETS } from "./presets.generated.js";

/* ------------------------------------------------ UI wiring */
let state={info:{site:"",date:"",by:"",notes:""},rows:[]};
let view_={...VIEW_DEFAULTS};      /* the view options: stored beside the table, never in it */

const $=s=>document.querySelector(s);
const eqbody=$("#eqbody");

/* the row's own Type label is kept as an option of its own when the sheet it
   came from wrote it another way ("PFC", "Genset", "Trafo"): the engine reads
   it, so the table must show it rather than an empty cell */
function typeSelect(value){
  const v=(value||"").trim();
  const own=v && !TYPE_LABELS.some(([lbl])=>lbl===v)
    ? [`<option selected>${esc(v)}</option>`] : [];
  const opts=['<option value=""></option>'].concat(own,
    TYPE_LABELS.map(([lbl])=>`<option${lbl===v?" selected":""}>${lbl}</option>`));
  return `<select data-f="type" aria-label="Type">${opts.join("")}</select>`;
}
const PROPOSED_TITLE="proposed by the engine — edit to confirm";
/* the four cells with a list of their own: the page draws it (see the value
   pickers below), so the browser's autofill must keep out of the way */
const LIST=' autocomplete="off"';
function rebuildTable(){
  eqbody.innerHTML=state.rows.map((r,i)=>{
    const p=new Set(r._p||[]);
    const mk=f=>p.has(f)?` class="proposed" title="${PROPOSED_TITLE}"`:"";
    return `<tr data-i="${i}">
    <td><input data-f="id" value="${esc(r.id)}" aria-label="ID"${mk("id")}></td>
    <td>${typeSelect(r.type)}</td>
    <td><input data-f="desc" value="${esc(r.desc)}" aria-label="Description"${mk("desc")}></td>
    <td><input data-f="rating" value="${esc(r.rating)}" aria-label="Rating"${LIST}${mk("rating")}></td>
    <td><input data-f="voltage" value="${esc(r.voltage)}" aria-label="Voltage"${LIST}${mk("voltage")}></td>
    <td><input data-f="prot" value="${esc(r.prot||"")}" aria-label="Protection"${LIST}${mk("prot")}></td>
    <td><input data-f="from" value="${esc(r.from)}" aria-label="Feeds from"${LIST}${mk("from")}></td>
    <td><input data-f="notes" value="${esc(r.notes)}" aria-label="Notes"></td>
    <td class="rowops">
      <button data-op="up" title="Move up">&uarr;</button><button data-op="down" title="Move down">&darr;</button><button data-op="del" class="del" title="Delete row">&times;</button>
    </td>
  </tr>`;
  }).join("");
}
function readInfoInputs(){
  state.info={site:$("#i-site").value,date:$("#i-date").value,
              by:$("#i-by").value,notes:$("#i-notes").value};
}
function writeInfoInputs(){
  $("#i-site").value=state.info.site; $("#i-date").value=state.info.date;
  $("#i-by").value=state.info.by; $("#i-notes").value=state.info.notes;
}

/* which table row a message is about: the first quoted token that is a row
   ID, or "Row N"; -1 when the message names no row */
function messageRow(msg){
  const m=/^Row (\d+)/.exec(msg);
  if(m) return +m[1]-1;
  for(const q of msg.matchAll(/"([^"]+)"/g)){
    const i=state.rows.findIndex(r=>r.id.trim()===q[1]);
    if(i>=0) return i;
  }
  return -1;
}
/* the problems box: errors first, then warnings, each pointing at its row;
   a diagnostic that carries a fix (an unknown supply with a likely ID) gets a
   button that applies it — one click, and only that click, changes the table */
function showProblems(diagnostics){
  const probs=$("#problems");
  const rowOf=d=>d.row!==undefined?d.row-1:messageRow(d.message);
  const line=d=>{
    const i=rowOf(d), cls=d.level==="error"?"err":"warn";
    const fix=d.fix?` <button type="button" class="fix" data-fix="${esc(JSON.stringify(d.fix))}" title="Write ${esc(d.fix.to)} into the Feeds from of ${esc(d.fix.id)}">use ${esc(d.fix.to)}</button>`:"";
    return `<div class="${cls}"${i>=0?` data-row="${i}"`:""}>${esc(d.message)}${fix}</div>`;
  };
  const ordered=diagnostics.filter(d=>d.level==="error").concat(diagnostics.filter(d=>d.level!=="error"));
  probs.innerHTML=ordered.map(line).join("");
  probs.hidden=!ordered.length;
  for(const tr of eqbody.querySelectorAll("tr")) tr.classList.remove("err","warn");
  for(const d of ordered){ const tr=eqbody.querySelector(`tr[data-i="${rowOf(d)}"]`); if(tr) tr.classList.add(d.level==="error"?"err":"warn"); }
}
$("#problems").addEventListener("click",e=>{
  const b=e.target.closest("button.fix"); if(!b) return;
  e.stopPropagation();
  const fix=JSON.parse(b.dataset.fix), i=rowIndexOf(fix.id); if(i<0) return;
  snapshot(true);
  const row=state.rows[i];
  row[fix.field]=row[fix.field].split(",").map(s=>s.trim()).filter(Boolean).map(t=>t===fix.from?fix.to:t).join(", ");
  clearMark(row,fix.field);
  const el=eqbody.querySelector(`tr[data-i="${i}"] [data-f="${fix.field}"]`); if(el){ el.value=row[fix.field]; el.classList.remove("proposed"); }
  redraw(); persist();
});
/* a stamp of what the drawing was made from, so a test can tell a fresh
   drawing from a stale one without guessing (the baseline reads it) */
function modelRev(){
  let h=5381; const s=JSON.stringify(state.rows.map(r=>[r.id,r.type,r.desc,r.rating,r.voltage,r.prot,r.from,r.notes]))+JSON.stringify(view_);
  for(let i=0;i<s.length;i++) h=((h*33)^s.charCodeAt(i))>>>0;
  return h.toString(36);
}
function redraw(){
  const {items,order,warnings,diagnostics}=buildModel(state.rows);
  if(!order.length){
    $("#sheet").innerHTML="";
    const probs=$("#problems");
    probs.hidden=false;
    probs.innerHTML="<div>No equipment yet — add rows or load an example.</div>";
    for(const tr of eqbody.querySelectorAll("tr")) tr.classList.remove("err","warn");
    syncView();
    return;
  }
  /* an error never withholds the drawing: the row it names floats or is
     dropped, and the message says so (constitution §6) */
  applyView(view_);
  const width=layout(items,order);
  /* the couplers have their own say, from the same judgement the drawing
     draws them by — the box no longer reads it out of the drawing's prose */
  for(const d of couplerDiagnostics(items,order)){ diagnostics.push(d); warnings.push(d.message); }
  const svgStr=render(state.info,items,order,width);
  showProblems(diagnostics);
  $("#sheet").innerHTML=svgStr;
  $("#sheet").dataset.rev=modelRev();
  decorateSheet();
  syncView();
}

/* ------------------------------------------------ canvas: selection, palette, drag & drop */
/* Every symbol the engine draws sits in <g data-id="…" data-kind="…">. The
   page adds a transparent hit rectangle to each group (so a thin bar is easy
   to hit), highlights the selected row's symbol, lets a click on a symbol
   select its row, and accepts a symbol chip dropped on a busbar, RMU or
   transformer: that adds a row fed from the target. The table stays the only
   source of truth — the drop only writes a row. */
let selectedId=null;
function decorateSheet(){
  const svg=$("#sheet svg"); if(!svg) return;
  for(const g of svg.querySelectorAll("g[data-id]")){
    let bb; try{ bb=g.getBBox(); }catch(e){ continue; }
    if(!bb.width && !bb.height) continue;
    const pad=8, r=document.createElementNS("http://www.w3.org/2000/svg","rect");
    r.setAttribute("class","hit");
    r.setAttribute("x",bb.x-pad); r.setAttribute("y",bb.y-pad);
    r.setAttribute("width",bb.width+2*pad); r.setAttribute("height",bb.height+2*pad);
    /* the symbol's own extent, for picking between overlapping groups */
    r.dataset.bx=bb.x; r.dataset.by=bb.y; r.dataset.bw=bb.width; r.dataset.bh=bb.height;
    g.insertBefore(r,g.firstChild);
    if(g.dataset.id===selectedId) g.classList.add("sel");
  }
}
function selectId(id){
  selectedId=id||null;
  for(const g of document.querySelectorAll("#sheet svg g[data-id]")) g.classList.toggle("sel",g.dataset.id===selectedId);
}
/* what a drop lands on by preference: the things a row can feed from */
const DROP_TARGETS=["lv busbar","mv busbar","rmu","mcc","transformer","feeder","generator","mv incomer"];
/* when the point is where something will be fed FROM, a bar beats the way
   that leaves it at that very point (a feeder's dot sits on its board) */
const SUPPLY_ORDER=["lv busbar","mv busbar","rmu","mcc","transformer","generator","mv incomer","feeder"];
function symbolAt(clientX,clientY,asSupply){
  /* the groups under the point, topmost first; prefer one whose symbol
     itself (not just its padded hit area) contains the point, then a
     supply-side kind, then the topmost */
  const svg=$("#sheet svg"); if(!svg) return null;
  const groups=[];
  for(const el of document.elementsFromPoint(clientX,clientY)){
    const g=el.closest ? el.closest("#sheet svg [data-id]") : null;
    if(g && !groups.includes(g)) groups.push(g);
  }
  if(!groups.length) return null;
  let pt=null;
  try{ const m=svg.getScreenCTM(); if(m) pt=new DOMPoint(clientX,clientY).matrixTransform(m.inverse()); }catch(e){}
  const box=g=>{ const r=g.querySelector(":scope > rect.hit"); return r?{x:+r.dataset.bx,y:+r.dataset.by,w:+r.dataset.bw,h:+r.dataset.bh}:null; };
  const inside=g=>{
    const b=box(g); if(!b||!pt) return false; const s=4;
    return pt.x>=b.x-s && pt.x<=b.x+b.w+s && pt.y>=b.y-s && pt.y<=b.y+b.h+s;
  };
  /* the smallest symbol containing the point wins: a bar over the MCC
     whose enclosure starts at that bar */
  const area=g=>{ const A=box(g); return (A.w+8)*(A.h+8); };
  const pref=g=>{ const i=SUPPLY_ORDER.indexOf(g.dataset.kind); return i<0?SUPPLY_ORDER.length:i; };
  const hits=groups.filter(inside).sort((a,b)=>(asSupply?pref(a)-pref(b):0) || area(a)-area(b));
  return hits[0] || groups.find(g=>DROP_TARGETS.includes(g.dataset.kind)) || groups[0];
}
function rowIndexOf(id){ return state.rows.findIndex(r=>r.id.trim()===id); }
/* the table row follows the selection both ways */
eqbody.addEventListener("focusin",e=>{
  const tr=e.target.closest("tr"); if(!tr) return;
  const row=state.rows[+tr.dataset.i]; if(row) selectId(row.id.trim());
});
/* ------------------------------------------------ proposals for a row being added */
/* The engine proposes the new row's values (ID, supply, protection, voltage)
   and they are written into the table, tinted until the surveyor edits them.
   Only at addition: an existing row is edited as usual. `_p` lists the fields
   still showing a proposal; it never leaves the page (not in the CSV, the
   workbook or the drawing). */
function currentModel(){
  const {items,order}=buildModel(state.rows);
  return [items,order];
}
/* a row object plus the marks; `sibling` is the row above when there is no target */
function proposedRow(type, targetId, sibling){
  const [items,order]=currentModel();
  const p=proposeRow(items,order,{type,targetId,sibling});
  const row=R(p.id,p.type,p.desc,p.rating,p.voltage,p.from,p.notes,p.prot);
  row._p=p.proposed.slice();
  return row;
}
/* fill a row that is still mostly a proposal — used when a Type is chosen on a
   blank row: only empty cells and cells still marked stay the engine's */
function refillProposal(row){
  const [items,order]=currentModel();
  const marks=new Set(row._p||[]);
  /* a supply the surveyor typed is kept and everything follows it; one still
     marked is re-proposed for the Type just chosen */
  const kept=row.from.trim() && !marks.has("from") ? row.from.trim() : "";
  const p=proposeRow(items,order,{type:row.type,targetId:kept});
  for(const f of ["from","id","prot","voltage"]){
    if(row[f].trim() && !marks.has(f)) continue;    /* the surveyor typed it: leave it */
    if(!p[f]){                    /* the new Type proposes nothing here: an
                                     earlier proposal must not be left behind
                                     (a generator has no supply and no device) */
      if(f!=="id" && marks.has(f)){ row[f]=""; marks.delete(f); }
      continue;
    }
    if(f==="id" && row.id.trim() && !marks.has("id")) continue;
    row[f]=p[f]; marks.add(f);
  }
  row._p=[...marks];
  return row;
}
function clearMark(row, field){
  if(!row._p) return;
  row._p=row._p.filter(f=>f!==field);
  if(!row._p.length) delete row._p;
}
function addRowFor(type, targetId){
  snapshot(true);
  const row=proposedRow(type,targetId,null);
  let at=state.rows.length;
  if(targetId){                       /* after the target's last way, else after the target */
    const ways=state.rows.map((r,i)=>r.from.split(",").map(s=>s.trim()).includes(targetId)?i:-1).filter(i=>i>=0);
    const ti=rowIndexOf(targetId);
    at=(ways.length?Math.max(...ways):ti)+1;
  }
  state.rows.splice(at,0,row);
  rebuildTable(); redraw(); persist();
  selectId(row.id); focusCell(at,"desc");
  return row;
}
/* one chip per type; the glyph is the legend's, drawn by the symbol registry */
function chipSvg(type,variant){
  const e=symbolForType(type,variant); if(!e) return "";
  const s=new SVG(); e.draw(s,24,4,34);
  return `<svg viewBox="0 0 48 44" aria-hidden="true">${s.parts.join("")}</svg>`;
}
function buildPalette(){
  const pal=$("#palette"); if(!pal) return;
  for(const [lbl,type,variant] of TYPE_LABELS){
    const b=document.createElement("button");
    b.className="chip"; b.type="button"; b.draggable=true; b.dataset.type=lbl;
    b.title=`Drag onto a busbar, RMU or transformer to add a ${lbl} fed from it; click to add one under the selected row`;
    b.innerHTML=chipSvg(type,variant)+esc(lbl);
    b.addEventListener("dragstart",e=>{
      e.dataTransfer.setData("text/sld-type",lbl); e.dataTransfer.setData("text/plain",lbl);
      e.dataTransfer.effectAllowed="copy";
    });
    b.addEventListener("click",()=>addRowFor(lbl, selectedId && rowIndexOf(selectedId)>=0 ? selectedId : ""));
    pal.appendChild(b);
  }
}
(function bindDrop(){
  const vp=$("#viewport"); let over=null;
  const isChip=e=>[...e.dataTransfer.types].includes("text/sld-type");
  const setOver=g=>{ if(over===g) return; if(over) over.classList.remove("over"); over=g; if(over) over.classList.add("over"); };
  vp.addEventListener("dragenter",e=>{ if(isChip(e)){ e.preventDefault(); vp.classList.add("dropping"); } });
  vp.addEventListener("dragover",e=>{
    if(!isChip(e)) return;
    e.preventDefault(); e.dataTransfer.dropEffect="copy";
    setOver(symbolAt(e.clientX,e.clientY,true));
  });
  vp.addEventListener("dragleave",e=>{ if(e.target===vp){ vp.classList.remove("dropping"); setOver(null); } });
  vp.addEventListener("drop",e=>{
    if(!isChip(e)) return;
    e.preventDefault();
    const type=e.dataTransfer.getData("text/sld-type");
    const g=symbolAt(e.clientX,e.clientY,true);
    vp.classList.remove("dropping"); setOver(null);
    addRowFor(type, g?g.dataset.id:"");
  });
})();

/* ------------------------------------------------ data entry helpers */
/* standard values, by what the row is */
const MV_TYPES=[MV_INCOMER,MV_BUSBAR,RMU], LV_TYPES=[LV_BUSBAR,FEEDER,MCC,BUS_COUPLER];
const QUICK={
  volt:{
    mv:["33 kV","22 kV","11 kV","6.6 kV","3.3 kV"],
    lv:["690 V","400 V","230 V","400/230 V"],
    tx:["33/11 kV","11/0.4 kV","11/0.69 kV","11/3.3 kV","6.6/0.4 kV","0.4/11 kV","0.4/0.4 kV","0.4/0.23 kV"],
    gen:["11 kV","400 V","690 V"],
    motor:["11 kV","3.3 kV","690 V","400 V"],
    dc:["110 V DC","220 V DC","48 V DC","24 V DC"],
  },
  rating:{
    board:["160 A","250 A","400 A","630 A","800 A","1250 A","1600 A","2000 A","2500 A","3200 A","4000 A"],
    feeder:["32 A","63 A","100 A","160 A","250 A","400 A","630 A","800 A"],
    tx:["315 kVA","500 kVA","630 kVA","800 kVA","1000 kVA","1250 kVA","1600 kVA","2000 kVA","2500 kVA","10 MVA"],
    motor:["11 kW","15 kW","22 kW","30 kW","37 kW","45 kW","55 kW","75 kW","110 kW","160 kW","250 kW","315 kW","355 kW","500 kW","1.5 MW"],
    gen:["250 kVA","500 kVA","800 kVA","1000 kVA","1250 kVA","1600 kVA","2000 kVA"],
    cap:["50 kvar","100 kvar","150 kvar","200 kvar","300 kvar","400 kvar","500 kvar","800 kvar"],
    ups:["10 kVA","20 kVA","40 kVA","60 kVA","100 kVA","200 kVA"],
    battery:["100 Ah","200 Ah","300 Ah","500 Ah"],
    ner:["10 A","25 A","50 A","100 A","200 A","400 A"],
  },
};
/* the quick values follow what the row *is*, not how its Type is spelled:
   an imported "PFC" or "Cap bank" is a capacitor bank and is offered kvar */
function canonType(type){ return ALIASES[String(type||"").trim().toLowerCase().replace(/\s+/g," ")]||null; }
/* the symbol variants are their own kind of equipment for these lists,
   whatever family they belong to */
function variantOf(type){ return TYPE_VARIANTS[String(type||"").trim().toLowerCase().replace(/\s+/g," ")]||null; }
function quickVolt(type){
  const v=variantOf(type);
  if(v==="dc"||v==="battery") return QUICK.volt.dc;
  if(v==="ups"||v==="inverter") return QUICK.volt.lv;
  const c=canonType(type);
  if(c===TRANSFORMER) return QUICK.volt.tx;
  if(c===GENERATOR) return QUICK.volt.gen;
  if(c===PUMP) return QUICK.volt.motor;
  if(MV_TYPES.includes(c)) return QUICK.volt.mv;
  if(LV_TYPES.includes(c)) return QUICK.volt.lv;
  return QUICK.volt.mv.concat(QUICK.volt.lv);
}
function quickRating(type){
  const v=variantOf(type);
  if(v==="ups"||v==="inverter") return QUICK.rating.ups;
  if(v==="battery") return QUICK.rating.battery;
  const c=canonType(type);
  if(c===TRANSFORMER) return QUICK.rating.tx;
  if(c===PUMP) return QUICK.rating.motor;
  if(c===GENERATOR) return QUICK.rating.gen;
  if(c===CAPACITOR) return QUICK.rating.cap;             /* kvar, however the Type is spelled */
  if(c===EARTHING) return QUICK.rating.ner;
  if([MV_BUSBAR,LV_BUSBAR,RMU,BUS_COUPLER,MCC].includes(c)) return QUICK.rating.board;
  if(c===FEEDER) return QUICK.rating.feeder;
  return QUICK.rating.board.concat(QUICK.rating.tx);
}
/* ------------------------------------------------ the value list for a cell
 *
 * Feeds from, Protection, Voltage and Rating each have a list of values worth
 * offering, and each used a native <datalist>. Every option reached the DOM
 * and the browser then showed only the ones matching what the cell already
 * said: open the Feeds from of a row that reads "BB1" and the list is one
 * line long. The engine's ranking and its labels — "LV Busbar · Board A",
 * "MCCB — a way out of a board", "unusual for a pump" — were never seen on a
 * cell that had been filled in, which is most of them.
 *
 * So the page draws the list itself. It opens on the cell, shows every
 * candidate whatever the cell says, and narrows only on what is typed after
 * the cell was entered — the one thing a person means by narrowing.
 */
const PICK_FIELDS=["from","prot","voltage","rating"];
const picker=$("#picker");
let pick={input:null, opts:[], shown:[], at:-1, opened:""}, accepting=false;

/* Every ID on the sheet except the row's own, ordered by what can feed this
   row's Type — the usual supplies first, then what merely draws, then what
   the reader would call impossible (supplies.js). Nothing is hidden; the
   order and the labels are the advice. Typing "BB1, " then offers the second
   supply, preferring another board of the same kind (the far end of a
   coupler, the second link of a ring). */
function supplyOptions(row, input){
  const ids=state.rows.map(r=>r.id.trim()).filter(Boolean);
  const own=(row.id||"").trim(), type=(row.type||"").trim();
  const v=input?input.value:"", k=v.lastIndexOf(",");
  const prefix=k>=0?v.slice(0,k+1).replace(/\s*$/," "):"";
  const taken=prefix.split(",").map(s=>s.trim()).filter(Boolean);
  const canon=ALIASES[type.toLowerCase().replace(/\s+/g," ")]||null;
  const [items,order]=currentModel();
  /* No Type on this row yet, so there is nothing to rank the supplies by —
     but every item is still offered, each saying what it is, so the list is
     a search of the equipment and not a wall of IDs. */
  if(!canon)
    return ids.filter(i=>i!==own && !taken.includes(i)).map(i=>{
      const it=items[i];
      return { value:prefix+i, label: it ? typeLabel(it.type)+(it.desc?" · "+it.desc:"") : "" };
    });
  const first=taken.length&&items[taken[0]]?items[taken[0]].type:null;
  return supplyCandidates(items,order,canon,{exclude:[own,...taken],sameKindAs:first})
    .map(c=>({value:prefix+c.id, label:c.label}));
}
function optionsFor(f, i, input){
  const row=state.rows[i]||{}, type=(row.type||"").trim();
  if(f==="from") return supplyOptions(row,input);
  if(f==="prot") return protCandidates(canonType(type),variantOf(type)).map(c=>({value:c.value,label:c.label}));
  if(f==="voltage") return quickVolt(type).map(v=>({value:v,label:""}));
  if(f==="rating") return quickRating(type).map(v=>({value:v,label:""}));
  return [];
}
/* what is typed after the cell was entered, and only that: a value already in
   the cell is what you came to change, not what you are searching for */
function pickShown(){
  const v=pick.input.value;
  if(v===pick.opened) return pick.opts;
  const k=v.lastIndexOf(",");
  const frag=(k>=0?v.slice(k+1):v).trim().toLowerCase();
  if(!frag) return pick.opts;
  return pick.opts.filter(o=>{
    const val=o.value.slice(o.value.lastIndexOf(",")+1).trim().toLowerCase();
    return val.includes(frag) || o.label.toLowerCase().includes(frag);
  });
}
function openPicker(input){
  const tr=input.closest("tr"); if(!tr) return;
  pick={ input, opts:optionsFor(input.dataset.f, +tr.dataset.i, input), shown:[], at:-1, opened:input.value };
  drawPicker();
}
function drawPicker(){
  if(!pick.input) return;
  pick.shown=pickShown();
  if(!pick.shown.length){ closePicker(); return; }
  if(pick.at>=pick.shown.length) pick.at=pick.shown.length-1;
  picker.innerHTML=pick.shown.map((o,n)=>
    `<div class="opt${n===pick.at?" on":""}" role="option" data-n="${n}"><b>${esc(o.value)}</b>`+
    (o.label?`<span>${esc(o.label)}</span>`:"")+`</div>`).join("");
  const r=pick.input.getBoundingClientRect();
  picker.style.left=(r.left+window.scrollX)+"px";
  picker.style.top=(r.bottom+window.scrollY+2)+"px";
  picker.style.minWidth=r.width+"px";
  picker.hidden=false;
  const on=picker.querySelector(".opt.on"); if(on) on.scrollIntoView({block:"nearest"});
}
function closePicker(){ picker.hidden=true; picker.innerHTML=""; pick.input=null; pick.shown=[]; pick.at=-1; }
/* accepting writes the cell the way typing does, so the snapshot, the tint and
   the redraw are the ones every other edit goes through */
function acceptPick(n){
  const o=pick.shown[n], el=pick.input;
  if(!o || !el) return;
  closePicker();
  accepting=true;
  el.value=o.value;
  el.dispatchEvent(new Event("input",{bubbles:true}));
  el.dispatchEvent(new Event("change",{bubbles:true}));
  accepting=false;
  el.focus();
}
picker.addEventListener("mousedown",e=>e.preventDefault());   /* the cell keeps the focus */
picker.addEventListener("click",e=>{
  const d=e.target.closest(".opt"); if(d) acceptPick(+d.dataset.n);
});
eqbody.addEventListener("click",e=>{
  const f=e.target.dataset&&e.target.dataset.f;
  if(PICK_FIELDS.includes(f) && !pick.input) openPicker(e.target);
});
/* before the row-navigation keys below: while the list is open, Up/Down move
   in it, Enter and Tab take the highlighted value, Escape puts it away */
eqbody.addEventListener("keydown",e=>{
  if(!pick.input || e.target!==pick.input) return;
  if(e.key==="Escape"){ e.stopPropagation(); closePicker(); return; }
  if((e.key==="ArrowDown"||e.key==="ArrowUp") && !e.altKey && !e.ctrlKey && !e.metaKey){
    if(!pick.shown.length) return;
    e.preventDefault(); e.stopPropagation();
    const n=pick.shown.length;
    pick.at=e.key==="ArrowDown" ? (pick.at+1)%n : (pick.at<=0?n-1:pick.at-1);
    drawPicker();
  } else if(pick.at>=0 && (e.key==="Enter"||e.key==="Tab")){
    if(e.key==="Enter"){ e.preventDefault(); e.stopPropagation(); }   /* Tab still moves on */
    acceptPick(pick.at);
  }
},true);
/* the list follows its cell rather than vanishing: focusing a cell can scroll
   the table to reach it, and closing on that scroll shut the list the moment
   it opened */
function movePicker(){
  if(!pick.input) return;
  const r=pick.input.getBoundingClientRect();
  if(r.bottom<0 || r.top>innerHeight){ closePicker(); return; }   /* scrolled out of sight */
  picker.style.left=(r.left+window.scrollX)+"px";
  picker.style.top=(r.bottom+window.scrollY+2)+"px";
}
addEventListener("scroll",movePicker,true);
addEventListener("resize",movePicker);

/* renaming an ID: the name it had when the cell was entered, so that on
   commit every Feeds From that named it can follow (src/core/edit.js) */
let idBefore="";
eqbody.addEventListener("change",e=>{
  if(e.target.dataset.f!=="id") return;
  const i=+e.target.closest("tr").dataset.i, row=state.rows[i]; if(!row) return;
  const before=idBefore.trim(), after=row.id.trim(); idBefore=after;
  if(!before || before===after) return;
  if(!canFollowRename(state.rows,i,after)) return;   /* another row owns that ID: nothing follows */
  /* no snapshot of its own: the typing that changed the ID already took one,
     so a single undo brings back the old name and its references together */
  if(!renameReferences(state.rows,before,after)) return;
  for(const [k,r] of state.rows.entries()){ const el=eqbody.querySelector(`tr[data-i="${k}"] [data-f="from"]`); if(el && el.value!==r.from) el.value=r.from; }
  redraw(); persist();
});
eqbody.addEventListener("focusin",e=>{
  const f=e.target.dataset.f; if(!f) return;
  if(f==="id") idBefore=(state.rows[+e.target.closest("tr").dataset.i]||{}).id||"";
  if(PICK_FIELDS.includes(f)) openPicker(e.target);
  else closePicker();
});
eqbody.addEventListener("change",e=>{
  if(e.target.dataset.f!=="type") return;
  const tr=e.target.closest("tr"), row=state.rows[+tr.dataset.i];
  if(!row) return;
  /* choosing the Type of a row that is still a proposal fills the rest of it */
  refillProposal(row);
  for(const f of ["from","id","prot","voltage"]){
    const el=tr.querySelector(`[data-f="${f}"]`);
    if(el && el.value!==row[f]) el.value=row[f];
    if(el) el.classList.toggle("proposed",(row._p||[]).includes(f));
  }
  queue();
});
/* keyboard flow: Enter = same column one row down (a new row after the last);
   Alt+Up/Down move the row; Ctrl+Z / Ctrl+Y undo and redo */
eqbody.addEventListener("keydown",e=>{
  const f=e.target.dataset.f; if(!f) return;
  const tr=e.target.closest("tr"), i=+tr.dataset.i;
  if(e.key==="Enter" && !e.altKey && !e.ctrlKey && !e.metaKey){
    e.preventDefault();
    if(i===state.rows.length-1){ addRow(true); focusCell(state.rows.length-1, f==="notes"?"id":f); }
    else focusCell(i+1, f);
  } else if(e.altKey && (e.key==="ArrowUp"||e.key==="ArrowDown")){
    e.preventDefault();
    const j=e.key==="ArrowUp"?i-1:i+1;
    if(j<0||j>=state.rows.length) return;
    snapshot();
    [state.rows[i],state.rows[j]]=[state.rows[j],state.rows[i]];
    rebuildTable(); redraw(); persist(); focusCell(j,f);
  }
});
function focusCell(i,f){
  const el=eqbody.querySelector(`tr[data-i="${i}"] [data-f="${f}"]`);
  if(el){ el.focus(); if(el.select) el.select(); }
}
function flashRow(i){
  const tr=eqbody.querySelector(`tr[data-i="${i}"]`); if(!tr) return;
  tr.scrollIntoView({block:"nearest",behavior:"smooth"});
  tr.classList.add("flash"); setTimeout(()=>tr.classList.remove("flash"),900);
  focusCell(i,"id");
}
$("#problems").addEventListener("click",e=>{
  const d=e.target.closest("div[data-row]"); if(d) flashRow(+d.dataset.row);
});

/* undo / redo: snapshots of the whole table; a burst of typing is one step */
const past=[], future=[]; let lastSnap=0;
function snapshot(force){
  const now=Date.now(), burst=now-lastSnap<800; lastSnap=now;
  if(!force && burst && past.length) return;
  const s=JSON.stringify(state);
  if(past.length && past[past.length-1]===s) return;
  past.push(s); if(past.length>100) past.shift();
  future.length=0; updateUndo();
}
function restore(s){
  state=JSON.parse(s); view.fitted=false;
  writeInfoInputs(); rebuildTable(); redraw(); persist(); updateUndo();
}
function undo(){ if(!past.length) return; future.push(JSON.stringify(state)); restore(past.pop()); }
function redo(){ if(!future.length) return; past.push(JSON.stringify(state)); restore(future.pop()); }
function updateUndo(){ $("#undo").disabled=!past.length; $("#redo").disabled=!future.length; }
$("#undo").addEventListener("click",undo);
$("#redo").addEventListener("click",redo);
document.addEventListener("keydown",e=>{
  if(!(e.ctrlKey||e.metaKey)) return;
  const k=e.key.toLowerCase();
  if(k==="z" && !e.shiftKey){ e.preventDefault(); undo(); }
  else if(k==="y" || (k==="z" && e.shiftKey)){ e.preventDefault(); redo(); }
});

/* ------------------------------------------------ viewer: scroll, pan, zoom */
const VIEW_KEY="sld-sketchpad-view", PAD=16, ZMIN=0.1, ZMAX=8, ZSTEP=1.25;
const view={z:1, w:0, h:0, fitted:true, sl:null, st:null};
const viewport=$("#viewport"), sheetbox=$("#sheetbox"), sheetEl=$("#sheet");
function drawingSize(){
  const svg=$("#sheet svg");
  if(!svg) return {w:0,h:0};
  return {w:+svg.getAttribute("width")||0, h:+svg.getAttribute("height")||0};
}
function saveView(){
  try{ localStorage.setItem(VIEW_KEY, JSON.stringify({z:view.z, w:view.w, h:view.h,
    fitted:view.fitted, sl:viewport.scrollLeft, st:viewport.scrollTop})); }catch(e){}
}
function loadView(){
  try{
    const v=JSON.parse(localStorage.getItem(VIEW_KEY)||"null");
    if(v && [v.z,v.w,v.h,v.sl,v.st].every(n=>typeof n==="number" && isFinite(n))){
      view.z=Math.min(ZMAX,Math.max(ZMIN,v.z)); view.w=v.w; view.h=v.h;
      view.fitted=!!v.fitted; view.sl=v.sl; view.st=v.st;
      return;
    }
  }catch(e){}
  view.fitted=true;
}
function applyZoom(){
  sheetbox.style.width=(view.w?view.w*view.z+2*PAD:0)+"px";
  sheetbox.style.height=(view.h?view.h*view.z+2*PAD:0)+"px";
  sheetEl.style.transform=`scale(${view.z})`;
  $("#v-zoom").textContent=Math.round(view.z*100)+"%";
  saveView();
}
function setZoom(z, cx, cy){
  z=Math.min(ZMAX,Math.max(ZMIN,z));
  if(cx===undefined){ cx=viewport.clientWidth/2; cy=viewport.clientHeight/2; }
  const u=(viewport.scrollLeft+cx-PAD)/view.z, v=(viewport.scrollTop+cy-PAD)/view.z;
  view.z=z; view.fitted=false;
  applyZoom();
  viewport.scrollLeft=u*z+PAD-cx;
  viewport.scrollTop=v*z+PAD-cy;
  saveView();
}
function fitView(){
  const vw=viewport.clientWidth, vh=viewport.clientHeight;
  if(!view.w || !view.h || vw<=0 || vh<=0) view.z=1;
  else view.z=Math.min(ZMAX,Math.max(ZMIN,
    Math.min((vw-2*PAD)/view.w,(vh-2*PAD)/view.h)));
  view.fitted=true;
  applyZoom();
  viewport.scrollLeft=0; viewport.scrollTop=0;
  saveView();
}
function zoomActual(){ setZoom(1); }
function syncView(){
  /* after every redraw: keep the user's view unless there was nothing, the
     user never moved it, or the sheet changed size by more than half */
  const {w,h}=drawingSize();
  const big=(a,b)=>Math.max(a,b)/Math.max(1,Math.min(a,b))>1.5;
  const refit=view.fitted || !view.w || !w || big(view.w,w) || big(view.h,h);
  view.w=w; view.h=h;
  if(refit){ fitView(); return; }
  applyZoom();
  if(view.sl!==null){                 /* the saved scroll, once at boot */
    viewport.scrollLeft=view.sl; viewport.scrollTop=view.st;
    view.sl=view.st=null;
  }
}
/* re-wire a row from the drawing: its Feeds From becomes the target (or,
   with `also`, gains it as a further supply). The one column that carries
   topology is the one written — nothing else moves (constitution §1). */
function rewire(id, targetId, also){
  const i=rowIndexOf(id); if(i<0 || !targetId || targetId===id) return false;
  const row=state.rows[i];
  const have=row.from.split(",").map(s=>s.trim()).filter(Boolean);
  const next=also ? (have.includes(targetId)?have:have.concat([targetId])) : [targetId];
  if(next.join(", ")===have.join(", ")) return false;
  snapshot(true);
  row.from=next.join(", ");
  clearMark(row,"from");
  const el=eqbody.querySelector(`tr[data-i="${i}"] [data-f="from"]`); if(el){ el.value=row.from; el.classList.remove("proposed"); }
  reproposeFor(row,i);
  redraw(); persist(); selectId(id);
  return true;
}
/* the supply just changed under a row whose device or voltage is still the
   engine's: propose them again for the new supply. An RMU that gains its
   second link this way gets "LBS, LBS"; a coupler finished on the far board
   keeps its breaker; a cell the surveyor typed is never touched. */
function reproposeFor(row, i){
  const marks=new Set(row._p||[]);
  if(!marks.has("prot") && !marks.has("voltage")) return;
  const [items,order]=currentModel();
  const p=proposeRow(items,order,{type:row.type,targetId:row.from.trim()});
  for(const f of ["prot","voltage"]){
    if(!marks.has(f) || row[f]===p[f]) continue;
    row[f]=p[f];
    const el=eqbody.querySelector(`tr[data-i="${i}"] [data-f="${f}"]`); if(el) el.value=p[f];
    if(!p[f]) clearMark(row,f);
  }
}
(function bindViewer(){
  const pointers=new Map();
  const onScrollbar=e=>e.offsetX>viewport.clientWidth || e.offsetY>viewport.clientHeight;
  /* a drag that starts on a symbol moves its connection, not the sheet:
     the symbol under the pointer while dragging is the supply it will be
     fed from; panning starts on empty canvas */
  let over=null;
  const setOver=g=>{ if(over===g) return; if(over) over.classList.remove("over"); over=g; if(over) over.classList.add("over"); };
  const endWire=p=>{
    setOver(null); viewport.classList.remove("wiring");
    if(p && p.grab){ const g=document.querySelector(`#sheet svg g[data-id="${CSS.escape(p.grab)}"]`); if(g) g.classList.remove("moving"); }
  };
  viewport.addEventListener("pointerdown",e=>{
    if(e.button!==0 || onScrollbar(e)) return;
    e.preventDefault();
    try{ viewport.setPointerCapture(e.pointerId); }catch(err){}   /* synthetic events have no pointer to capture */
    const g=symbolAt(e.clientX,e.clientY);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,x0:e.clientX,y0:e.clientY,grab:g?g.dataset.id:null,mode:null});
    if(pointers.size>1) for(const q of pointers.values()){ if(q.mode==="wire") endWire(q); q.mode="pan"; }   /* two fingers: a pinch, never a wire */
    viewport.classList.add("dragging");
    viewport.focus({preventScroll:true});
  });
  viewport.addEventListener("pointermove",e=>{
    const p=pointers.get(e.pointerId);
    if(!p) return;
    if(pointers.size===1){
      if(!p.mode && Math.hypot(e.clientX-p.x0,e.clientY-p.y0)>=6){
        p.mode=p.grab?"wire":"pan";
        if(p.mode==="wire"){ viewport.classList.add("wiring"); const g=document.querySelector(`#sheet svg g[data-id="${CSS.escape(p.grab)}"]`); if(g) g.classList.add("moving"); }
      }
      if(p.mode==="wire"){
        const g=symbolAt(e.clientX,e.clientY,true);
        setOver(g && g.dataset.id!==p.grab ? g : null);
      } else if(p.mode==="pan"){
        viewport.scrollLeft-=e.clientX-p.x; viewport.scrollTop-=e.clientY-p.y;
        view.fitted=false;
      }
    } else if(pointers.size===2){    /* pinch */
      const [a,b]=[...pointers.values()];
      const before=Math.hypot(a.x-b.x,a.y-b.y);
      const other=(p===a)?b:a;
      const after=Math.hypot(e.clientX-other.x,e.clientY-other.y);
      const r=viewport.getBoundingClientRect();
      if(before>0) setZoom(view.z*after/before,
        (e.clientX+other.x)/2-r.left,(e.clientY+other.y)/2-r.top);
    }
    p.x=e.clientX; p.y=e.clientY;
  });
  const release=e=>{
    const p=pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if(!pointers.size) viewport.classList.remove("dragging");
    if(p && p.mode==="wire"){
      const g=e.type==="pointerup" ? symbolAt(e.clientX,e.clientY,true) : null;
      endWire(p);
      if(g && g.dataset.id!==p.grab) rewire(p.grab, g.dataset.id, e.shiftKey);   /* released on nothing: nothing happens */
      return;
    }
    /* a press that did not pan is a click: select the symbol under it */
    if(e.type==="pointerup" && p && Math.hypot(e.clientX-p.x0,e.clientY-p.y0)<4){
      const g=symbolAt(e.clientX,e.clientY);
      if(g){ selectId(g.dataset.id); const i=rowIndexOf(g.dataset.id); if(i>=0) flashRow(i); }
      else selectId(null);
    }
  };
  for(const ev of ["pointerup","pointercancel","lostpointercapture"])
    viewport.addEventListener(ev,release);
  viewport.addEventListener("wheel",e=>{
    if(!(e.ctrlKey||e.metaKey)) return;    /* plain wheel scrolls natively */
    e.preventDefault();
    const r=viewport.getBoundingClientRect();
    const dy=e.deltaMode===1?e.deltaY*16:e.deltaMode===2?e.deltaY*viewport.clientHeight:e.deltaY;
    setZoom(view.z*Math.exp(-dy*0.002), e.clientX-r.left, e.clientY-r.top);
  },{passive:false});
  viewport.addEventListener("keydown",e=>{
    const step=e.shiftKey?200:40; let done=true;
    switch(e.key){
      case "ArrowLeft": viewport.scrollLeft-=step; view.fitted=false; break;
      case "ArrowRight": viewport.scrollLeft+=step; view.fitted=false; break;
      case "ArrowUp": viewport.scrollTop-=step; view.fitted=false; break;
      case "ArrowDown": viewport.scrollTop+=step; view.fitted=false; break;
      case "+": case "=": setZoom(view.z*ZSTEP); break;
      case "-": case "_": setZoom(view.z/ZSTEP); break;
      case "0": fitView(); break;
      case "1": zoomActual(); break;
      default: done=false;
    }
    if(done) e.preventDefault();
  });
  viewport.addEventListener("dblclick",e=>{ if(!onScrollbar(e)) fitView(); });
  let pending=false;
  viewport.addEventListener("scroll",()=>{
    if(pending) return;
    pending=true;
    requestAnimationFrame(()=>{ pending=false; saveView(); });
  });
  $("#v-fit").addEventListener("click",fitView);
  $("#v-100").addEventListener("click",zoomActual);
  $("#v-in").addEventListener("click",()=>setZoom(view.z*ZSTEP));
  $("#v-out").addEventListener("click",()=>setZoom(view.z/ZSTEP));
  if(typeof ResizeObserver!=="undefined")
    new ResizeObserver(()=>{ if(view.fitted) fitView(); else applyZoom(); })
      .observe(viewport);
})();

/* saved table: {v:2, info, rows}; a v1 blob (no "v") has the same shape */
const STATE_KEY="sld-sketchpad", STATE_VERSION=3;
function persist(){
  try{ localStorage.setItem(STATE_KEY, JSON.stringify({v:STATE_VERSION, info:state.info, rows:state.rows, view:view_})); }catch(e){}
}
function loadState(){
  try{
    const s=JSON.parse(localStorage.getItem(STATE_KEY)||"null");
    if(!s || !Array.isArray(s.rows) || !s.info) return null;
    if((s.v||1)>STATE_VERSION) return null;        /* from a newer page: start clean */
    const info={site:"",date:"",by:"",notes:"",...s.info};
    const rows=s.rows.map(r=>{
      const row=R(r.id||"",r.type||"",r.desc||"",r.rating||"",r.voltage||"",r.from||"",r.notes||"",r.prot||"");
      if(Array.isArray(r._p) && r._p.length) row._p=r._p.slice();   /* the cells still showing a proposal */
      return row;
    });
    view_=normalizeView(s.view);
    return {info, rows};
  }catch(e){ return null; }
}
let timer=null;
function queue(){
  clearTimeout(timer);
  timer=setTimeout(()=>{ redraw(); persist(); },250);
}
function replaceState(s){
  snapshot(true);
  state=s; view.fitted=true;
  writeInfoInputs(); rebuildTable(); redraw(); persist();
}
/* a new row at the end. From the keyboard (Enter on the last row) it repeats
   the row above — same Type, same supply, the engine's ID, device and
   voltage, all tinted — because a run of feeders on one board or pumps on
   one MCC is what a survey mostly is. The + Add row button keeps the blank
   row, for a deliberately different item. */
function addRow(repeat){
  snapshot(true);
  const sibling=state.rows.length?state.rows[state.rows.length-1]:null;
  const again=repeat && sibling && sibling.type.trim();
  state.rows.push(again ? proposedRow(sibling.type.trim(), sibling.from.trim(), null) : proposedRow("","",sibling));
  rebuildTable(); redraw(); persist();
}

eqbody.addEventListener("input",e=>{
  const tr=e.target.closest("tr"); if(!tr) return;
  const f=e.target.dataset.f; if(!f) return;
  snapshot();
  const row=state.rows[+tr.dataset.i];
  row[f]=e.target.value;
  clearMark(row,f); e.target.classList.remove("proposed");   /* typed: no longer a proposal */
  if(!accepting && pick.input===e.target) drawPicker();
  queue();
});
eqbody.addEventListener("click",e=>{
  const btn=e.target.closest("button"); if(!btn) return;
  const i=+btn.closest("tr").dataset.i, op=btn.dataset.op;
  snapshot(true);
  if(op==="del") state.rows.splice(i,1);
  else if(op==="up"&&i>0) [state.rows[i-1],state.rows[i]]=[state.rows[i],state.rows[i-1]];
  else if(op==="down"&&i<state.rows.length-1) [state.rows[i+1],state.rows[i]]=[state.rows[i],state.rows[i+1]];
  else return;
  rebuildTable(); redraw(); persist();
});
$("#addrow").addEventListener("click",()=>{ addRow(); focusCell(state.rows.length-1,"id"); });
for(const id of ["i-site","i-date","i-by","i-notes"])
  document.getElementById(id).addEventListener("input",()=>{ snapshot(); readInfoInputs(); queue(); });

$("#preset").addEventListener("change",e=>{
  const p=PRESETS[e.target.value]; e.target.value="";
  if(!p) return;
  replaceState(JSON.parse(JSON.stringify(p)));
});
$("#clear").addEventListener("click",()=>{
  replaceState({info:{site:"",date:"",by:"",notes:""},rows:[R("","","","","","","")]});
});

/* ------------------------------------------------ import / CSV */
/* The reader lives in src/io/csv.js and is the same one the command line and
   the fixtures use. The page used to carry its own copy of parseCsv and
   tableToRows that had to be kept in step by hand. */
/* SheetJS is loaded only when an .xlsx is imported (vendor/xlsx.full.min.js beside the page) */
let xlsxLib=null;
function loadXlsx(){
  if(xlsxLib) return Promise.resolve(xlsxLib);
  if(window.XLSX){ xlsxLib=window.XLSX; return Promise.resolve(xlsxLib); }
  return new Promise((ok,fail)=>{
    const s=document.createElement("script"); s.src="vendor/xlsx.full.min.js";
    s.onload=()=>{ xlsxLib=window.XLSX; xlsxLib?ok(xlsxLib):fail(new Error("SheetJS did not load")); };
    s.onerror=()=>fail(new Error("vendor/xlsx.full.min.js not found beside the page"));
    document.head.appendChild(s);
  });
}
async function importFile(file){
  const name=file.name.toLowerCase();
  try{
    let info={site:"",date:"",by:"",notes:""}, read;
    if(name.endsWith(".json")){
      const s=JSON.parse(await file.text());
      if(!Array.isArray(s.rows)) throw new Error("not a saved table (no rows)");
      info={...info,...(s.info||{})};
      read=readTable([HEADERS].concat(s.rows.map(r=>FIELDS.map(f=>r[f]||""))));
    } else if(name.endsWith(".csv")){
      read=readCsv(await file.text());
      info.site=file.name.replace(/\.csv$/i,"");
    } else {
      const X=await loadXlsx();
      const wb=X.read(await file.arrayBuffer(),{type:"array"});
      if(wb.Sheets["Info"]){
        const keys={site:"site",date:"date","surveyed by":"by",by:"by",notes:"notes"};
        for(const r of X.utils.sheet_to_json(wb.Sheets["Info"],{header:1,defval:"",raw:false})){
          const k=keys[String(r[0]||"").trim().replace(/:$/,"").toLowerCase()]; if(k) info[k]=String(r[1]??"").trim();
        }
      }
      const ws=wb.Sheets["Equipment"]||wb.Sheets[wb.SheetNames[0]];
      read=readTable(X.utils.sheet_to_json(ws,{header:1,defval:"",raw:false}));
    }
    /* a file that parsed but holds nothing is not a reason to throw the
       table away: say so and leave what is on screen alone */
    if(!read.rows.length){ say(`${file.name} has no equipment rows — the table is unchanged.`); return; }
    replaceState({info,rows:read.rows});
    /* which column was taken for which field, when the name was not exact —
       said now, rather than discovered as fifty duplicate IDs */
    say([`${file.name}: ${read.rows.length} row${read.rows.length===1?"":"s"} loaded.`].concat(read.notes).join(" "));
  }catch(e){
    say(`Could not import ${file.name}: ${e.message}`);
  }
}
$("#import").addEventListener("click",()=>$("#importfile").click());
$("#importfile").addEventListener("change",e=>{ const f=e.target.files[0]; e.target.value=""; if(f) importFile(f); });
/* drop a workbook or CSV anywhere on the table */
const eqPanel=eqbody.closest("section")||eqbody;
eqPanel.addEventListener("dragover",e=>{ if([...e.dataTransfer.types].includes("Files")){ e.preventDefault(); } });
eqPanel.addEventListener("drop",e=>{ const f=e.dataTransfer.files&&e.dataTransfer.files[0]; if(f){ e.preventDefault(); importFile(f); } });
/* ------------------------------------------------ getting it out */
/* the one status line, under the drawing's bar: imports and exports report
   here. Only the timer that wrote the current message may clear it, so an
   earlier message's timeout never wipes a later one */
let sayN=0;
function say(m, keep){
  const out=$("#copystate"), n=++sayN; out.textContent=m;
  if(!keep) setTimeout(()=>{ if(n===sayN) out.textContent=""; },8000);
}
/* Four files, each written from the table by the engine. Inside the
   claude.ai viewer a page cannot download by itself and the viewer's save
   prompt does it; opened as a file, the browser's own download does. */
function fileName(ext){
  return ((state.info.site||"sld-sketch").replace(/[^\w.-]+/g,"_").replace(/^_+|_+$/g,"")||"sld-sketch")+"."+ext;
}
async function saveFile(name, text, mime, note){
  const dl=(window.claude && typeof window.claude.use==="function") ? await window.claude.use("downloads") : null;
  if(dl){
    try{ await dl.save({filename:name, data:text}); say(`${name} saved${note?" — "+note:""}.`); }
    catch(e){
      const code=e && e.code;
      if(code==="declined") say("Save cancelled.");
      else if(code==="rate_limited") say("A save prompt is already open — answer it first.");
      else say(`This viewer cannot save ${name} — open the page as a file, or run: node src/cli/sld.js <draw|dxf|pdf> <table>.`,true);
    }
    return;
  }
  const url=URL.createObjectURL(new Blob([text],{type:mime}));
  const a=document.createElement("a"); a.href=url; a.download=name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  say(`${name}${note?" — "+note:""}.`);
}
/* the model, laid out, ready for an exporter — or null when the table cannot be drawn */
function currentSheet(){
  const {items,order}=buildModel(state.rows);
  if(!order.length) return null;
  applyView(view_);
  return [items,order,layout(items,order)];
}
function exportSheet(ext, mime, note, make){
  const sheet=currentSheet();
  if(!sheet){ say("Nothing to export yet — add a row with an ID first."); return; }
  saveFile(fileName(ext), make(state.info,...sheet), mime, note);
}
$("#csv").addEventListener("click",()=>{
  saveFile(fileName("csv"), rowsToCsv(state.rows), "text/csv", "the equipment table");
});
$("#svg").addEventListener("click",()=>{
  exportSheet("svg","image/svg+xml","the drawing",(info,items,order,width)=>render(info,items,order,width));
});
$("#pdf").addEventListener("click",()=>{
  exportSheet("pdf","application/pdf","one A3 landscape page, sketch and equipment table",renderPdf);
});
$("#dxf").addEventListener("click",()=>{
  exportSheet("dxf","application/dxf","R12 DXF, sketch and equipment table, 1 unit = 1 mm",renderDxf);
});

/* ------------------------------------------------ view options and focus mode */
function writeViewInputs(){
  $("#v-spacing").value=view_.spacing; $("#v-legend").checked=view_.legend; $("#v-title").checked=view_.titleBlock;
}
function setView(patch){
  view_=normalizeView({...view_,...patch});
  writeViewInputs(); view.fitted=true; redraw(); persist();
}
$("#v-spacing").addEventListener("change",e=>setView({spacing:e.target.value}));
$("#v-legend").addEventListener("change",e=>setView({legend:e.target.checked}));
$("#v-title").addEventListener("change",e=>setView({titleBlock:e.target.checked}));
function setFocus(on){
  document.body.classList.toggle("focus",on);
  $("#focus").textContent=on?"Leave focus":"Focus drawing";
  view.fitted=true; requestAnimationFrame(()=>fitView());
}
$("#focus").addEventListener("click",()=>setFocus(!document.body.classList.contains("focus")));
document.addEventListener("keydown",e=>{ if(e.key==="Escape" && document.body.classList.contains("focus")) setFocus(false); });

/* the how-to-fill page */
const helpEl=$("#help");
function showHelp(open){
  helpEl.open=open;
  $("#helpbtn").classList.toggle("on",open);
  if(open) helpEl.scrollIntoView({behavior:"smooth",block:"start"});
}
$("#helpbtn").addEventListener("click",()=>showHelp(!helpEl.open));
$("#helplink").addEventListener("click",e=>{ e.preventDefault(); showHelp(true); });
helpEl.addEventListener("toggle",()=>$("#helpbtn").classList.toggle("on",helpEl.open));

/* boot: restore last session, else start on example 1 */
(function(){
  state=loadState()||JSON.parse(JSON.stringify(PRESETS["1"]));
  buildPalette();
  writeViewInputs();
  loadView();
  writeInfoInputs(); rebuildTable(); redraw(); persist(); updateUndo();
})();
