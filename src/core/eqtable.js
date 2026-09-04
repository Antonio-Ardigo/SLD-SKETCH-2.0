/* The equipment table, drawn beside the sheet.
 *
 * Every export that carries the table with the drawing draws it the same
 * way, through the canvas primitives (constitution §2: it is the table, not
 * a second reading of it). Only the text metrics differ — a DXF measures its
 * own font, a PDF measures Helvetica — so they come in as `wrap` and
 * `textWidth`.
 *
 *   drawEquipmentTable(canvas, [info, items, order], xLeft, yTop, metrics)
 *     → [right, bottom]
 */
import { CAPACITOR, EARTHING, ARRESTER } from "./types.js";

const EQ_HEADS = ["ID","Type","Description","Rating","Voltage","Protection","Feeds From","Notes"];
const EQ_LABELS = {[CAPACITOR]:"Capacitor Bank",[EARTHING]:"Earthing/NER",[ARRESTER]:"Surge Arrester"};

/** The Type as the table prints it: the surveyor's own label, else the canonical type in title case. */
export function eqTypeLabel(it){
  return it.label || EQ_LABELS[it.type]
    || it.type.replace(/\b\w/g,c=>c.toUpperCase()).replace("Mv ","MV ").replace("Lv ","LV ").replace("Rmu","RMU").replace("Mcc","MCC");
}

export function drawEquipmentTable(svg, table, xLeft, yTop, { wrap, textWidth }){
  const [info,items,order]=table;
  svg.layer="table";
  const size=11, rowH=18, pad=8, x0=xLeft; let y=yTop;
  svg.text(x0,y+14,info.site?("EQUIPMENT TABLE - "+info.site):"EQUIPMENT TABLE",{size:14,anchor:"start",bold:true});
  y+=24;
  for(const [k,v] of [["Site",info.site],["Date",info.date],["By",info.by],["Notes",info.notes]])
    if(v){ svg.text(x0,y+12,k+": "+v,{size:11,anchor:"start"}); y+=15; }
  y+=6;
  const heads=EQ_HEADS;
  const rows=order.map(i=>{ const it=items[i];
    return [it.id,eqTypeLabel(it),it.desc,it.rating,it.voltage,it.prots.join(", "),it.parents.join(", "),it.notes].map(v=>wrap(v)); });
  const cols=heads.map((h,i)=>Math.max(textWidth(h,size),...rows.flatMap(r=>r[i].map(l=>textWidth(l,size))))*1.15+2*pad);
  const x1=x0+cols.reduce((a,b)=>a+b,0), yHead=y;
  svg.line(x0,y,x1,y,1.2);
  let cx=x0;
  heads.forEach((h,i)=>{ svg.text(cx+pad,y+13,h,{size,anchor:"start",bold:true}); cx+=cols[i]; });
  y+=rowH;
  svg.line(x0,y,x1,y,1.2);
  for(const r of rows){
    cx=x0;
    const lines=Math.max(...r.map(c=>c.length));
    r.forEach((cell,i)=>{ cell.forEach((v,k)=>{ if(v) svg.text(cx+pad,y+13+15*k,v,{size,anchor:"start"}); }); cx+=cols[i]; });
    y+=rowH+15*(lines-1);
    svg.line(x0,y,x1,y,1);
  }
  cx=x0;
  for(const cw of cols.concat([0])){ svg.line(cx,yHead,cx,y,1); cx+=cw; }
  svg.layer="drawing";
  return [x1,y];
}
