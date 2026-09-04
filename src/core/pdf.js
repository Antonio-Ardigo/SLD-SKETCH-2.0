/* ------------------------------------------------ PDF export */
/* A one-page A3 landscape PDF: the sketch exactly as drawn (the same symbol
 * primitives, so nothing about the drawing moves) with the equipment table
 * to its right, scaled to fit the sheet and centred on it.
 *
 * The text is set in the base-14 Helvetica, so no font travels in the file
 * and none is fetched: it opens the same offline as anywhere. Nothing is
 * compressed, so the whole file is ASCII — it survives a Blob unchanged and
 * a test can read it as a string.
 */
import { SVG } from "./svg.js";
import { drawEquipmentTable } from "./eqtable.js";
import { render } from "./render.js";

/* A3 landscape in points, and the margin the drawing keeps from the edge */
const PDF_PAGE = [1190.55, 841.89], PDF_MARGIN = 24;
const PDF_WRAP_AT = 40;
const PDF_KAPPA = 0.5522847498;   /* circle → four cubic béziers */

/* Helvetica and Helvetica-Bold advance widths, characters 32…126, /1000 em
   (the Adobe metrics): what an anchored label needs to know to sit centred */
const PDF_W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,278,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const PDF_W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
/* the characters the drawing uses above ASCII: their WinAnsi code and width,
   or a plain-text stand-in where WinAnsi has no glyph */
const PDF_WINANSI = {
  "—":[0x97,1000,1000], "–":[0x96,556,556], "·":[0xb7,278,278],
  "×":[0xd7,584,584], "±":[0xb1,584,584], "…":[0x85,1000,1000],
};
const PDF_SUBST = { "→":"->", "←":"<-" };

/** Three decimals, trailing zeros trimmed — PDF numbers are plain decimals. */
export function pnum(v){
  if(!isFinite(v)) return "0";
  let t=v.toFixed(3).replace(/0+$/,"").replace(/\.$/,"");
  return (t==="-0"||t==="")?"0":t;
}
/** The characters of `s` as WinAnsi, with the ones WinAnsi lacks spelled out. */
export function pchars(s){
  const out=[];
  for(const ch of String(s).replace(/[→←]/g,c=>PDF_SUBST[c])){
    const c=ch.codePointAt(0);
    if(c>=32 && c<127) out.push([c, PDF_W_REG[c-32], PDF_W_BOLD[c-32]]);
    else if(PDF_WINANSI[ch]) out.push(PDF_WINANSI[ch]);
    else out.push([0x3f, PDF_W_REG[31], PDF_W_BOLD[31]]);   /* "?" */
  }
  return out;
}
/** `s` as a PDF literal string, escaped and in WinAnsi octal. */
export function pstring(s){
  return "(" + pchars(s).map(([c]) =>
    c===40||c===41||c===92 ? "\\"+String.fromCharCode(c)
    : c<127 ? String.fromCharCode(c)
    : "\\"+c.toString(8).padStart(3,"0")).join("") + ")";
}
/** How wide `s` is set at `size` — the sum of the real advance widths. */
export function ptextW(s, size, bold){
  let w=0;
  for(const g of pchars(s)) w += bold ? g[2] : g[1];
  return w*size/1000;
}
/** Wrap `s` to about `n` characters a line, as the equipment table does. */
export function pwrap(s, n=PDF_WRAP_AT){
  const out=[]; let cur="";
  for(const w of String(s).split(/\s+/).filter(Boolean)){
    if(cur && cur.length+1+w.length>n){ out.push(cur); cur=w; }
    else cur=(cur+" "+w).trim();
  }
  if(cur) out.push(cur);
  return out.length?out:[""];
}
/* the table measures its columns with the regular face, as the DXF does */
function ptableW(s, size){ return ptextW(s, size, false); }

/** "#111" / "white" / "none" → a PDF grey, or null for no paint. */
function pgrey(fill){
  if(!fill || fill==="none") return null;
  if(fill==="white") return 1;
  const m=/^#([0-9a-f])\1?([0-9a-f])\2?([0-9a-f])\3?$/i.exec(fill);
  if(m) return Math.round((parseInt(m[1],16)*17+parseInt(m[2],16)*17+parseInt(m[3],16)*17)/3)/255;
  return 0;
}

class PDF extends SVG {
  constructor(table){ super(); this.ops=[]; this.table=table||null; }
  begin(){}   /* row grouping is an SVG affair; a PDF page is one stream */
  end(){}
  _op(s){ this.ops.push(s); }
  _stroke(w, dash){
    this._op(`${pnum(w)} w`);
    this._op(dash ? `[${String(dash).trim().split(/[\s,]+/).map(v=>pnum(+v)).join(" ")}] 0 d` : "[] 0 d");
  }
  line(x1,y1,x2,y2,w=2,dash=null){
    this._track(x1,y1,x2,y2);
    this._stroke(w,dash);
    this._op(`${pnum(x1)} ${pnum(y1)} m ${pnum(x2)} ${pnum(y2)} l S`);
  }
  rect(x,y,w,h,sw=2,dash=null,fill="none"){
    this._stroke(sw,dash);
    const g=pgrey(fill);
    const box=`${pnum(x)} ${pnum(y)} ${pnum(w)} ${pnum(h)} re`;
    if(g===null){ this._op(`${box} S`); return; }
    this._op(`${pnum(g)} g`);
    this._op(`${box} B`);
    this._op("0.067 g");
  }
  /* a circle as four cubic béziers */
  _circlePath(x,y,r){
    const k=r*PDF_KAPPA;
    return `${pnum(x+r)} ${pnum(y)} m `
      + `${pnum(x+r)} ${pnum(y+k)} ${pnum(x+k)} ${pnum(y+r)} ${pnum(x)} ${pnum(y+r)} c `
      + `${pnum(x-k)} ${pnum(y+r)} ${pnum(x-r)} ${pnum(y+k)} ${pnum(x-r)} ${pnum(y)} c `
      + `${pnum(x-r)} ${pnum(y-k)} ${pnum(x-k)} ${pnum(y-r)} ${pnum(x)} ${pnum(y-r)} c `
      + `${pnum(x+k)} ${pnum(y-r)} ${pnum(x+r)} ${pnum(y-k)} ${pnum(x+r)} ${pnum(y)} c`;
  }
  circle(x,y,r,sw=2){ this._stroke(sw,null); this._op(this._circlePath(x,y,r)+" S"); }
  dot(x,y,r=3.2){ this._op(this._circlePath(x,y,r)+" f"); }
  poly(pts,fill="#111"){
    const g=pgrey(fill);
    if(g===null || !pts.length) return;
    this._op(`${pnum(g)} g`);
    this._op(pts.map((p,i)=>`${pnum(p[0])} ${pnum(p[1])} ${i?"l":"m"}`).join(" ")+" h f");
    this._op("0.067 g");
  }
  /* the renderer's only paths are half-circle arcs: "M x,y A r,r 0 f s x,y" */
  path(d,sw=2){
    const m=/M\s*([-\d.]+),([-\d.]+)\s+A\s*([-\d.]+),[-\d.]+\s+[-\d.]+\s+(\d)\s+(\d)\s+([-\d.]+),([-\d.]+)/.exec(d);
    if(!m) return;
    const [x1,y1,r,large,sweep,x2,y2]=m.slice(1).map(Number);
    this._stroke(sw,null);
    this._op(`${pnum(x1)} ${pnum(y1)} m ` + pdfArc(x1,y1,r,large,sweep,x2,y2) + " S");
  }
  text(x,y,s,{size=12,anchor="middle",bold=false,rotate=null}={}){
    if(!s) return;
    this._span(x,s,size,anchor,rotate);
    const w=ptextW(s,size,bold);
    const off=anchor==="middle" ? w/2 : anchor==="end" ? w : 0;
    /* the page's space is the drawing's: y grows downward, so the text
       matrix flips back and any rotation composes into it */
    const rad=(rotate||0)*Math.PI/180, co=Math.cos(rad), si=Math.sin(rad);
    const e=x-off*co, f=y-off*si;
    this._op(`BT /${bold?"F2":"F1"} ${pnum(size)} Tf ` +
      `${pnum(co)} ${pnum(si)} ${pnum(si)} ${pnum(-co)} ${pnum(e)} ${pnum(f)} Tm ` +
      `${pstring(s)} Tj ET`);
  }
  document(width,height){
    /* the equipment table is drawn once, at the origin, so its size is known
       before it is placed: on a page it goes beside the sheet or under it,
       whichever leaves the drawing bigger (a wide site fits neither way if
       the table is always to the right, as it is in CAD) */
    const sheet=this.ops; this.ops=[];
    let tw=0, th=0;
    if(this.table) [tw,th]=drawEquipmentTable(this,this.table,0,0,{wrap:pwrap,textWidth:ptableW});
    const table=this.ops; this.ops=sheet;

    const [PW,PH]=PDF_PAGE, fit=(w,h)=>Math.min((PW-2*PDF_MARGIN)/w,(PH-2*PDF_MARGIN)/h);
    const gap=40;
    const beside=[width+gap+tw, Math.max(height,th), width+gap, 0];
    const under=[Math.max(width,tw), height+gap+th, 0, height+gap];
    const [right,bottom,tx0,ty0]=(!this.table || fit(...beside.slice(0,2))>=fit(...under.slice(0,2)))?beside:under;

    const s=fit(right,bottom), ox=(PW-right*s)/2, oy=(PH+bottom*s)/2;
    const stream=["q",`${pnum(s)} 0 0 ${pnum(-s)} ${pnum(ox)} ${pnum(oy)} cm`,
      "1 J 1 j","0.067 0.067 0.067 RG","0.067 g", ...sheet,
      ...(this.table?["q",`1 0 0 1 ${pnum(tx0)} ${pnum(ty0)} cm`,...table,"Q"]:[]),
      "Q"].join("\n")+"\n";
    return pdfDocument(stream,PW,PH);
  }
}

/** An SVG elliptical-arc segment as PDF bézier operators (the "m" is already written). */
export function pdfArc(x1,y1,r,large,sweep,x2,y2){
  /* endpoint → centre (SVG F.6.5), for the circular case the drawing uses */
  const dx=(x1-x2)/2, dy=(y1-y2)/2;
  let rr=Math.abs(r), lam=(dx*dx+dy*dy)/(rr*rr);
  if(lam>1) rr*=Math.sqrt(lam);
  const num=rr*rr-(dx*dx+dy*dy);
  const co=Math.sqrt(Math.max(0,num/(dx*dx+dy*dy)))*((large!==sweep)?1:-1);
  const cx=co*dy+(x1+x2)/2, cy=-co*dx+(y1+y2)/2;
  let a1=Math.atan2(y1-cy,x1-cx), a2=Math.atan2(y2-cy,x2-cx);
  let da=a2-a1;
  if(sweep && da<0) da+=2*Math.PI;
  if(!sweep && da>0) da-=2*Math.PI;
  const segs=Math.max(1,Math.ceil(Math.abs(da)/(Math.PI/2)));
  const step=da/segs, k=4/3*Math.tan(step/4);
  const out=[];
  for(let i=0;i<segs;i++){
    const t1=a1+i*step, t2=t1+step;
    const p1=[cx+rr*Math.cos(t1),cy+rr*Math.sin(t1)], p2=[cx+rr*Math.cos(t2),cy+rr*Math.sin(t2)];
    const c1=[p1[0]-k*rr*Math.sin(t1),p1[1]+k*rr*Math.cos(t1)];
    const c2=[p2[0]+k*rr*Math.sin(t2),p2[1]-k*rr*Math.cos(t2)];
    out.push(`${pnum(c1[0])} ${pnum(c1[1])} ${pnum(c2[0])} ${pnum(c2[1])} ${pnum(p2[0])} ${pnum(p2[1])} c`);
  }
  return out.join(" ");
}

/** Wrap one content stream as a complete single-page PDF, xref and all. */
export function pdfDocument(stream, pageW, pageH){
  const objs=[
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${pnum(pageW)} ${pnum(pageH)}]`
      + "/Resources<</Font<</F1 5 0 R/F2 6 0 R>>>>/Contents 4 0 R>>",
    `<</Length ${stream.length}>>\nstream\n${stream}endstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica/Encoding/WinAnsiEncoding>>",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica-Bold/Encoding/WinAnsiEncoding>>",
  ];
  let out="%PDF-1.4\n";
  const at=[];
  objs.forEach((body,i)=>{ at.push(out.length); out+=`${i+1} 0 obj\n${body}\nendobj\n`; });
  const startxref=out.length;
  out+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`
    + at.map(o=>String(o).padStart(10,"0")+" 00000 n \n").join("")
    + `trailer\n<</Size ${objs.length+1}/Root 1 0 R>>\nstartxref\n${startxref}\n%%EOF\n`;
  return out;
}

/** The sheet and its equipment table as a one-page PDF. */
export function renderPdf(info, items, order, width){
  return render(info,items,order,width,[],new PDF([info,items,order]));
}

export { PDF_PAGE, PDF_MARGIN, PDF };
