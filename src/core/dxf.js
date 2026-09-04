import { SVG } from "./svg.js";
import { drawEquipmentTable } from "./eqtable.js";
import { render } from "./render.js";

/* ------------------------------------------------ DXF export */
/* An R12 (AC1009) DXF: the sketch exactly as drawn (the same symbol
   primitives, y negated because DXF grows upward) and the equipment table
   under it. One unit is one sketch pixel; take it as 1 mm. */
const DXF_LAYERS=[["SLD_DRAWING",7],["SLD_BUSBAR",7],["SLD_TEXT",7],
  ["SLD_ENCLOSURE",8],["SLD_FRAME",8],["SLD_LEGEND",8],["SLD_TABLE",7]];
const DXF_TEXT_H=0.72, DXF_WIDTH_F=0.8, DXF_CHAR_W=0.9*DXF_WIDTH_F, DXF_WRAP_AT=40;
const DXF_SUBST={"\u2014":"-","\u2013":"-","\u00b7":"-","\u00d7":"x","\u2192":"->",
  "\u2190":"<-","\u00b1":"+/-","\u2026":"..."};
function dnum(v){
  /* two decimals, rounded half up, matching the Python writer */
  let t=(Math.floor(v*100+0.5)/100).toFixed(2).replace(/0+$/,"").replace(/\.$/,"");
  return (t==="-0"||t==="")?"0":t;
}
function dclean(s){ return String(s).replace(/[\u2014\u2013\u00b7\u00d7\u2192\u2190\u00b1\u2026]/g,c=>DXF_SUBST[c]); }
function dtextW(s,size){ return dclean(s).length*size*DXF_TEXT_H*DXF_CHAR_W; }
function dwrap(s,n=DXF_WRAP_AT){
  const out=[]; let cur="";
  for(const w of String(s).split(/\s+/).filter(Boolean)){
    if(cur && cur.length+1+w.length>n){ out.push(cur); cur=w; }
    else cur=(cur+" "+w).trim();
  }
  if(cur) out.push(cur);
  return out.length?out:[""];
}
class DXF extends SVG {
  constructor(table){ super(); this.ents=[]; this.table=table||null; this.count=0; }
  begin(){}  /* row grouping is an SVG affair; DXF has layers */
  end(){}
  _layer(kind){
    if(this.layer==="frame") return "SLD_FRAME";
    if(this.layer==="legend") return "SLD_LEGEND";
    if(this.layer==="table") return "SLD_TABLE";
    return {text:"SLD_TEXT",busbar:"SLD_BUSBAR",enclosure:"SLD_ENCLOSURE"}[kind]||"SLD_DRAWING";
  }
  /* coordinates (codes 10-13 / 20-23) stay raw numbers in DXF space until
     document() knows the extents and can centre the drawing on the origin */
  _e(...pairs){ this.ents.push(pairs); this.count++; }
  static emit(pairs,dx,dy){
    return pairs.map(([c,v])=>{
      if(c>=10&&c<=13) v=dnum(v+dx); else if(c>=20&&c<=23) v=dnum(v+dy);
      return c+"\n"+v;
    }).join("\n");
  }
  line(x1,y1,x2,y2,w=2,dash=null){
    this._track(x1,y1,x2,y2);
    if(w>=3){                       /* a bar: a polyline with width */
      const lay=this._layer("busbar");
      this._e([0,"POLYLINE"],[8,lay],[66,1],[70,0],[40,dnum(w)],[41,dnum(w)],[10,0],[20,0],[30,0]);
      this._e([0,"VERTEX"],[8,lay],[10,x1],[20,-y1],[30,0]);
      this._e([0,"VERTEX"],[8,lay],[10,x2],[20,-y2],[30,0]);
      this._e([0,"SEQEND"],[8,lay]);
      return;
    }
    const pairs=[[0,"LINE"],[8,this._layer()]];
    if(dash) pairs.push([6,"DASHED"]);
    pairs.push([10,x1],[20,-y1],[30,0],[11,x2],[21,-y2],[31,0]);
    this._e(...pairs);
  }
  rect(x,y,w,h,sw=2,dash=null,fill="none"){
    const lay=this._layer(dash?"enclosure":"drawing");
    const pairs=[[0,"POLYLINE"],[8,lay]];
    if(dash) pairs.push([6,"DASHED"]);
    pairs.push([66,1],[70,1],[10,0],[20,0],[30,0]);
    this._e(...pairs);
    for(const [px,py] of [[x,y],[x+w,y],[x+w,y+h],[x,y+h]])
      this._e([0,"VERTEX"],[8,lay],[10,px],[20,-py],[30,0]);
    this._e([0,"SEQEND"],[8,lay]);
  }
  circle(x,y,r,sw=2){
    this._e([0,"CIRCLE"],[8,this._layer()],[10,x],[20,-y],[30,0],[40,dnum(r)]);
  }
  dot(x,y,r=3.2){                   /* a filled dot: the classic donut */
    const lay=this._layer();
    this._e([0,"POLYLINE"],[8,lay],[66,1],[70,1],[40,dnum(r)],[41,dnum(r)],[10,0],[20,0],[30,0]);
    for(const px of [x-r/2,x+r/2])
      this._e([0,"VERTEX"],[8,lay],[10,px],[20,-y],[30,0],[42,1]);
    this._e([0,"SEQEND"],[8,lay]);
  }
  poly(pts,fill="#111"){
    pts=pts.slice();
    if(pts.length<3) return;
    while(pts.length<4) pts.push(pts[pts.length-1]);
    const pairs=[[0,"SOLID"],[8,this._layer()]];
    [0,1,3,2].forEach((k,i)=>{     /* a SOLID's corners run 1-2-4-3 */
      const [px,py]=pts[i];
      pairs.push([10+k,px],[20+k,-py],[30+k,0]);
    });
    this._e(...pairs);
  }
  text(x,y,s,{size=12,anchor="middle",bold=false,rotate=null}={}){
    if(!s) return;
    this._span(x,s,size,anchor,rotate);
    const pairs=[[0,"TEXT"],[8,this._layer("text")],[7,"STANDARD"],
      [10,x],[20,-y],[30,0],[40,dnum(size*DXF_TEXT_H)],[1,dclean(s)]];
    if(rotate) pairs.push([50,dnum(-rotate)]);     /* SVG rotates clockwise */
    if(anchor!=="start") pairs.push([72,anchor==="middle"?1:2],[11,x],[21,-y],[31,0]);
    this._e(...pairs);
  }
  path(d,sw=2){                     /* the contactor's hinge arc: a semicircle */
    const m=d.match(/M\s*([-\d.]+),([-\d.]+)\s+A\s*([-\d.]+),[-\d.]+\s+[-\d.]+\s+(\d)\s+(\d)\s+([-\d.]+),([-\d.]+)/);
    if(!m) return;
    const [x1,y1,r,,sweep,x2,y2]=m.slice(1).map(Number);
    const cx=(x1+x2)/2, cy=-(y1+y2)/2;
    const deg=(a)=>((a*180/Math.PI)%360+360)%360;
    const a1=deg(Math.atan2(-y1-cy,x1-cx)), a2=deg(Math.atan2(-y2-cy,x2-cx));
    const [start,end]=(sweep===1)?[a2,a1]:[a1,a2];   /* DXF arcs run anticlockwise */
    this._e([0,"ARC"],[8,this._layer()],[10,cx],[20,cy],[30,0],[40,dnum(r)],[50,dnum(start)],[51,dnum(end)]);
  }
  drawTable(xLeft,yTop){       /* the equipment table beside the sheet */
    return drawEquipmentTable(this,this.table,xLeft,yTop,{wrap:dwrap,textWidth:dtextW});
  }
  document(width,height){
    /* the table stands to the right of the sheet, 40 units clear; then the
       whole drawing is centred on the origin and the opening view fitted */
    let right=width, bottom=height;
    if(this.table){
      const [x1,y1]=this.drawTable(width+40,24);
      right=Math.max(right,x1+24); bottom=Math.max(bottom,y1+24);
    }
    const dx=-right/2, dy=bottom/2;
    const xmin=-right/2, xmax=right/2, ymin=-bottom/2, ymax=bottom/2;
    const out=["0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009",
      `9\n$EXTMIN\n10\n${dnum(xmin)}\n20\n${dnum(ymin)}\n30\n0`,
      `9\n$EXTMAX\n10\n${dnum(xmax)}\n20\n${dnum(ymax)}\n30\n0`,
      `9\n$LIMMIN\n10\n${dnum(xmin)}\n20\n${dnum(ymin)}`,
      `9\n$LIMMAX\n10\n${dnum(xmax)}\n20\n${dnum(ymax)}`,
      "0\nENDSEC","0\nSECTION\n2\nTABLES",
      "0\nTABLE\n2\nVPORT\n70\n1",
      "0\nVPORT\n2\n*ACTIVE\n70\n0\n10\n0\n20\n0\n11\n1\n21\n1"
      +"\n12\n0\n22\n0\n13\n0\n23\n0\n14\n10\n24\n10\n15\n10\n25\n10"
      +"\n16\n0\n26\n0\n36\n1\n17\n0\n27\n0\n37\n0"
      +`\n40\n${dnum(bottom*1.08)}\n41\n${dnum(right/bottom)}`
      +"\n42\n50\n43\n0\n44\n0\n50\n0\n51\n0\n71\n0\n72\n100"
      +"\n73\n1\n74\n3\n75\n0\n76\n0\n77\n0\n78\n0",
      "0\nENDTAB",
      "0\nTABLE\n2\nLTYPE\n70\n2",
      "0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0",
      "0\nLTYPE\n2\nDASHED\n70\n0\n3\n__ __ __\n72\n65\n73\n2\n40\n9\n49\n6\n49\n-3",
      "0\nENDTAB",`0\nTABLE\n2\nLAYER\n70\n${DXF_LAYERS.length}`];
    for(const [name,col] of DXF_LAYERS) out.push(`0\nLAYER\n2\n${name}\n70\n0\n62\n${col}\n6\nCONTINUOUS`);
    out.push("0\nENDTAB","0\nTABLE\n2\nSTYLE\n70\n1",
      `0\nSTYLE\n2\nSTANDARD\n70\n0\n40\n0\n41\n${dnum(DXF_WIDTH_F)}\n50\n0\n71\n0\n42\n2.5\n3\ntxt\n4\n`,
      "0\nENDTAB","0\nENDSEC","0\nSECTION\n2\nBLOCKS\n0\nENDSEC","0\nSECTION\n2\nENTITIES");
    out.push(...this.ents.map(e=>DXF.emit(e,dx,dy)));
    out.push("0\nENDSEC","0\nEOF","");
    return out.join("\n");
  }
}
function renderDxf(info, items, order, width){
  return render(info,items,order,width,new DXF([info,items,order]));
}

export { DXF_LAYERS, DXF_TEXT_H, DXF_WIDTH_F, DXF_CHAR_W, DXF_WRAP_AT, DXF_SUBST, dnum, dclean, dtextW, dwrap, DXF, renderDxf };
