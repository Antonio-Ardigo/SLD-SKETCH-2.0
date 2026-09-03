import { CAPACITOR, ARRESTER } from "./types.js";
import { TX_R, Y_TX_C1, LABEL_CHAR } from "./geometry.js";
import { esc } from "./model.js";

/* ------------------------------------------------ SVG builder */
/* one decimal, rounded half up: Python's format rounds a half-way value to
   even and JavaScript's toFixed does not, so both engines round the same
   way here */
const n1=v=>(Math.floor(v*10+0.5)/10).toFixed(1);
const n0=v=>Math.floor(v+0.5);
class SVG {
  /* the drawing surface: every symbol is built from these primitives, so
     the DXF writer only overrides them; `layer` is a hint the render sets
     while drawing the frame and the legend */
  constructor(){ this.parts=[]; this.layer="drawing"; this.vlines=[]; this.maxX=0; }
  _span(x,s,size,anchor,rotate){
    /* how far right a label reaches, so the sheet can be widened to hold
       it: an RMU or transformer description runs to the right of the
       symbol it names */
    const w=String(s).length*size*(LABEL_CHAR/11);
    const right=rotate!==null&&rotate!==undefined ? x+size*0.3
      : (anchor==="start"?x+w:anchor==="middle"?x+w/2:x);
    this.maxX=Math.max(this.maxX,right);
  }
  _track(x1,y1,x2,y2){   /* vertical conductors, so bar labels can dodge */
    if(Math.abs(x1-x2)<0.01 && Math.abs(y1-y2)>0.01)
      this.vlines.push([x1,Math.min(y1,y2),Math.max(y1,y2)]);
  }
  document(width,height){
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${n0(width)}" height="${height}" viewBox="0 0 ${n0(width)} ${height}"><rect width="100%" height="100%" fill="white"/>${this.parts.join("")}</svg>`;
  }
  /* everything drawn between begin(id) and end() belongs to that table row:
     the page finds a symbol's row with closest('[data-id]') */
  begin(id,kind){ this.parts.push(`<g data-id="${esc(id)}" data-kind="${kind}">`); }
  end(){ this.parts.push("</g>"); }
  line(x1,y1,x2,y2,w=2,dash=null){
    this._track(x1,y1,x2,y2);
    this.parts.push(`<line x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}" stroke="#111" stroke-width="${w}"${dash?` stroke-dasharray="${dash}"`:""} stroke-linecap="round"/>`);
  }
  rect(x,y,w,h,sw=2,dash=null,fill="none"){
    this.parts.push(`<rect x="${n1(x)}" y="${n1(y)}" width="${n1(w)}" height="${n1(h)}" fill="${fill}" stroke="#111" stroke-width="${sw}"${dash?` stroke-dasharray="${dash}"`:""}/>`);
  }
  circle(x,y,r,sw=2){
    this.parts.push(`<circle cx="${n1(x)}" cy="${n1(y)}" r="${r}" fill="none" stroke="#111" stroke-width="${sw}"/>`);
  }
  dot(x,y,r=3.2){
    this.parts.push(`<circle cx="${n1(x)}" cy="${n1(y)}" r="${r}" fill="#111"/>`);
  }
  poly(pts,fill="#111"){
    this.parts.push(`<polygon points="${pts.map(p=>n1(p[0])+","+n1(p[1])).join(" ")}" fill="${fill}"/>`);
  }
  text(x,y,s,{size=12,anchor="middle",bold=false,rotate=null}={}){
    if(!s) return;
    this._span(x,s,size,anchor,rotate);
    const tr=rotate!==null?` transform="translate(${n1(x)},${n1(y)}) rotate(${rotate})"`:"";
    const xy=rotate!==null?'x="0" y="0"':`x="${n1(x)}" y="${n1(y)}"`;
    this.parts.push(`<text ${xy}${tr} font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="#111" text-anchor="${anchor}"${bold?' font-weight="bold"':""}>${esc(s)}</text>`);
  }
  lbs(x,yt,yb){        /* IEC switch-disconnector: hinge circle + blade + bar */
    this.line(x,yt,x,yt+3);
    this.circle(x,yt+5.5,2.5,1.5);   /* hinge = switch */
    this.line(x+2,yt+8,x+9,yb-9);    /* blade */
    this.line(x-6,yb-9,x+6,yb-9);    /* contact bar */
    this.line(x,yb-9,x,yb);
  }
  fuseSwitch(x,yt,yb){
    const mid=(yt+yb)/2;
    this.lbs(x,yt,mid+4);
    this.rect(x-4,mid+6,8,yb-mid-8);
    this.line(x,mid+4,x,mid+6);
    this.line(x,yb-2,x,yb);
  }
  path(d,sw=2){
    this.parts.push(`<path d="${d}" fill="none" stroke="#111" stroke-width="${sw}" stroke-linecap="round"/>`);
  }
  /* protection device centred at y on a vertical conductor;
     returns the half-height the conductor must leave clear */
  device(kind,x,y){
    if(kind==="fuse"){ this.rect(x-4,y-11,8,22); this.line(x,y-11,x,y+11); return 11; }
    if(kind==="lbs"){ this.lbs(x,y-13,y+13); return 13; }
    if(kind==="fuse-switch"){ this.fuseSwitch(x,y-16,y+16); return 16; }
    if(kind==="contactor"){
      /* IEC: switch with the arc function symbol at the hinge */
      this.line(x,y-13,x,y-11);
      this.path(`M ${n1(x-4)},${n1(y-7)} A 4,4 0 0 1 ${n1(x+4)},${n1(y-7)}`);
      this.line(x+2,y-5,x+8,y+7);
      this.line(x,y+9,x,y+13);
      return 13;
    }
    if(kind==="fuse-contactor"){
      /* MV motor starter: back-up fuse in series with the contactor */
      this.rect(x-4,y-16,8,12);
      this.line(x,y-16,x,y-4);
      this.path(`M ${n1(x-4)},${n1(y)} A 4,4 0 0 1 ${n1(x+4)},${n1(y)}`);
      this.line(x+2,y+2,x+7,y+11);
      this.line(x,y+12,x,y+16);
      return 16;
    }
    /* 'cb'/unknown - breaker: the switch symbol with an X at its hinge */
    this.line(x,y-13,x,y-11);
    this.line(x-3.5,y-11,x+3.5,y-4);
    this.line(x-3.5,y-4,x+3.5,y-11);
    this.line(x+2,y-4.5,x+9,y+4);
    this.line(x-6,y+4,x+6,y+4);
    this.line(x,y+4,x,y+13);
    return 13;
  }
  /* protection device centred at x on a horizontal conductor */
  deviceH(kind,x,y){
    if(kind==="fuse"){ this.rect(x-11,y-4,22,8); this.line(x-11,y,x+11,y); return 11; }
    if(kind==="fuse-switch"){
      this.line(x-16,y,x-14.5,y);
      this.circle(x-12,y,2.5,1.5);     /* hinge = switch */
      this.line(x-10,y-1.5,x+1,y-9);   /* blade */
      this.line(x+1,y-6,x+1,y+6);
      this.rect(x+3,y-4,12,8);
      this.line(x+1,y,x+3,y);
      this.line(x+15,y,x+16,y);
      return 16;
    }
    if(kind==="contactor"){
      /* IEC: switch with the arc function symbol at the hinge */
      this.line(x-13,y,x-11,y);
      this.path(`M ${n1(x-7)},${n1(y-4)} A 4,4 0 0 0 ${n1(x-7)},${n1(y+4)}`);
      this.line(x-5,y-2,x+7,y-8);
      this.line(x+9,y,x+13,y);
      return 13;
    }
    if(kind==="fuse-contactor"){
      this.rect(x-16,y-4,12,8);
      this.line(x-16,y,x-4,y);
      this.path(`M ${n1(x)},${n1(y-4)} A 4,4 0 0 0 ${n1(x)},${n1(y+4)}`);
      this.line(x+2,y-2,x+11,y-7);
      this.line(x+12,y,x+16,y);
      return 16;
    }
    if(kind==="lbs"){
      this.line(x-13,y,x-10.5,y);
      this.circle(x-8,y,2.5,1.5);      /* hinge = switch */
      this.line(x-6,y-1.5,x+4,y-9);    /* blade */
      this.line(x+4,y-6,x+4,y+6);
      this.line(x+4,y,x+13,y);
      return 13;
    }
    /* 'cb'/unknown - breaker: the switch symbol with an X at its hinge */
    this.line(x-13,y,x-11,y);
    this.line(x-11,y-3.5,x-4,y+3.5);
    this.line(x-11,y+3.5,x-4,y-3.5);
    this.line(x-4.5,y-2,x+4,y-9);
    this.line(x+4,y-6,x+4,y+6);
    this.line(x+4,y,x+13,y);
    return 13;
  }
  drop(x,ytop,ybot,kind,ydev,dash){
    const y=(ydev!==undefined && ydev!==null)?ydev:(ytop+ybot)/2;
    const gap=this.device(kind,x,y);
    this.line(x,ytop,x,y-gap,2,dash||null);
    this.line(x,y+gap,x,ybot,2,dash||null);
  }
  earth(x,y){            /* three shortening bars under a conductor ending at y */
    this.line(x-9,y,x+9,y); this.line(x-6,y+4,x+6,y+4); this.line(x-3,y+8,x+3,y+8);
  }
  capacitor(x,y){        /* capacitor bank to earth, plates from y down; height 24 */
    this.line(x-9,y,x+9,y,2.5); this.line(x-9,y+6,x+9,y+6,2.5);
    this.line(x,y+6,x,y+16); this.earth(x,y+16); return 24;
  }
  resistor(x,y){         /* neutral earthing resistor to earth; height 46 */
    this.rect(x-6,y,12,30); this.line(x,y+30,x,y+38); this.earth(x,y+38); return 46;
  }
  arrester(x,y){         /* surge arrester to earth; height 44 */
    this.rect(x-7,y,14,28);
    this.line(x,y+4,x,y+20); this.line(x-4,y+16,x,y+22); this.line(x+4,y+16,x,y+22);
    this.line(x,y+28,x,y+36); this.earth(x,y+36); return 44;
  }
  terminal(kind,x,y){
    if(kind===CAPACITOR) return this.capacitor(x,y);
    if(kind===ARRESTER) return this.arrester(x,y);
    return this.resistor(x,y);
  }
  vsd(x,y){              /* drive box over a motor's drop, conductor running through */
    this.rect(x-12,y-7,24,14,1.5,null,"white"); this.text(x,y+3,"VSD",{size:7.5});
  }
  /* a generation source: the G circle, or its variants — an inverter (the
     ~ / = box in the circle) and a battery (two plates) */
  genMark(x,cy,r,variant){
    this.circle(x,cy,r,2.2);
    if(variant==="inverter"){
      this.line(x-r*0.6,cy+r*0.6,x+r*0.6,cy-r*0.6,1.5);
      this.text(x-r*0.4,cy-r*0.15,"~",{size:r*0.7,bold:true}); this.text(x+r*0.4,cy+r*0.62,"=",{size:r*0.7,bold:true});
    } else if(variant==="battery"){
      this.line(x-r*0.55,cy-r*0.25,x+r*0.55,cy-r*0.25,3); this.line(x-r*0.3,cy+r*0.2,x+r*0.3,cy+r*0.2,2);
      this.line(x,cy-r,x,cy-r*0.25); this.line(x,cy+r*0.2,x,cy+r);
    } else this.text(x,cy+4,"G",{size:13,bold:true});
  }
  transformer(x,lines,side,y,variant){
    const c1=(y===undefined)?Y_TX_C1:y;
    if(variant==="ups"){            /* a UPS: the box with its conversion marks */
      this.rect(x-TX_R,c1-TX_R,2*TX_R,27+2*TX_R,2.2);
      this.line(x-TX_R,c1+27+TX_R,x+TX_R,c1-TX_R,1.2);
      this.text(x-7,c1+4,"~",{size:11,bold:true}); this.text(x+7,c1+27+2,"=",{size:11,bold:true});
      this.text(x,c1+27+TX_R-5,"UPS",{size:7});
    } else { this.circle(x,c1,TX_R,2.2); this.circle(x,c1+27,TX_R,2.2); }
    let ty=c1-6;
    for(const s of lines){
      if(side==="left") this.text(x-TX_R-10,ty,s,{anchor:"end"});
      else this.text(x+TX_R+10,ty,s,{anchor:"start"});
      ty+=15;
    }
  }
  openEnd(x,yFrom,yTo,note){
    /* an unterminated conductor: a stub to an open terminal bar */
    this.line(x,yFrom,x,yTo);
    this.line(x-12,yTo,x+12,yTo);
    this.text(x,yTo<yFrom?yTo-8:yTo+18,note,{size:9});
  }
  arrowDown(x,ytip){ this.poly([[x-6,ytip-11],[x+6,ytip-11],[x,ytip]]); }
}

export { n1, n0, SVG };
