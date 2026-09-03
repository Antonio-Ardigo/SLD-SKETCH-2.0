import { TYPE_LABELS } from "../core/types.js";
import { esc, buildModel } from "../core/model.js";
import { layout } from "../core/layout.js";
import { render } from "../core/render.js";
import { renderDxf } from "../core/dxf.js";
import { R, PRESETS } from "./presets.generated.js";

/* ------------------------------------------------ UI wiring */
const FIELDS=["id","type","desc","rating","voltage","prot","from","notes"];
let state={info:{site:"",date:"",by:"",notes:""},rows:[]};

const $=s=>document.querySelector(s);
const eqbody=$("#eqbody");

function typeSelect(value){
  const opts=['<option value=""></option>'].concat(
    TYPE_LABELS.map(([lbl])=>`<option${lbl===value?" selected":""}>${lbl}</option>`));
  return `<select data-f="type" aria-label="Type">${opts.join("")}</select>`;
}
function rebuildTable(){
  eqbody.innerHTML=state.rows.map((r,i)=>`<tr data-i="${i}">
    <td><input data-f="id" value="${esc(r.id)}" aria-label="ID"></td>
    <td>${typeSelect(r.type)}</td>
    <td><input data-f="desc" value="${esc(r.desc)}" aria-label="Description"></td>
    <td><input data-f="rating" value="${esc(r.rating)}" aria-label="Rating" list="ratinglist"></td>
    <td><input data-f="voltage" value="${esc(r.voltage)}" aria-label="Voltage" list="voltlist"></td>
    <td><input data-f="prot" value="${esc(r.prot||"")}" aria-label="Protection" list="protlist"></td>
    <td><input data-f="from" value="${esc(r.from)}" aria-label="Feeds from" list="idlist"></td>
    <td><input data-f="notes" value="${esc(r.notes)}" aria-label="Notes"></td>
    <td class="rowops">
      <button data-op="up" title="Move up">&uarr;</button><button data-op="down" title="Move down">&darr;</button><button data-op="del" class="del" title="Delete row">&times;</button>
    </td>
  </tr>`).join("");
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
function showProblems(errors, warnings){
  const probs=$("#problems");
  const line=(msg,cls)=>{
    const i=messageRow(msg);
    return `<div class="${cls}"${i>=0?` data-row="${i}"`:""}>${esc(msg)}</div>`;
  };
  probs.innerHTML=errors.map(e=>line(e,"err")).concat(warnings.map(w=>line(w,"warn"))).join("");
  probs.hidden=!(errors.length||warnings.length);
  for(const tr of eqbody.querySelectorAll("tr")) tr.classList.remove("err","warn");
  const mark=(msgs,cls)=>{ for(const m of msgs){ const i=messageRow(m); const tr=eqbody.querySelector(`tr[data-i="${i}"]`); if(tr) tr.classList.add(cls); } };
  mark(warnings,"warn"); mark(errors,"err");
}
function redraw(){
  const {items,order,errors,warnings}=buildModel(state.rows);
  refreshIdList();
  if(!order.length){
    $("#sheet").innerHTML="";
    const probs=$("#problems");
    probs.hidden=false;
    probs.innerHTML="<div>No equipment yet — add rows or load an example.</div>";
    for(const tr of eqbody.querySelectorAll("tr")) tr.classList.remove("err","warn");
    syncView();
    return;
  }
  showProblems(errors, warnings);
  if(errors.length) return; /* keep the last good drawing on screen */
  const width=layout(items,order);
  const svgStr=render(state.info,items,order,width,warnings);
  $("#sheet").innerHTML=svgStr;
  syncView();
}

/* ------------------------------------------------ data entry helpers */
/* the usual device on a row's supply side, offered when Type is chosen */
const TYPE_DEFAULT_PROT={"RMU":"LBS","Transformer":"Fuse-switch","LV Busbar":"CB",
  "Feeder":"CB","MCC":"CB","Pump":"Contactor","MV Busbar":"CB","Bus Coupler":"CB"};
/* standard values, by what the row is */
const MV_TYPES=["MV Incomer","MV Busbar","RMU"], LV_TYPES=["LV Busbar","Feeder","MCC","Bus Coupler"];
const QUICK={
  volt:{
    mv:["33 kV","22 kV","11 kV","6.6 kV","3.3 kV"],
    lv:["690 V","400 V","230 V","400/230 V"],
    tx:["33/11 kV","11/0.4 kV","11/0.69 kV","11/3.3 kV","6.6/0.4 kV","0.4/11 kV","0.4/0.4 kV","0.4/0.23 kV"],
    gen:["11 kV","400 V","690 V"],
    motor:["11 kV","3.3 kV","690 V","400 V"],
  },
  rating:{
    board:["630 A","800 A","1250 A","1600 A","2000 A","2500 A","3200 A","4000 A"],
    feeder:["63 A","100 A","160 A","250 A","400 A","630 A","800 A"],
    tx:["315 kVA","500 kVA","630 kVA","800 kVA","1000 kVA","1250 kVA","1600 kVA","2000 kVA","2500 kVA"],
    motor:["11 kW","22 kW","37 kW","55 kW","75 kW","110 kW","160 kW","250 kW","315 kW","500 kW"],
    gen:["250 kVA","500 kVA","800 kVA","1000 kVA","1600 kVA","2000 kVA"],
    cap:["100 kvar","200 kvar","300 kvar","500 kvar"],
  },
};
function quickVolt(type){
  if(type==="Transformer") return QUICK.volt.tx;
  if(type==="Generator") return QUICK.volt.gen;
  if(type==="Pump") return QUICK.volt.motor;
  if(MV_TYPES.includes(type)) return QUICK.volt.mv;
  if(LV_TYPES.includes(type)) return QUICK.volt.lv;
  return QUICK.volt.mv.concat(QUICK.volt.lv);
}
function quickRating(type){
  if(type==="Transformer") return QUICK.rating.tx;
  if(type==="Pump") return QUICK.rating.motor;
  if(type==="Generator") return QUICK.rating.gen;
  if(type==="Capacitor Bank") return QUICK.rating.cap;
  if(["MV Busbar","LV Busbar","RMU","Bus Coupler","MCC"].includes(type)) return QUICK.rating.board;
  if(type==="Feeder") return QUICK.rating.feeder;
  return QUICK.rating.board.concat(QUICK.rating.tx);
}
function fillList(id, values){
  $("#"+id).innerHTML=values.map(v=>`<option value="${esc(v)}"></option>`).join("");
}
/* the Feeds from picker: every ID on the sheet except the row's own; typing
   "BB1, " then offers "BB1, <id>" for the second supply */
let idListFor=null;
function refreshIdList(input){
  const ids=state.rows.map(r=>r.id.trim()).filter(Boolean);
  let own="", prefix="";
  if(input){
    const tr=input.closest("tr"); own=(state.rows[+tr.dataset.i]||{}).id.trim();
    const v=input.value; const k=v.lastIndexOf(",");
    if(k>=0) prefix=v.slice(0,k+1).replace(/\s*$/," ");
  }
  const key=prefix+"|"+own+"|"+ids.join("|");
  if(key===idListFor) return;
  idListFor=key;
  fillList("idlist", ids.filter(i=>i!==own && !prefix.split(",").map(s=>s.trim()).includes(i)).map(i=>prefix+i));
}
eqbody.addEventListener("focusin",e=>{
  const f=e.target.dataset.f; if(!f) return;
  const type=(state.rows[+e.target.closest("tr").dataset.i]||{}).type||"";
  if(f==="voltage") fillList("voltlist", quickVolt(type));
  else if(f==="rating") fillList("ratinglist", quickRating(type));
  else if(f==="from") refreshIdList(e.target);
});
eqbody.addEventListener("change",e=>{
  if(e.target.dataset.f!=="type") return;
  const tr=e.target.closest("tr"), row=state.rows[+tr.dataset.i];
  if(row && !row.prot.trim() && TYPE_DEFAULT_PROT[row.type]){
    row.prot=TYPE_DEFAULT_PROT[row.type];
    tr.querySelector('[data-f="prot"]').value=row.prot;
    queue();
  }
});
/* keyboard flow: Enter = same column one row down (a new row after the last);
   Alt+Up/Down move the row; Ctrl+Z / Ctrl+Y undo and redo */
eqbody.addEventListener("keydown",e=>{
  const f=e.target.dataset.f; if(!f) return;
  const tr=e.target.closest("tr"), i=+tr.dataset.i;
  if(e.key==="Enter" && !e.altKey && !e.ctrlKey && !e.metaKey){
    e.preventDefault();
    if(i===state.rows.length-1){ addRow(); focusCell(state.rows.length-1, f==="notes"?"id":f); }
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
function applyView(){
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
  applyView();
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
  applyView();
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
  applyView();
  if(view.sl!==null){                 /* the saved scroll, once at boot */
    viewport.scrollLeft=view.sl; viewport.scrollTop=view.st;
    view.sl=view.st=null;
  }
}
(function bindViewer(){
  const pointers=new Map();
  const onScrollbar=e=>e.offsetX>viewport.clientWidth || e.offsetY>viewport.clientHeight;
  viewport.addEventListener("pointerdown",e=>{
    if(e.button!==0 || onScrollbar(e)) return;
    e.preventDefault();
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    viewport.classList.add("dragging");
    viewport.focus({preventScroll:true});
  });
  viewport.addEventListener("pointermove",e=>{
    const p=pointers.get(e.pointerId);
    if(!p) return;
    if(pointers.size===1){
      viewport.scrollLeft-=e.clientX-p.x; viewport.scrollTop-=e.clientY-p.y;
      view.fitted=false;
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
    pointers.delete(e.pointerId);
    if(!pointers.size) viewport.classList.remove("dragging");
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
    new ResizeObserver(()=>{ if(view.fitted) fitView(); else applyView(); })
      .observe(viewport);
})();

/* saved table: {v:2, info, rows}; a v1 blob (no "v") has the same shape */
const STATE_KEY="sld-sketchpad", STATE_VERSION=2;
function persist(){
  try{ localStorage.setItem(STATE_KEY, JSON.stringify({v:STATE_VERSION, info:state.info, rows:state.rows})); }catch(e){}
}
function loadState(){
  try{
    const s=JSON.parse(localStorage.getItem(STATE_KEY)||"null");
    if(!s || !Array.isArray(s.rows) || !s.info) return null;
    if((s.v||1)>STATE_VERSION) return null;        /* from a newer page: start clean */
    const info={site:"",date:"",by:"",notes:"",...s.info};
    const rows=s.rows.map(r=>R(r.id||"",r.type||"",r.desc||"",r.rating||"",r.voltage||"",r.from||"",r.notes||"",r.prot||""));
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
function addRow(){
  snapshot(true);
  state.rows.push(R("","","","","","",""));
  rebuildTable(); redraw(); persist();
}

eqbody.addEventListener("input",e=>{
  const tr=e.target.closest("tr"); if(!tr) return;
  const f=e.target.dataset.f; if(!f) return;
  snapshot();
  state.rows[+tr.dataset.i][f]=e.target.value;
  if(f==="from") refreshIdList(e.target);
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
const HEADERS=["ID","Type","Description","Rating","Voltage","Protection","Feeds From","Notes"];
function csvQuote(v){ const s=String(v==null?"":v); return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }
function rowsToCsv(rows){
  return [HEADERS.map(csvQuote).join(",")].concat(rows.map(r=>FIELDS.map(f=>csvQuote(r[f])).join(","))).join("\n")+"\n";
}
function parseCsv(text){
  const out=[]; let row=[], field="", i=0, inQ=false; const s=text.replace(/^﻿/,"");
  while(i<s.length){
    const c=s[i];
    if(inQ){ if(c==='"'){ if(s[i+1]==='"'){ field+='"'; i+=2; continue; } inQ=false; i++; continue; } field+=c; i++; continue; }
    if(c==='"'){ inQ=true; i++; continue; }
    if(c===","){ row.push(field); field=""; i++; continue; }
    if(c==="\r"){ i++; continue; }
    if(c==="\n"){ row.push(field); out.push(row); row=[]; field=""; i++; continue; }
    field+=c; i++;
  }
  if(field.length||row.length){ row.push(field); out.push(row); }
  return out;
}
/* array-of-arrays with a header row (ID, Type, …) → table rows; columns are
   found by name like the workbook reader does, blank-ID rows are dropped */
function tableToRows(table){
  const hi=table.findIndex(r=>{ const c=r.map(x=>String(x??"").trim().toLowerCase()); return c.includes("id")&&c.includes("type"); });
  if(hi<0) throw new Error("no header row with ID and Type columns");
  const headers=table[hi].map(x=>String(x??"").trim().toLowerCase());
  const col=(...names)=>{ for(const n of names){ const j=headers.findIndex(h=>h.includes(n)); if(j>=0) return j; } return -1; };
  const idx={id:col("id"),type:col("type"),desc:col("desc"),rating:col("rating"),voltage:col("volt"),
             prot:col("protection","prot"),from:col("feeds from","parent","from"),notes:col("note")};
  const cell=(r,j)=>(j<0||j>=r.length||r[j]==null)?"":String(r[j]).trim();
  const rows=[];
  for(const r of table.slice(hi+1)){
    const o=R(cell(r,idx.id),cell(r,idx.type),cell(r,idx.desc),cell(r,idx.rating),cell(r,idx.voltage),cell(r,idx.from),cell(r,idx.notes),cell(r,idx.prot));
    if(o.id) rows.push(o);
  }
  return rows;
}
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
  const name=file.name.toLowerCase(), out=$("#copystate");
  const say=m=>{ out.textContent=m; setTimeout(()=>{ out.textContent=""; },8000); };
  try{
    let info={site:"",date:"",by:"",notes:""}, rows;
    if(name.endsWith(".json")){
      const s=JSON.parse(await file.text());
      if(!Array.isArray(s.rows)) throw new Error("not a saved table (no rows)");
      info={...info,...(s.info||{})}; rows=tableToRows([HEADERS].concat(s.rows.map(r=>FIELDS.map(f=>r[f]||""))));
    } else if(name.endsWith(".csv")){
      rows=tableToRows(parseCsv(await file.text()).filter(r=>r.some(c=>c.trim())));
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
      rows=tableToRows(X.utils.sheet_to_json(ws,{header:1,defval:"",raw:false}));
    }
    replaceState({info,rows});
    say(`${file.name}: ${rows.length} row${rows.length===1?"":"s"} loaded.`);
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
$("#csv").addEventListener("click",()=>{
  const text=rowsToCsv(state.rows), name=((state.info.site||"sld-sketch").replace(/[^\w.-]+/g,"_").replace(/^_+|_+$/g,"")||"sld-sketch")+".csv";
  const url=URL.createObjectURL(new Blob([text],{type:"text/csv"}));
  const a=document.createElement("a"); a.href=url; a.download=name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
});
$("#copysvg").addEventListener("click",async ()=>{
  const svgEl=$("#sheet svg"), el=svgEl?svgEl.outerHTML:"", out=$("#copystate");
  if(!el){ out.textContent="Nothing to copy yet."; return; }
  try{
    await navigator.clipboard.writeText(el);
    out.textContent="SVG copied — paste into a file or a drawing tool.";
  }catch(e){
    out.textContent="Copying is blocked here — select the drawing and use the browser's copy instead.";
  }
  setTimeout(()=>{ out.textContent=""; },5000);
});

function currentDxf(){
  const {items,order,errors}=buildModel(state.rows);
  if(!order.length || errors.length) return null;
  const width=layout(items,order);
  return renderDxf(state.info,items,order,width);
}
function dxfName(){
  return ((state.info.site||"sld-sketch").replace(/[^\w.-]+/g,"_").replace(/^_+|_+$/g,"")||"sld-sketch")+".dxf";
}
$("#dxf").addEventListener("click",async ()=>{
  const out=$("#copystate"), text=currentDxf();
  if(!text){ out.textContent="Nothing to export yet — fix the table first."; return; }
  const say=(m,keep)=>{ out.textContent=m; if(!keep) setTimeout(()=>{ out.textContent=""; },8000); };
  /* inside the claude.ai viewer a page cannot download by itself: the
     viewer's save prompt does it, when it can; opened as a file, the
     browser's own download does */
  const dl=(window.claude && typeof window.claude.use==="function")
    ? await window.claude.use("downloads") : null;
  if(dl){
    try{
      await dl.save({filename:dxfName(), data:text});
      say(`${dxfName()} saved — R12 DXF, sketch and equipment table, 1 unit = 1 mm.`);
    }catch(e){
      const code=e && e.code;
      if(code==="declined") say("Save cancelled.");
      else if(code==="rate_limited") say("A save prompt is already open — answer it first.");
      else say("This viewer cannot save .dxf files — use Copy DXF and paste into a file named .dxf, or run sld_sketch.py --dxf.",true);
    }
    return;
  }
  const url=URL.createObjectURL(new Blob([text],{type:"application/dxf"}));
  const a=document.createElement("a"); a.href=url; a.download=dxfName();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  say(`${dxfName()} — R12 DXF, sketch and equipment table, 1 unit = 1 mm.`);
});
$("#copydxf").addEventListener("click",async ()=>{
  const out=$("#copystate"), text=currentDxf();
  if(!text){ out.textContent="Nothing to export yet — fix the table first."; return; }
  try{
    await navigator.clipboard.writeText(text);
    out.textContent="DXF copied — paste it into a new file and save it as .dxf.";
  }catch(e){
    out.textContent="Copying is blocked here — use Download DXF instead.";
  }
  setTimeout(()=>{ out.textContent=""; },6000);
});

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
  loadView();
  writeInfoInputs(); rebuildTable(); redraw(); persist(); updateUndo();
})();
