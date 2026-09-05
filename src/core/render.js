import { MV_INCOMER, RMU, MV_BUSBAR, TRANSFORMER, PUMP, GENERATOR, LV_BUSBAR, FEEDER, MCC, BUS_COUPLER, CAPACITOR, EARTHING, ARRESTER, TERMINALS, LV_LOADS, hasWord, earthBelow, stateWords, protFor } from "./types.js";
import { Y_LABEL, Y_MV_TOP, Y_RMU_TOP, Y_RMU_BOT, Y_MVBUS, PUMP_R, TX_R, STEPUP_H, GEN_H, LV_SUB_H, Y_GEN, Y_SU_C1, Y_SU_C2, STEPUP_SHIFT, Y_PUMP, Y_TX_C1, Y_TX_C2, Y_BUS, Y_ARROW, DIAG_H, LABEL_CHAR, extendSheet, labelClearance, allocLanes, setTiers, VIEW, genFeeds, mvGens, rmuHang, hangHas, suMid, lvSubs, stepUps, genBelow, mvDepth, levelLinks, tierOffsets } from "./geometry.js";
import { childrenOf } from "./model.js";
import { mccLoads, subBoardsOf, carriesOn, feederBoard, isSubBoard, boardTx, txLines, txBoard, txLoads, lvLevel, barLabel, crossingXs, labelX, subLevels } from "./layout.js";
import { SVG } from "./svg.js";
import { legendEntries, drawSymbol } from "./symbols/registry.js";
import { couplerOf } from "./couplers.js";

/* A coupler that is not a tie between two placed busbars is still on the
   sheet (constitution §6): it runs from the busbar it does have into the lane
   above the bar row — the same clear lane a blocked tie uses — and ends open,
   so the drawing shows exactly how far the survey got. With no placed busbar
   at all it stands on its own in the leftover column, both ends open.
   Successive stubs on one bar stack upwards so they never lie on each other.
   The device glyph is what gives the group a box for the page to pick up. */
function couplerStub(svg,bc,bar,dev,lbl,n,yBus,lvY){
  const RUN=30, STUB=22, LANE=30;
  svg.begin(bc.id,bc.type);
  if(bar){
    /* each stub leaves the bar at its own point and runs in its own lane, so
       two of them on one board never lie on top of each other */
    const y0=bar.type===MV_BUSBAR?yBus(bar):lvY(bar), x0=bar.xRight-n*14, y=y0-LANE-n*LANE;
    svg.dot(x0,y0);
    svg.line(x0,y0,x0,y,2);
    const g=svg.deviceH(dev,x0+RUN,y);
    svg.line(x0,y,x0+RUN-g,y,2);
    svg.line(x0+RUN+g,y,x0+RUN+STUB,y,2);
    svg.line(x0+RUN+STUB,y-10,x0+RUN+STUB,y+10,2);      /* the open end */
    svg.text(x0+RUN,y-12,lbl,{size:11});
    svg.text(x0+RUN,y-24,bc.notes,{size:10});
  } else {
    const y=Y_BUS-LANE-n*LANE, x=bc.x, g=svg.deviceH(dev,x,y);
    svg.line(x-RUN,y,x-g,y,2);
    svg.line(x+g,y,x+RUN,y,2);
    svg.line(x-RUN,y-10,x-RUN,y+10,2);
    svg.line(x+RUN,y-10,x+RUN,y+10,2);
    svg.text(x,y-12,lbl,{size:11});
    svg.text(x,y-24,bc.notes,{size:10});
  }
  svg.end();
}

/* ------------------------------------------------ render */
const LEGEND_H=100;
/* the legend is drawn from the symbol registry: the fixed entries plus the
   terminal items a sheet actually uses (src/core/symbols/registry.js) */
const LEGEND_CELL=68, LEGEND_ROW_H=60;   /* a second row on a narrow sheet */
function legendRows(width, n){
  /* [cells per row, rows] so the legend fits the sheet width */
  const perRow=Math.max(1,Math.floor((width-48-16)/LEGEND_CELL));
  return [perRow, Math.max(1,Math.ceil(n/perRow))];
}
function drawLegend(svg, extra, width){
  const cell=LEGEND_CELL, x0=24, y0=DIAG_H+6;
  const entries=legendEntries(extra);
  const [perRow,rows]=legendRows(width===undefined?1e9:width,entries.length);
  svg.rect(x0,y0,16+cell*Math.min(entries.length,perRow),82+LEGEND_ROW_H*(rows-1),1.2);
  svg.text(x0+8,y0+14,"LEGEND",{size:10,anchor:"start",bold:true});
  entries.forEach(([kind,label],i)=>{
    const ytop=y0+22+LEGEND_ROW_H*Math.floor(i/perRow), ybot=ytop+30, yc=(ytop+ybot)/2;
    const cx=x0+8+cell*(i%perRow)+cell/2;
    drawSymbol(svg,kind,cx,ytop,ybot);
    let ty=ybot+12;
    for(const s of (label.length>11?label.split(/ (.+)/).filter(Boolean):[label])){
      svg.text(cx,ty,s,{size:9}); ty+=10;
    }
  });
}

function render(info, items, order, width, canvas){
  const svg=canvas||new SVG();
  const barLabels=[];   /* [xLeft,xRight,baseline,text]: drawn last, once
                           every conductor is on the sheet */
  const depth=mvDepth(items,order);
  const sus=stepUps(items,order);
  const gens=mvGens(items,order);
  const hang=rmuHang(items,order);
  const links=levelLinks(items,order,depth);
  const ltx=new Set(links.map(([,tx])=>tx.id));
  const hung=Object.values(hang).flatMap(k=>[...k])
    .concat(Object.values(gens).flatMap(fed=>fed.map(([b])=>b.id).filter(id=>id in depth)));
  const tierOff=tierOffsets(depth,links,hung);
  setTiers(tierOff.length?tierOff[tierOff.length-1]:0,
           Object.keys(sus).length?STEPUP_H:(Object.keys(gens).length?GEN_H:0),
           subLevels(items,order));
  const dy=it=>tierOff.length?tierOff[depth[it.id]||0]:0;
  const lvY=bb=>Y_BUS+LV_SUB_H*lvLevel(items,bb);
  extendSheet(labelClearance(items,order,lvY));
  const noToward=(owner,other)=>stateWords(owner).has("no")
    && hasWord(owner.notes.toLowerCase(),[other.id.toLowerCase()]);
  const noUnnamed=(owner,others)=>stateWords(owner).has("no")
    && !others.some(o=>hasWord(owner.notes.toLowerCase(),[o.id.toLowerCase()]));
  const yRmu=r=>{ const o=dy(r)+STEPUP_SHIFT;
    return [Y_RMU_TOP+o, Y_RMU_BOT+o, (Y_RMU_TOP+Y_RMU_BOT)/2+o]; };
  const yBus=b=>Y_MVBUS+dy(b)+STEPUP_SHIFT;
  const by=t=>order.map(i=>items[i]).filter(o=>t.includes(o.type));
  /* A feeder that carries equipment is a link: the way belongs to the thing
     hung on it, so the run starts at the board the feeder leaves. `kind` is
     the feeder's own device when its row names one — drawn at the top of the
     run, above the equipment's; an empty cell adds nothing, which is why a
     motor on a blank feeder draws exactly as a way of the board does.
     HANG is how far the equipment moves down to make room for that device. */
  const HANG=60;
  const carriedBy=f=>{
    const board=feederBoard(items,f);
    if(!board || board.x===null) return null;
    const [raw,k]=protFor(f,board.id);
    const kind=k||(raw.trim()?"cb":null);
    /* An RMU draws the device of every way *inside* its enclosure, so a way
       out of one hands over a bare conductor from the bottom of the box —
       drawing a second device below it would be the same switch twice. */
    if(board.type===RMU) return { board, y:yRmu(board)[1], kind:null, drop:0 };
    const y=board.type===MV_BUSBAR?yBus(board):lvY(board);
    return { board, y, kind, drop:kind?HANG:0 };
  };
  const busbars=by([LV_BUSBAR]), mvbs=by([MV_BUSBAR]), rmus=by([RMU]),
        lvsub=lvSubs(items,order), lvsubMid=suMid(items,order),
        txs=order.map(i=>items[i])
          .filter(o=>o.type===TRANSFORMER || (o.id in lvsub)),
        pumps=by([PUMP]), mvs=by([MV_INCOMER]),
        couplers=by([BUS_COUPLER]), feeders=by([FEEDER,MCC].concat(TERMINALS));

  const title=(info.site?info.site+" — ":"")+"Single Line Diagram (sketch)";
  svg.layer="frame";
  /* the title runs along the bottom to the left of the title block; a long
     site name wraps rather than running into it */
  const room=width-288-48-24;
  let head=title, tail="";
  if(title.length*8.6>room && title.includes(" ")){
    const cut=title.lastIndexOf(" ",Math.max(1,Math.floor(room/8.6)));
    if(cut>0){ head=title.slice(0,cut); tail=title.slice(cut+1); }
  }
  svg.text(24,DIAG_H-26-(tail?16:0),head,{size:16,anchor:"start",bold:true});
  if(tail) svg.text(24,DIAG_H-26,tail,{size:16,anchor:"start",bold:true});
  svg.layer="drawing";

  /* RMU link topology */
  const sideLinks=[], ringLinks=[], ringEntries={};
  for(const rmu of rmus)
    for(const p of rmu.parents){
      if(items[p].type!==RMU || hangHas(hang,p,rmu.id)) continue;
      if(items[p].x===null||rmu.x===null) continue;
      const [a,b]=[items[p],rmu].sort((u,v)=>u.x-v.x);
      if(sideLinks.some(l=>l[0]===a&&l[1]===b)
         || ringLinks.some(l=>l[3]===a.id+"|"+b.id)) continue;   /* written both ways */
      const tier=depth[a.id];
      const between=rmus.some(r=>r!==a&&r!==b&&a.x<r.x&&r.x<b.x
                                 &&depth[r.id]===tier);
      if(between){
        const xa=a.x-28, xb=b.x+28;
        (ringEntries[a.id]=ringEntries[a.id]||[]).push([xa,b.id]);
        (ringEntries[b.id]=ringEntries[b.id]||[]).push([xb,a.id]);
        ringLinks.push([xa,xb,Y_RMU_TOP+dy(a),a.id+"|"+b.id]);
      } else sideLinks.push([a,b]);
    }
  /* linked sides get a wider enclosure so the way switch fits inside */
  const padL={}, padR={};
  for(const r of rmus){ padL[r.id]=42; padR[r.id]=42; }
  for(const [a,b] of sideLinks){ padR[a.id]=64; padL[b.id]=64; }

  /* RMU enclosures */
  const rmuBox={};
  for(const rmu of rmus){
    svg.begin(rmu.id,rmu.type);
    const waysIn=mvs.filter(m=>childrenOf(items,order,m.id).some(k=>k.id===rmu.id))
      .concat(Object.keys(sus).map(t=>items[t])
        .filter(t=>childrenOf(items,order,t.id).some(k=>k.id===rmu.id)));
    for(const [u,tx,l] of links)               /* from a higher tier */
      if(l.id===rmu.id && !waysIn.includes(tx)) waysIn.push(tx);
    for(const g of Object.keys(gens))          /* a generator of its own */
      if(gens[g].some(([b])=>b.id===rmu.id)) waysIn.push(items[g]);
    const boardsIn=rmu.parents.map(p=>items[p])
      .filter(p=>p.type===MV_BUSBAR            /* board-fed RMU, or fed */
                 || hangHas(hang,p.id,rmu.id)); /* from the RMU above it */
    const midAll=suMid(items,order);
    const waysOut=childrenOf(items,order,rmu.id,
                             [TRANSFORMER,PUMP,MV_BUSBAR].concat(LV_LOADS))
      .concat(childrenOf(items,order,rmu.id,[RMU]).filter(k=>hangHas(hang,rmu.id,k.id)))
      .concat(Object.keys(midAll).filter(t=>midAll[t][1].id===rmu.id
                                            && items[t].x!==null)
                                 .map(t=>items[t]));
    const outX=t=>(t.id in rmu.tee)?rmu.tee[t.id]:t.x;
    let xs=waysIn.concat(waysOut).filter(w=>w.x!==null).map(outX);
    if(!xs.length) xs=[rmu.x];
    xs=xs.concat((ringEntries[rmu.id]||[]).map(e=>e[0]));
    xs=xs.concat(boardsIn.map(b=>(b.id in rmu.land)?rmu.land[b.id]:rmu.x));
    const left=Math.min(...xs)-padL[rmu.id], right=Math.max(...xs)+padR[rmu.id];
    const busL=Math.min(...xs)-18, busR=Math.max(...xs)+18;
    rmuBox[rmu.id]=[left,right,busL,busR];
    const [rt,rb,ymid]=yRmu(rmu);
    svg.rect(left,rt,right-left,rb-rt,1.6,"7 5");
    svg.line(busL,ymid,busR,ymid,3.4);
    const inWay=(x,kind)=>{  /* default LBS, overridden by Protection */
      if(kind && kind!=="lbs") svg.drop(x,rt,ymid,kind);
      else { svg.lbs(x,rt+12,ymid); svg.line(x,rt,x,rt+12); }
      svg.dot(x,ymid);
    };
    for(const m of waysIn) inWay(m.x, protFor(rmu,m.id)[1]);
    for(const b of boardsIn)
      inWay((b.id in rmu.land)?rmu.land[b.id]:rmu.x, protFor(rmu,b.id)[1]);
    for(const [xe,other] of ringEntries[rmu.id]||[]){
      inWay(xe, rmu.parents.includes(other)?protFor(rmu,other)[1]:null);
    }
    for(const t of waysOut){  /* default fuse-switch, per fed item's row */
      let kind=protFor(t,rmu.id)[1];
      const xo=outX(t);
      if(t.type===RMU && !kind) kind="lbs";   /* a cable to another RMU */
      if(kind && kind!=="fuse-switch") svg.drop(xo,ymid,rb,kind);
      else {
        svg.fuseSwitch(xo,ymid+4,rb-8);
        svg.line(xo,ymid,xo,ymid+4);
        svg.line(xo,rb-8,xo,rb);
      }
      svg.dot(xo,ymid);
    }
    const lbl=[rmu.id,rmu.desc,[rmu.rating,rmu.voltage].filter(Boolean).join(" ")];
    /* keep the label block clear of the next item on the same tier */
    const tier=depth[rmu.id];
    const sameTier=order.map(q=>items[q]).filter(o=>
      [RMU,MV_BUSBAR].includes(o.type)&&o!==rmu&&o.x!==null&&depth[o.id]===tier);
    const edgesR=sameTier.filter(o=>o.x>rmu.x)
      .map(o=>o.type===MV_BUSBAR?o.xLeft:o.x-60);
    const edgesL=sameTier.filter(o=>o.x<rmu.x)
      .map(o=>o.type===MV_BUSBAR?o.xRight:o.x+60);
    const roomR=edgesR.length?Math.min(...edgesR)-right:1e9;
    const roomL=edgesL.length?left-Math.max(...edgesL):1e9;
    let lx,anc,ty;
    if(roomR>=130){ lx=right+10; anc="start"; ty=rt+16; }
    else if(roomL>=130){ lx=left-10; anc="end"; ty=rt+16; }
    else { /* crowded tier: stack above the box, clear of the ring lane */
      lx=rmu.x; anc="middle"; ty=rt-34-15*(lbl.length-1);
    }
    lbl.forEach((s,i)=>{ svg.text(lx,ty,s,{anchor:anc,bold:i===0}); ty+=15; });
    const linked=rmu.parents.map(p=>items[p]).filter(p=>p.type===RMU)
      .concat(childrenOf(items,order,rmu.id,[RMU]));
    if(noUnnamed(rmu,linked))       /* the open point is here, way unnamed */
      svg.text(rmu.x+12,rb+14,"N.O.",{size:9,anchor:"start"});
    svg.end();
  }

  /* RMU-to-RMU cables */
  for(const [a,b] of sideLinks){
    if(!rmuBox[a.id]||!rmuBox[b.id]) continue;
    const ymid=yRmu(a)[2];
    const aR=rmuBox[a.id][1], aBusR=rmuBox[a.id][3];
    const bL=rmuBox[b.id][0], bBusL=rmuBox[b.id][2];
    svg.line(aR,ymid,bL,ymid,2);  /* cable between boxes */
    if(noToward(a,b)||noToward(b,a)) svg.text((aR+bL)/2,ymid+12,"N.O.",{size:9});  /* the ring's open point */
    /* the way switch inside each box, between the wall and the bus
       (default LBS; the fed RMU's Protection entry can override it) */
    for(const [xe,xc,owner,other] of [[aR,aBusR,a,b],[bL,bBusL,b,a]]){
      const kind=(owner.parents.includes(other.id)?protFor(owner,other.id)[1]:null)||"lbs";
      const xm=(xe+xc)/2;
      const gap=svg.deviceH(kind,xm,ymid);
      const lo=Math.min(xe,xc), hi=Math.max(xe,xc);
      svg.line(lo,ymid,xm-gap,ymid,2);
      svg.line(xm+gap,ymid,hi,ymid,2);
    }
  }
  for(const [xa,xb,rTop,key] of ringLinks){
    const yRing=rTop-26;
    svg.line(xa,rTop,xa,yRing);
    svg.line(xa,yRing,xb,yRing);
    svg.line(xb,yRing,xb,rTop);
    const [ia,ib]=key.split("|");
    if(noToward(items[ia],items[ib])||noToward(items[ib],items[ia]))
      svg.text((xa+xb)/2,yRing+11,"N.O.",{size:9});
  }
  /* an RMU hung below its ring RMU: from the tee-off in the enclosure
     down to a lane, across to the box below, and in through its top */
  const hangRuns=[];
  for(const p of Object.keys(hang))
    for(const c of hang[p]){
      if(items[p].x===null||items[c].x===null) continue;
      const xT=(c in items[p].tee)?items[p].tee[c]:items[c].x;
      hangRuns.push([p+"|"+c,xT,items[c].x]);
    }
  const hangLane={};
  for(const rb of new Set(Object.keys(hang).map(p=>yRmu(items[p])[1]))){
    const runs=hangRuns.filter(r=>yRmu(items[r[0].split("|")[0]])[1]===rb
                                  && Math.abs(r[1]-r[2])>=1);
    Object.assign(hangLane,allocLanes(runs,[rb+22,rb+34,rb+46]));
  }
  for(const [key,xT,xC] of hangRuns){
    const [p,c]=key.split("|");
    const rb=yRmu(items[p])[1], rt=yRmu(items[c])[0];
    if(Math.abs(xT-xC)<1) svg.line(xC,rb,xC,rt);
    else {
      const yL=hangLane[key];
      svg.line(xT,rb,xT,yL); svg.line(xT,yL,xC,yL); svg.line(xC,yL,xC,rt);
    }
  }

  /* MV incomers */
  for(const m of mvs){
    svg.begin(m.id,m.type);
    const kids=childrenOf(items,order,m.id);
    const below=kids.filter(k=>k.id in depth).map(k=>dy(k));
    const yTop=Y_MV_TOP+(below.length?Math.min(...below):0);
    svg.line(m.x-11,yTop,m.x+11,yTop,3);
    const lbl=[m.id,m.desc,m.voltage];
    let ty=yTop-Y_MV_TOP+Y_LABEL-16;
    lbl.forEach((s,i)=>{ svg.text(m.x,ty,s,{size:11.5,bold:i===0}); ty+=14; });
    for(const k of kids){
      if(k.type===RMU) svg.line(m.x,yTop,m.x,yRmu(k)[0]);
      else if(k.type===MV_BUSBAR){
        svg.drop(m.x,yTop,yBus(k),protFor(k,m.id)[1]||"cb");
        svg.dot(m.x,yBus(k));
      }
    }
    /* Transformers fed straight from the utility, with no MV gear between:
       one drop each, split from the incomer when they differ.
       The transformer's own Protection is drawn on this run when it names a
       device. It used to be a plain conductor whatever the row said, so a
       transformer hung on an incomer was the one supply whose Protection the
       drawing threw away — written, read by the model, and never drawn. An
       empty cell still draws a bare conductor: there is no board here to make
       a way of, so nothing invents a device the surveyor did not ask for. */
    const direct=kids.filter(k=>k.type===TRANSFORMER && k.x!==null);
    const run=(x,y0,y1,t)=>{ const kind=protFor(t,m.id)[1];
      if(kind) svg.drop(x,y0,y1,kind); else svg.line(x,y0,x,y1); };
    if(direct.length===1 && Math.abs(direct[0].x-m.x)<1)
      run(m.x,yTop,Y_TX_C1-TX_R,direct[0]);
    else if(direct.length){
      const ySplit=yTop+40;
      svg.line(m.x,yTop,m.x,ySplit);
      const xs=direct.map(t=>t.x).concat([m.x]);
      svg.line(Math.min(...xs),ySplit,Math.max(...xs),ySplit);
      for(const t of direct){ svg.dot(t.x,ySplit); run(t.x,ySplit,Y_TX_C1-TX_R,t); }
    }
    svg.end();
  }

  /* MV switchboards */
  for(const mvb of mvbs){
    const yb=yBus(mvb);
    svg.begin(mvb.id,mvb.type);
    svg.line(mvb.xLeft,yb,mvb.xRight,yb,5.5);
    svg.end();
    const [praw,pkind]=protFor(mvb);
    const zone=(praw && !pkind)?(" · "+praw):"";  /* e.g. 87B differential */
    barLabels.push([mvb.xLeft,mvb.xRight,yb-12,
      [mvb.id,mvb.desc,mvb.rating,mvb.voltage].filter(Boolean).join(" ")+zone]);
  }

  /* feeds from an MV board down to a sub-board or an RMU */
  const mvFeeds=[];
  for(const oid of order){
    const it=items[oid];
    if(![MV_BUSBAR,RMU].includes(it.type) || it.x===null) continue;
    for(const p of it.parents){
      const par=items[p];
      /* from a board's bar, or out of the bottom of an RMU that feeds a
         board (the way itself is drawn inside the enclosure) */
      const fromBar=par.type===MV_BUSBAR;
      if(!fromBar && !(par.type===RMU && it.type===MV_BUSBAR)) continue;
      if(par.x===null) continue;
      const yFrom=fromBar?yBus(par):yRmu(par)[1];
      const yTo=(it.type===MV_BUSBAR)?yBus(it):yRmu(it)[0];
      let xTo=(par.id in it.land)?it.land[par.id]:it.x;
      if(it.type===MV_BUSBAR) xTo=Math.min(Math.max(xTo,it.xLeft+20),it.xRight-20);
      const xFrom=fromBar?Math.min(Math.max(xTo,par.xLeft),par.xRight)
                         :((it.id in par.tee)?par.tee[it.id]:it.x);
      mvFeeds.push([it,par,xFrom,xTo,yFrom,yTo]);
    }
  }
  const mvLane={};
  for(const band of new Set(mvFeeds.map(f=>f[4]+"|"+f[5]))){
    const [yFrom,yTo]=band.split("|").map(Number);
    const runs=mvFeeds.filter(([it,par,xFrom,xTo,yf,yt])=>yf===yFrom && yt===yTo
                                && Math.abs(xFrom-xTo)>=1)
      .map(([it,par,xFrom,xTo])=>[it.id+"|"+par.id,xFrom,xTo]);
    Object.assign(mvLane,allocLanes(runs,[yTo-30,yTo-43,yTo-56]));
  }
  for(const [it,par,xFrom,xTo,yFrom,yTo] of mvFeeds){
    const fromBar=par.type===MV_BUSBAR;
    const kind=(it.type===RMU)?"cb":(protFor(it,par.id)[1]||"cb");
    if(fromBar) svg.dot(xFrom,yFrom);
    /* the device sits on the way off a bar; an RMU has already drawn its
       own way out inside the enclosure, so this run is bare cable */
    const leave=(x,y0,y1)=>fromBar?svg.drop(x,y0,y1,kind):svg.line(x,y0,x,y1);
    if(Math.abs(xFrom-xTo)<1){
      leave(xTo,yFrom,yTo);
    } else {                        /* sub-board offset from the way */
      const yMid=mvLane[it.id+"|"+par.id];
      leave(xFrom,yFrom,yMid);
      svg.line(xFrom,yMid,xTo,yMid);
      svg.line(xTo,yMid,xTo,yTo);
    }
    if(it.type===MV_BUSBAR) svg.dot(xTo,yTo);
  }

  /* LV supply routes: a board fed from several transformers gets one
     landing point per supply, and every sideways run its own lane, so
     cross-feeds between different MV boards never sit on one line */
  const ytopTx=Y_TX_C2+TX_R, routes={}, elbows=[];
  for(const tx of txs){
    if(tx.x===null) continue;
    for(const bb of childrenOf(items,order,tx.id,[LV_BUSBAR])){
      const sup=bb.parents.map(p=>items[p])
        .filter(p=>p.type===TRANSFORMER && p.x!==null);
      if(sup.length<2) continue;      /* single supply: handled below */
      sup.sort((a,b)=>a.x-b.x);
      const i=sup.map(t=>t.id).indexOf(tx.id);
      const w=bb.xRight-bb.xLeft;
      const xLand=bb.xLeft+w*(i+0.5)/sup.length;
      routes[tx.id+"|"+bb.id]=[xLand,null];
      if(Math.abs(xLand-tx.x)>1) elbows.push([tx.id+"|"+bb.id,tx.x,xLand]);
    }
  }
  /* every other run between the transformer row and the LV bar joins the
     same allocation: LV-fed step-ups, and board-fed transformers with no
     output entered */
  const suLand={};
  for(const txId of Object.keys(lvsubMid)){
    const tx=items[txId], src=lvsubMid[txId][0];
    if(tx.x===null || src.xLeft===null) continue;
    const xLand=Math.min(Math.max(tx.x,src.xLeft+25),src.xRight-25);
    suLand[txId]=xLand;
    if(Math.abs(xLand-tx.x)>=1) elbows.push(["su|"+txId,tx.x,xLand]);
  }
  const highRuns=[];
  /* each board-fed transformer lands on its own point of the bar: the
     farthest one on the outer point, nearer ones further in, so no lane
     crosses another transformer's feed */
  const pairs=[];
  for(const tx of txs){
    if(tx.x===null || (tx.id in sus) || (tx.id in lvsubMid) || ltx.has(tx.id)
       || genBelow(items,order,tx) || boardTx(items,tx)) continue;
    for(const p of tx.parents){
      const par=items[p];
      if(par.type===LV_BUSBAR && par.xLeft!==null) pairs.push([tx,par]);
    }
  }
  const landX={};
  for(const [tx,par] of pairs){
    const right=tx.x>par.x;
    const group=pairs.filter(([t,q])=>q===par && (t.x>par.x)===right).map(([t])=>t)
      .sort((a,b)=>right?b.x-a.x:a.x-b.x);
    const k=group.findIndex(t=>t.id===tx.id);
    landX[tx.id+"|"+par.id]=right?par.xRight-25-40*k:par.xLeft+25+40*k;
  }
  for(const [tx,par] of pairs){
    const fedLv=childrenOf(items,order,tx.id,[LV_BUSBAR]);
    const xLand=landX[tx.id+"|"+par.id];
    if(fedLv.length) highRuns.push(["lvlv|"+tx.id+"|"+par.id,xLand,tx.x]);
    else elbows.push(["lvsrc|"+tx.id+"|"+par.id,tx.x,xLand]);
  }
  /* motors and MCCs hung under a transformer that feeds no board: a
     straight drop when alone, otherwise a split bar under the secondary */
  const loadTop={};
  for(const tx of txs){
    if(tx.x===null || boardTx(items,tx)) continue;
    const loads=txLoads(items,order,tx).filter(k=>k.x!==null);
    for(const k of loads) loadTop[k.id]=loads.length===1?ytopTx:ytopTx+32;
  }
  const lowLane=allocLanes(elbows,[ytopTx+14,ytopTx+23,ytopTx+32]);
  for(const key of Object.keys(lowLane)) if(key in routes) routes[key][1]=lowLane[key];
  const cTop=Y_TX_C1-TX_R;
  const highLane=allocLanes(highRuns,[cTop-22,cTop-34,cTop-88,cTop-100]);

  /* pumps */
  for(const p of pumps){
    if(p.x===null) continue;
    svg.begin(p.id,p.type);
    /* an MV motor sits in the transformer row; a motor fed from an LV
       board or its own transformer hangs in the feeder band below it */
    const lvPar=p.parents.map(q=>items[q])
      .filter(o=>[LV_BUSBAR,TRANSFORMER,MCC,FEEDER].includes(o.type));
    if(lvPar.length && lvPar[0].type===TRANSFORMER && txBoard(items,lvPar[0]))
      lvPar[0]=txBoard(items,lvPar[0]);       /* a way of that board */
    /* hung on a feeder: the motor sits in the row of the board that way leaves */
    const onWay=lvPar.length?carriedBy(lvPar[0]):null;
    if(onWay) lvPar[0]=onWay.board;
    /* a way does not move a motor to another row: one carried by a way out of
       an MV board is an MV motor, in the transformer row, exactly as it would
       be named on the bar itself */
    const mvMotor=!lvPar.length || [MV_BUSBAR,RMU].includes(lvPar[0].type);
    let yc=mvMotor?Y_PUMP:Y_ARROW-14; const r=mvMotor?PUMP_R:14;
    if(lvPar.length && [LV_BUSBAR,MCC].includes(lvPar[0].type)) yc=lvY(lvPar[0])+88-14+(onWay?onWay.drop:0);
    else if(lvPar.length && boardTx(items,lvPar[0])) yc=lvY(items[lvPar[0].parents[0]])+190;
    const vsd=stateWords(p).has("vsd"), soft=!vsd && stateWords(p).has("softstart");   /* a drive supersedes a soft starter */
    for(const q of p.parents){
      let par=items[q];
      const pid=par.id;                 /* the protection entry is the row's */
      if(par.type===TRANSFORMER && txBoard(items,par)) par=txBoard(items,par);
      if(par.type===MV_BUSBAR){         /* named on the transformer, wired to its board's bar */
        svg.drop(p.x,yBus(par),Y_PUMP-PUMP_R,protFor(p,pid)[1]||"cb");
        svg.dot(p.x,yBus(par));
      } else if(par.type===RMU){  /* way device is inside the enclosure */
        svg.line(p.x,yRmu(par)[1],p.x,Y_PUMP-PUMP_R);
      } else if(par.type===LV_BUSBAR||par.type===MCC){
        /* LV motor off the board, or a starter in an MCC */
        const yb=lvY(par);
        svg.dot(p.x,yb);
        svg.drop(p.x,yb,yc-r,protFor(p,pid)[1]||(par.type===MCC?"contactor":"cb"),yb+30);
      } else if(par.type===FEEDER){
        /* the way out of the board carries this motor: one run, starting at
           the foot of the way's own device — the way drew that device, and
           the dot on the bar, in its own row */
        const c=carriedBy(par);
        if(c) svg.drop(p.x,c.y+c.drop,yc-r,
          protFor(p,pid)[1]||([MV_BUSBAR,RMU].includes(c.board.type)?"cb":"contactor"),
          c.y+c.drop+30);
      } else if(par.type===TRANSFORMER){     /* motor on its own transformer */
        if(boardTx(items,par)){              /* under its board's row */
          const yT=lvY(items[par.parents[0]])+70+27+TX_R;
          svg.drop(p.x,yT,yc-r,protFor(p,pid)[1]||"cb",yT+30);
        } else svg.drop(p.x,(p.id in loadTop)?loadTop[p.id]:Y_TX_C2+TX_R,yc-r,protFor(p,pid)[1]||"cb");
      }
    }
    if(vsd) svg.vsd(p.x,yc-r-14);           /* drive box on the drop */
    else if(soft) svg.softStart(p.x,yc-r-14); /* soft starter box, same place */
    svg.circle(p.x,yc,r,2.2);
    svg.text(p.x,yc+1,"M",{size:r>13?13:11,bold:true});
    svg.text(p.x,r>13?yc+13:yc+11,"3~",{size:8.5});
    /* an MV motor labels to the right when the next way leaves room;
       otherwise (and always for LV motors) the label runs downward */
    const lines=[p.id,p.desc,p.rating].filter(Boolean);
    const need=r+10+Math.max(0,...lines.map(t=>t.length))*5.8+14;
    let room=1e9;
    if(!lvPar.length){
      const nxt=order.map(o=>items[o]).filter(o=>o!==p && o.x!==null && o.x>p.x
        && [TRANSFORMER,GENERATOR,PUMP,MV_BUSBAR].includes(o.type))
        .map(o=>o.x)
        .concat(mvbs.filter(b=>b.xLeft!==null && b.xLeft>p.x).map(b=>b.xLeft));
      room=nxt.length?Math.min(...nxt)-p.x:1e9;
    }
    if(!lvPar.length && room>=need){
      let ty=yc-6;
      for(const t of lines){ svg.text(p.x+r+10,ty,t,{size:11,anchor:"start"}); ty+=14; }
    } else {
      svg.text(p.x+4,yc+r+14,lines.join(" · "),{size:11,anchor:"start",rotate:90});
    }
    svg.end();
  }

  /* generation sources feeding an LV board directly */
  const suSrcIds=Object.values(sus).filter(Boolean).map(o=>o.id);
  for(const g of order.map(i=>items[i]).filter(o=>o.type===GENERATOR)){
    const suKids=order.filter(i=>items[i].type===TRANSFORMER)
      .flatMap(i=>childrenOf(items,order,i,[GENERATOR]).map(k=>k.id));
    if(g.x===null || suSrcIds.includes(g.id) || suKids.includes(g.id) || (g.id in gens)) continue;
    svg.begin(g.id,g.type);
    const fed=genFeeds(items,order,g).filter(([b])=>b.type===LV_BUSBAR && b.xLeft!==null);
    /* the circle stands over the (first) board it supplies */
    const yg=fed.length?lvY(fed[0][0])-(Y_BUS-Y_TX_C1):Y_TX_C1;
    svg.genMark(g.x,yg+13,20,g.variant);
    let ty=yg-6;
    for(const t of [g.id,g.desc,[g.rating,g.voltage].filter(Boolean).join(" ")].filter(Boolean)){
      svg.text(g.x+30,ty,t,{anchor:"start"}); ty+=15;
    }
    for(const [bb,kind,cpl] of fed){
      const yb=lvY(bb);
      svg.drop(g.x,yg+33,yb,kind);
      svg.dot(g.x,yb);
      if(cpl){                      /* the changeover's own row, by its device */
        const ym=(yg+33+yb)/2;
        const [craw,ck]=protFor(cpl);
        const extra=(craw && !ck)?craw:"";
        /* its own group: the changeover is a row of the table like any other,
           and without one it could not be selected, picked up, or seen by the
           checker (constitution §6) */
        svg.begin(cpl.id,cpl.type);
        svg.text(g.x+16,ym-2,[cpl.id,cpl.rating,extra].filter(Boolean).join(" "),{size:11,anchor:"start"});
        svg.text(g.x+16,ym+12,cpl.notes.trim().toLowerCase()===cpl.id.trim().toLowerCase()?"":cpl.notes,{size:10,anchor:"start"});
        svg.end();
      }
    }
    svg.end();
  }

  /* generators standing over MV gear as a supply */
  for(const gid of Object.keys(gens)){
    const g=items[gid], fed=gens[gid];
    if(g.x===null) continue;
    svg.begin(g.id,g.type);
    const b0=fed[0][0];
    const yTo0=(b0.type===MV_BUSBAR)?yBus(b0):yRmu(b0)[0];
    /* on the top tier the column has headroom of its own; lower down it
       fits in the 200 px tier gap, under the bar above */
    const yGen=((depth[b0.id]||0)===0)?Y_GEN:yTo0-(b0.type===MV_BUSBAR?112:82);
    svg.genMark(g.x,yGen,20,g.variant);
    const lbl=[g.id,g.desc,[g.rating,g.voltage].filter(Boolean).join(" ")].filter(Boolean);
    if(b0.type===MV_BUSBAR){        /* stacked above the circle, centred */
      let ty=yGen-28-14*(lbl.length-1);
      lbl.forEach((t,i)=>{ svg.text(g.x,ty,t,{size:11,bold:i===0}); ty+=14; });
    } else {                        /* over an RMU: beside it, under the bar */
      let ty=yGen-12;
      for(const t of lbl){ svg.text(g.x+30,ty,t,{size:11,anchor:"start"}); ty+=14; }
    }
    for(const [b,kind,cpl] of fed){
      if(b.type===MV_BUSBAR){
        const yTo=yBus(b);
        svg.drop(g.x,yGen+20,yTo,kind);
        svg.dot(g.x,yTo);
        if(cpl){
          const ym=(yGen+20+yTo)/2;
          svg.begin(cpl.id,cpl.type);   /* the changeover's own row (constitution §6) */
          svg.text(g.x+16,ym-2,[cpl.id,cpl.rating].filter(Boolean).join(" "),{size:11,anchor:"start"});
          svg.text(g.x+16,ym+12,cpl.notes.trim().toLowerCase()===cpl.id.trim().toLowerCase()?"":cpl.notes,{size:10,anchor:"start"});
          svg.end();
        }
      } else svg.line(g.x,yGen+20,g.x,yRmu(b)[0]);   /* the RMU draws its way in */
    }
    svg.end();
  }

  /* transformers between two MV tiers */
  for(const [u,tx,l] of links){
    if(tx.x===null) continue;
    svg.begin(tx.id,tx.type);
    const yU=(u.type===MV_BUSBAR)?yBus(u):yRmu(u)[1];
    const yL=(l.type===MV_BUSBAR)?yBus(l):yRmu(l)[0];
    const c1=Math.floor((yU+yL)/2)-13;   /* integer: both engines round alike */
    svg.transformer(tx.x,[tx.id,tx.desc,[tx.rating,tx.voltage].filter(Boolean).join(" ")].filter(Boolean),"right",c1);
    const kindU=(tx.parents.includes(u.id)?protFor(tx,u.id)[1]:protFor(u,tx.id)[1])||"cb";
    if(u.type===MV_BUSBAR){
      if(Math.abs(tx.x-l.x)<1 || (u.xLeft<=tx.x && tx.x<=u.xRight)){
        svg.drop(tx.x,yU,c1-TX_R,kindU); svg.dot(tx.x,yU);
      } else {                      /* a second link: dog-leg off the bar */
        const xFrom=Math.min(Math.max(tx.x,u.xLeft+20),u.xRight-20);
        const yLane=yU+40;
        svg.drop(xFrom,yU,yLane,kindU); svg.dot(xFrom,yU);
        svg.line(xFrom,yLane,tx.x,yLane); svg.line(tx.x,yLane,tx.x,c1-TX_R);
      }
    } else svg.line(tx.x,yU,tx.x,c1-TX_R);   /* the RMU drew its tee-off */
    const kindL=(l.parents.includes(tx.id)?protFor(l,tx.id)[1]:protFor(tx,l.id)[1])||"cb";
    if(l.type===MV_BUSBAR){ svg.drop(tx.x,c1+27+TX_R,yL,kindL); svg.dot(tx.x,yL); }
    else svg.line(tx.x,c1+27+TX_R,tx.x,yL);      /* the RMU draws its way in */
    svg.end();
  }

  /* step-up columns: source -> transformer -> MV busbar / RMU */
  for(const txId of Object.keys(sus)){
    const tx=items[txId], src=sus[txId];
    if(tx.x===null) continue;
    svg.begin(tx.id,tx.type);
    const fed0=childrenOf(items,order,txId,[MV_BUSBAR,RMU]);
    const off=fed0.length?Math.min(...fed0.map(f=>dy(f))):0;
    const yGen=Y_GEN+off, yC1=Y_SU_C1+off, yC2=Y_SU_C2+off;
    let ySrcBot=yGen;
    if(src) svg.begin(src.id,src.type);
    if(src && src.type===GENERATOR){
      svg.genMark(tx.x,yGen,20,src.variant);
      let ty=yGen-26;
      for(const t of [src.id,src.desc,[src.rating,src.voltage].filter(Boolean).join(" ")].filter(Boolean)){
        svg.text(tx.x+30,ty,t,{size:11,anchor:"start"}); ty+=14;
      }
      ySrcBot=yGen+20;
    } else if(src && src.type===LV_BUSBAR){
      svg.line(tx.x-60,yGen,tx.x+60,yGen,5.5);
      svg.text(tx.x-60,yGen-12,
        [src.id,src.desc,src.rating,src.voltage].filter(Boolean).join(" "),
        {size:11.5,anchor:"start",bold:true});
    } else if(src){
      svg.line(tx.x-11,yGen,tx.x+11,yGen,3);
      let ty=yGen-40, i=0;
      for(const t of [src.id,src.desc,src.voltage].filter(Boolean)){
        svg.text(tx.x,ty,t,{size:11.5,bold:i===0}); ty+=14; i++;
      }
    }
    if(src) svg.end();
    svg.line(tx.x,ySrcBot,tx.x,yC1-TX_R);
    svg.circle(tx.x,yC1,TX_R,2.2);
    svg.circle(tx.x,yC2,TX_R,2.2);
    let ty=yC1-6;
    for(const t of [tx.id,tx.desc,[tx.rating,tx.voltage].filter(Boolean).join(" ")].filter(Boolean)){
      svg.text(tx.x+TX_R+10,ty,t,{anchor:"start"}); ty+=15;
    }
    for(const fed of childrenOf(items,order,txId,[MV_BUSBAR,RMU])){
      const yTo=fed.type===MV_BUSBAR?yBus(fed):yRmu(fed)[0];
      svg.drop(tx.x,yC2+TX_R,yTo,protFor(fed,txId)[1]||"cb");
      if(fed.type===MV_BUSBAR) svg.dot(tx.x,yTo);
    }
    svg.end();
  }

  /* step-ups from a real LV board: board below, MV gear above */
  const midMap=suMid(items,order);
  for(const txId of Object.keys(midMap)){
    const tx=items[txId], src=midMap[txId][0], up=midMap[txId][1];
    if(tx.x===null) continue;
    svg.begin(tx.id,tx.type);
    svg.circle(tx.x,Y_TX_C1,TX_R,2.2);
    svg.circle(tx.x,Y_TX_C2,TX_R,2.2);
    let ty=Y_TX_C1-6;
    for(const t of [tx.id,tx.desc,[tx.rating,tx.voltage].filter(Boolean).join(" ")].filter(Boolean)){
      svg.text(tx.x+TX_R+10,ty,t,{anchor:"start"}); ty+=15;
    }
    const kind=protFor(tx,src.id)[1]||"cb";
    const xLand=(txId in suLand)?suLand[txId]:tx.x;
    if(Math.abs(xLand-tx.x)<1){
      svg.drop(tx.x,Y_TX_C2+TX_R,Y_BUS,kind);
    } else {                        /* the device is the board's, by the bar */
      const yLane=lowLane["su|"+txId];
      svg.line(tx.x,Y_TX_C2+TX_R,tx.x,yLane);
      svg.line(tx.x,yLane,xLand,yLane);
      svg.drop(xLand,yLane,Y_BUS,kind);
    }
    svg.dot(xLand,Y_BUS);
    if(up.type===MV_BUSBAR){
      svg.drop(tx.x,yBus(up),Y_TX_C1-TX_R,protFor(up,tx.id)[1]||"cb");
      svg.dot(tx.x,yBus(up));
    } else {
      svg.line(tx.x,yRmu(up)[1],tx.x,Y_TX_C1-TX_R);
    }
    svg.end();
  }

  /* reversed step-ups: board on top, source below */
  for(const tx of order.map(i=>items[i])
                       .filter(o=>genBelow(items,order,o))){
    if(tx.x===null) continue;
    svg.begin(tx.id,tx.type);
    for(const f of tx.parents.map(p=>items[p])
                     .filter(p=>[MV_BUSBAR,RMU].includes(p.type))){
      const yFrom=f.type===MV_BUSBAR?yBus(f):yRmu(f)[1];
      svg.drop(tx.x,yFrom,Y_TX_C1-TX_R,protFor(tx,f.id)[1]||"cb");
      if(f.type===MV_BUSBAR) svg.dot(tx.x,yFrom);
    }
    svg.circle(tx.x,Y_TX_C1,TX_R,2.2);
    svg.circle(tx.x,Y_TX_C2,TX_R,2.2);
    let ty=Y_TX_C1-6;
    for(const t of [tx.id,tx.desc,[tx.rating,tx.voltage].filter(Boolean).join(" ")].filter(Boolean)){
      svg.text(tx.x+TX_R+10,ty,t,{anchor:"start"}); ty+=15;
    }
    const kids=childrenOf(items,order,tx.id,[GENERATOR,LV_BUSBAR,MV_INCOMER]);
    const src=kids.length?kids[0]:null;
    if(!src){ svg.end(); continue; }
    const ySrc=Y_BUS;
    svg.begin(src.id,src.type);
    if(src.type===GENERATOR){
      svg.line(tx.x,Y_TX_C2+TX_R,tx.x,ySrc-20);
      svg.genMark(tx.x,ySrc,20,src.variant);
      let t2=ySrc-6;
      for(const t of [src.id,src.desc,[src.rating,src.voltage].filter(Boolean).join(" ")].filter(Boolean)){
        svg.text(tx.x+30,t2,t,{size:11,anchor:"start"}); t2+=14;
      }
    } else if(src.type===LV_BUSBAR){
      svg.line(tx.x,Y_TX_C2+TX_R,tx.x,ySrc); svg.dot(tx.x,ySrc);
    } else {
      svg.line(tx.x,Y_TX_C2+TX_R,tx.x,ySrc);
      svg.line(tx.x-11,ySrc,tx.x+11,ySrc,3);
      let t2=ySrc+18, i=0;
      for(const t of [src.id,src.desc,src.voltage].filter(Boolean)){
        svg.text(tx.x,t2,t,{size:11.5,bold:i===0}); t2+=14; i++;
      }
    }
    svg.end(); svg.end();
  }

  /* transformers */
  for(const tx of txs){
    if(tx.x===null || (tx.id in sus) || (tx.id in lvsubMid) || ltx.has(tx.id)
       || genBelow(items,order,tx) || boardTx(items,tx)) continue;   /* drawn as its own column */
    svg.begin(tx.id,tx.type);
    const fed=childrenOf(items,order,tx.id,[LV_BUSBAR]);
    /* transformers sharing a board label away from each other */
    let side=fed.some(bb=>bb.parents.length>1 && tx.x<bb.x)?"left":"right";
    if(order.some(i=>items[i].type===GENERATOR && items[i].x!==null
                     && items[i].x-tx.x>0 && items[i].x-tx.x<120))
      side="left";                  /* a generator stands to its right */
    svg.transformer(tx.x,[tx.id,tx.desc,[tx.rating,tx.voltage].filter(Boolean).join(" ")].filter(Boolean),side,undefined,tx.variant);
    for(const q of tx.parents){
      const par=items[q];
      if(par.type===RMU) svg.line(tx.x,yRmu(par)[1],tx.x,Y_TX_C1-TX_R);
      else if(par.type===MV_BUSBAR){
        svg.drop(tx.x,yBus(par),Y_TX_C1-TX_R,protFor(tx,par.id)[1]||"cb");
        svg.dot(tx.x,yBus(par));
      }
      else if(par.type===FEEDER){
        /* carried by a way out of a board: the way drew the bar dot and its
           own device, and this run starts at the foot of it. The transformer
           still draws the device its own row names — two cells, two devices,
           the same rule as everywhere else. */
        const c=carriedBy(par);
        if(c) svg.drop(tx.x,c.y+c.drop,Y_TX_C1-TX_R,protFor(tx,par.id)[1]||"cb");
      }
      else if(par.type===LV_BUSBAR && par.xLeft!==null){
        /* supply comes back up from an LV board on the same row */
        const kind=protFor(tx,par.id)[1]||"cb";
        const xLand=landX[tx.id+"|"+par.id];
        if(fed.length){         /* LV/LV: supply in at the top */
          const yLane=highLane["lvlv|"+tx.id+"|"+par.id];
          svg.drop(xLand,yLane,Y_BUS,kind);
          svg.line(xLand,yLane,tx.x,yLane);
          svg.line(tx.x,yLane,tx.x,Y_TX_C1-TX_R);
        } else {                /* source below: the device is the board's */
          const yLane=lowLane["lvsrc|"+tx.id+"|"+par.id];
          svg.line(tx.x,Y_TX_C2+TX_R,tx.x,yLane);
          svg.line(tx.x,yLane,xLand,yLane);
          svg.drop(xLand,yLane,Y_BUS,kind);
        }
        svg.dot(xLand,Y_BUS);
      }
    }
    /* a way counts as a supply only when it resolved to a board that was
       placed: a way the drawing could not follow leaves the open end, because
       the note is then the truth */
    if(!tx.parents.some(p=>([RMU,MV_BUSBAR,LV_BUSBAR,MV_INCOMER].includes(items[p].type) && items[p].x!==null)
                           || (items[p].type===FEEDER && carriedBy(items[p]))))
      svg.openEnd(tx.x,Y_TX_C1-TX_R,Y_TX_C1-TX_R-36,"supply not defined");
    if(earthBelow(items,tx)){       /* earthing transformer / NER */
      svg.line(tx.x,Y_TX_C2+TX_R,tx.x,Y_TX_C2+TX_R+10);
      svg.resistor(tx.x,Y_TX_C2+TX_R+10);
    }
    else if(!fed.length && !childrenOf(items,order,tx.id,[PUMP,MCC,GENERATOR]).length)
      /* the open side is whichever one the supply did not take */
      svg.openEnd(tx.x,
        ...(tx.parents.some(p=>items[p].type===LV_BUSBAR)
            ? [Y_TX_C1-TX_R, Y_TX_C1-TX_R-36] : [Y_TX_C2+TX_R, Y_TX_C2+TX_R+36]),
        "outgoing not defined");
    const ytop=ytopTx;
    const dualFed=fed.filter(bb=>routes[tx.id+"|"+bb.id]);
    const rest=fed.filter(bb=>!routes[tx.id+"|"+bb.id]);
    for(const bb of dualFed){
      /* a board with several incomers: each supply drops at its own
         landing point, sideways runs on their own lanes */
      const kind=protFor(bb,tx.id)[1]||"cb";
      const [xLand,yLane]=routes[tx.id+"|"+bb.id];
      if(yLane===null){
        svg.drop(tx.x,ytop,Y_BUS,kind);
      } else {
        svg.line(tx.x,ytop,tx.x,yLane);
        svg.line(tx.x,yLane,xLand,yLane);
        svg.drop(xLand,yLane,Y_BUS,kind);
      }
      svg.dot(xLand,Y_BUS);
    }
    if(rest.length===1 && Math.abs(rest[0].x-tx.x)<1){
      svg.drop(tx.x,ytop,Y_BUS,protFor(rest[0],tx.id)[1]||"cb");
      svg.dot(tx.x,Y_BUS);
    } else if(rest.length){
      const ysplit=ytop+32;
      svg.line(tx.x,ytop,tx.x,ysplit);
      const xs=rest.map(b=>b.x).concat([tx.x]);
      svg.line(Math.min(...xs),ysplit,Math.max(...xs),ysplit);
      for(const bb of rest){
        svg.dot(bb.x,ysplit);
        svg.drop(bb.x,ysplit,Y_BUS,protFor(bb,tx.id)[1]||"cb");
        svg.dot(bb.x,Y_BUS);
      }
    }
    /* motors / MCCs hung under a transformer with no board: several of
       them share a split bar under the secondary */
    const hung=txLoads(items,order,tx).filter(k=>k.x!==null);
    if(hung.some(k=>Math.abs(k.x-tx.x)>1)){
      const ysplit=ytop+32;
      svg.line(tx.x,ytop,tx.x,ysplit);
      const xs=hung.map(k=>k.x).concat([tx.x]);
      svg.line(Math.min(...xs),ysplit,Math.max(...xs),ysplit);
      for(const k of hung) svg.dot(k.x,ysplit);
    }
    svg.end();
  }

  /* LV busbars */
  for(const bb of busbars){
    if(bb.xLeft===null) continue;
    const yb=lvY(bb);
    svg.begin(bb.id,bb.type);
    svg.line(bb.xLeft,yb,bb.xRight,yb,5.5,bb.variant==="dc"?"14 6":null);   /* a DC bar is dashed */
    svg.end();
    const [praw,pkind]=protFor(bb);
    const zone=(praw && !pkind)?(" · "+praw):"";  /* e.g. 87B differential */
    barLabels.push([bb.xLeft,bb.xRight,yb-12,barLabel(bb)+zone]);
  }

  /* sub-boards: fed from a feeder or straight from the board above */
  const twoDevices=(x,y0,y1,k0,k1,dash,o0,o1)=>{
    /* the outgoing device by the upper bar when the feeder names one, and the
       incoming device by the lower bar when the fed board names one — a real
       main-board way and a real sub-board incomer are two breakers, and both
       are drawn; neither is invented when its cell is empty.
       Each half is drawn inside its own row's group, so the way's breaker
       answers for the way and the incomer for the board it feeds — the same
       attribution every other symbol on the sheet has. */
    let yFrom=y0;
    if(k0){
      svg.begin(o0.id,o0.type);
      const g0=svg.device(k0,x,y0+30);
      svg.line(x,y0,x,y0+30-g0,2,dash||null);
      svg.end();
      yFrom=y0+30+g0;
    }
    svg.begin(o1.id,o1.type);
    if(k1){
      const g1=svg.device(k1,x,y1-30);
      svg.line(x,yFrom,x,y1-30-g1,2,dash||null);
      svg.line(x,y1-30+g1,x,y1,2,dash||null);
    } else svg.line(x,yFrom,x,y1,2,dash||null);
    svg.end();
  };
  const splitDone=new Set();
  for(const bb of busbars){
    if(!isSubBoard(items,bb) || bb.x===null) continue;
    const ySub=lvY(bb);
    /* several feeders into one board: one landing point each */
    const fsup=bb.parents.filter(p=>items[p] && items[p].type===FEEDER && items[p].x!==null);
    for(const p of bb.parents){
      const par=items[p];
      if(!par || par.x===null) continue;
      if(par.type===LV_BUSBAR){
        const yPar=lvY(par);
        svg.begin(bb.id,bb.type); svg.dot(bb.x,yPar); svg.end();
        twoDevices(bb.x,yPar,ySub,protFor(bb,p)[1]||"cb",null,null,bb,bb);
        svg.begin(bb.id,bb.type); svg.dot(bb.x,ySub); svg.end();
      } else if(par.type===FEEDER){
        const pb=par.parents.map(q=>items[q]).find(o=>o && o.type===LV_BUSBAR);
        if(!pb) continue;
        const yPar=lvY(pb);
        const dash=stateWords(par).has("spare")?"5 4":null;
        /* the same rule as the feeders loop: a filled cell draws, an empty
           one does not, whether or not the engine knew the word */
        const [k0raw,k0kind]=protFor(par,pb.id);
        const k0=k0kind||(k0raw.trim()?"cb":null), k1=protFor(bb,p)[1];
        svg.begin(par.id,par.type); svg.dot(par.x,yPar); svg.end();
        const i=fsup.indexOf(p), n=fsup.length;
        const xTo=n===1?bb.x:bb.xLeft+(bb.xRight-bb.xLeft)*(i+0.5)/n;
        if(Math.abs(par.x-xTo)<1) twoDevices(par.x,yPar,ySub,k0,k1,dash,par,bb);
        else {            /* several boards under one feeder, or feeders into one */
          const ySplit=ySub-60-12*i;
          if(!splitDone.has(p)){
            splitDone.add(p);
            svg.begin(par.id,par.type);
            if(k0){
              const g0=svg.device(k0,par.x,yPar+30);
              svg.line(par.x,yPar,par.x,yPar+30-g0,2,dash);
              svg.line(par.x,yPar+30+g0,par.x,ySplit,2,dash);
            } else svg.line(par.x,yPar,par.x,ySplit,2,dash);
            svg.end();
          }
          svg.begin(bb.id,bb.type);
          svg.line(par.x,ySplit,xTo,ySplit,2,dash);
          if(k1){
            const g1=svg.device(k1,xTo,ySub-30);
            svg.line(xTo,ySplit,xTo,ySub-30-g1);
            svg.line(xTo,ySub-30+g1,xTo,ySub);
          } else svg.line(xTo,ySplit,xTo,ySub);
          svg.end();
        }
        svg.begin(bb.id,bb.type); svg.dot(xTo,ySub); svg.end();
      }
    }
  }

  /* bus couplers / ties. What a coupler ties is the rule's judgement, asked
     once (constitution §5); the messages come from there too. A coupler that
     cannot be drawn as a tie is not skipped — it draws from the end it has,
     the other open, so the row is on the sheet and can be picked up and
     re-wired like any other (constitution §6). */
  const stubsOn={};
  for(const bc of couplers){
    const k=couplerOf(items,bc);
    /* a changeover is drawn in its own group beside its generator — unless it
       has no board to change over, and so no generator column to sit in */
    if(k.kind==="changeover" && k.valid) continue;
    const [craw,ckind]=protFor(bc);
    const dev=ckind||"cb";
    const cx=(craw && !ckind)?craw:"";
    const lbl=[bc.id,bc.rating,cx].filter(Boolean).join(" ");
    const ends=[k.a,k.b].filter(Boolean).map(id=>items[id]).filter(o=>o.xLeft!==null);
    if(ends.length!==2){
      const on=ends[0]?ends[0].id:"";      /* stack the stubs that share an end */
      const n=stubsOn[on]||0; stubsOn[on]=n+1;
      couplerStub(svg,bc,ends[0]||null,dev,lbl,n,yBus,lvY);
      continue;
    }
    const [a,b]=ends.slice().sort((u,v)=>u.x-v.x);
    const ya=a.type===MV_BUSBAR?yBus(a):lvY(a);
    const yb=b.type===MV_BUSBAR?yBus(b):lvY(b);
    svg.begin(bc.id,bc.type);

    if(Math.abs(ya-yb)>1){
      /* boards on different levels: the link runs in the gap beside them,
         clear of any neighbour's bar on either row */
      const rows=busbars.concat(mvbs).filter(o=>o!==a&&o!==b&&o.xLeft!==null
        && Math.min(...[ya,yb].map(y=>Math.abs((o.type===MV_BUSBAR?yBus(o):lvY(o))-y)))<1);
      const blocked=(x0,x1)=>rows.some(o=>o.xLeft-8<=Math.max(x0,x1) && o.xRight+8>=Math.min(x0,x1));
      let xLink=Math.max(a.xRight,b.xRight)+15, right=true;
      if(blocked(Math.min(a.xRight,b.xRight),xLink)){
        const alt=Math.min(a.xLeft,b.xLeft)-15;
        if(!blocked(alt,Math.max(a.xLeft,b.xLeft))){ xLink=alt; right=false; }
      }
      const xa=right?a.xRight:a.xLeft, xb=right?b.xRight:b.xLeft;
      svg.dot(xa,ya);
      svg.line(xa,ya,xLink,ya,2);
      svg.drop(xLink,Math.min(ya,yb),Math.max(ya,yb),dev);
      svg.line(xLink,yb,xb,yb,2);
      svg.dot(xb,yb);
      const ym=(ya+yb)/2;
      if(right){
        svg.text(xLink+10,ym,lbl,{size:11,anchor:"start"});
        svg.text(xLink+10,ym+14,bc.notes,{size:10,anchor:"start"});
      } else {
        svg.text(xLink-10,ym,lbl,{size:11,anchor:"end"});
        svg.text(xLink-10,ym+14,bc.notes,{size:10,anchor:"end"});
      }
      svg.end();
      continue;
    }
    const blocking=busbars.concat(mvbs).filter(o=>o!==a&&o!==b&&o.xLeft!==null
      && a.xRight<o.x && o.x<b.xLeft
      && Math.abs((o.type===MV_BUSBAR?yBus(o):lvY(o))-ya)<1);
    const xm=(a.xRight+b.xLeft)/2;
    if(blocking.length){
      /* another board lies between: run the tie above the bar row, its
         device at this end, in the gap before the next board, clear of
         that board's incomer */
      const yLane=ya-30, xd=a.xRight+20;
      svg.dot(a.xRight,ya);
      svg.line(a.xRight,ya,a.xRight,yLane,2);
      const g=svg.deviceH(dev,xd,yLane);
      svg.line(a.xRight,yLane,xd-g,yLane,2);
      svg.line(xd+g,yLane,b.xLeft,yLane,2);
      svg.line(b.xLeft,yLane,b.xLeft,yb,2);
      svg.dot(b.xLeft,yb);
      svg.text(xd,yLane-10,lbl,{size:11});
      svg.text(xd,yLane-24,bc.notes,{size:10});
      svg.end();
      continue;
    }
    const cgap=svg.deviceH(dev,xm,ya);
    svg.line(a.xRight,ya,xm-cgap,ya,2);
    svg.line(xm+cgap,ya,b.xLeft,ya,2);
    svg.text(xm,ya+24,lbl,{size:11});
    svg.text(xm,ya+38,bc.notes,{size:10});
    svg.end();
  }

  /* feeders and MCCs */
  for(const f of feeders){
    if(f.x===null) continue;
    svg.begin(f.id,f.type);
    let par=f.parents.length?items[f.parents[0]]:null;
    const pid=par?par.id:null;
    if(par && par.type===TRANSFORMER && txBoard(items,par)) par=txBoard(items,par);  /* a way of the board it feeds */
    /* hung on a feeder: this row lands on the board the feeder is a way of,
       below the way's own device */
    const onWay=(par && par.type===FEEDER && carriesOn(items,order,par).some(k=>k.id===f.id))
      ? carriedBy(par) : null;
    if(onWay) par=onWay.board;
    /* A feeder names its device or has none. It is the way out of a board —
       a placeholder to hang equipment on — so inventing a breaker for it puts
       two devices in series on a run where the surveyor asked for one. Every
       other type here keeps its usual default.
       What counts is whether the cell was filled in, not whether the engine
       recognised what was written: "Thermal relay" or "RCBO" is a device the
       surveyor asked for, drawn with the default glyph and already reported by
       UNKNOWN_PROT. Only an empty cell means no device. */
    const [praw,pkind]=protFor(f,pid);
    const kind=pkind||((f.type===FEEDER && !praw.trim())?null:"cb");
    const dash=stateWords(f).has("spare")?"5 4":null;
    /* the drop, or a bare conductor when no device was named */
    const runDown=(x,y0,y1,ydev)=>kind?svg.drop(x,y0,y1,kind,ydev,dash):svg.line(x,y0,x,y1,2,dash||null);
    const lbl=[f.id,f.desc,f.rating].filter(Boolean).join(" · ");
    if(par && par.type===TRANSFORMER && TERMINALS.includes(f.type)){
      /* hung on a transformer's secondary: an NER under an earthing
         transformer, a capacitor on its own supply transformer */
      const y0=Y_TX_C2+TX_R;
      svg.drop(f.x,y0,y0+26,kind);
      const h=svg.terminal(f.type,f.x,y0+26);
      svg.text(f.x+4,y0+26+h+12,lbl,{size:11,anchor:"start",rotate:90});
      svg.end();
      continue;
    }
    if(par && [MV_BUSBAR,RMU].includes(par.type)){
      /* an outgoing way of an MV board: arrow in the transformer row */
      const yTip=Y_PUMP;
      const yEnd=(f.type===FEEDER)?yTip-10:(f.type===MCC)?yTip-26:yTip-24;
      /* A way that carries something is not an open end here either: it runs
         from the bar to its own device and hands the rest to what it feeds,
         which is drawn with that row. Without this the arrowhead lands on the
         equipment and the run is drawn twice down the same x. */
      if(f.type===FEEDER && carriesOn(items,order,f).length){
        const c=carriedBy(f);
        if(c){
          if(par.type===MV_BUSBAR) svg.dot(f.x,c.y);
          if(c.kind) svg.drop(f.x,c.y,c.y+c.drop,c.kind,c.y+30,dash);
          svg.text(f.x+8,c.y+(c.drop?30:16),lbl,{size:11,anchor:"start"});
        }
        svg.end();
        continue;
      }
      /* a row that is itself on a way starts at the foot of the way's device */
      const y0=onWay?onWay.y+onWay.drop
             :(par.type===MV_BUSBAR)?yBus(par):yRmu(par)[1];
      if(par.type===MV_BUSBAR && !onWay){
        svg.dot(f.x,y0);
        runDown(f.x,y0,yEnd,undefined);
      } else if(onWay) runDown(f.x,y0,yEnd,undefined);
      else svg.line(f.x,y0,f.x,yEnd,2,dash);  /* device in the enclosure */
      if(f.type===FEEDER){
        svg.arrowDown(f.x,yTip);
        svg.text(f.x+4,yTip+14,lbl,{size:11,anchor:"start",rotate:90});
      } else if(f.type===MCC){
        svg.rect(f.x-14,yTip-26,28,26,2);
        svg.text(f.x,yTip-8,"MCC",{size:8});
        svg.text(f.x+4,yTip+14,lbl,{size:11,anchor:"start",rotate:90});
      } else {
        const h=svg.terminal(f.type,f.x,yTip-24);
        svg.text(f.x+4,yTip-24+h+12,lbl,{size:11,anchor:"start",rotate:90});
      }
      svg.end();
      continue;
    }
    const yb=onWay?onWay.y+onWay.drop
           :(par && (par.type===LV_BUSBAR||par.type===MCC))?lvY(par):Y_BUS;
    let yDev=yb+30; const yArrow=yb+88; let yLbl=yb+106;
    let yFrom=yb;
    if(par && par.type===TRANSFORMER && f.type===MCC){
      /* hung off the transformer's secondary: its incomer device halfway
         down, no bar to land on */
      yFrom=(f.id in loadTop)?loadTop[f.id]:ytopTx;
      yDev=(yFrom+yArrow-26)/2;
    } else if(!onWay) svg.dot(f.x,yb);   /* on a way: the way drew the dot and its own device */
    if(f.type===MCC){
      runDown(f.x,yFrom,yArrow-26,yDev);
      svg.rect(f.x-14,yArrow-26,28,26,2);
      svg.text(f.x,yArrow-8,"MCC",{size:8});
      if(mccLoads(items,order,f).length && f.xLeft!==null){
        /* its own bus on the row below, the motor ways hang off it */
        const yM=lvY(f);
        svg.rect(f.xLeft-10,yDev-18,f.xRight-f.xLeft+20,yM+10-(yDev-18),1.6,"7 5");
        svg.line(f.x,yArrow,f.x,yM);
        svg.line(f.xLeft,yM,f.xRight,yM,5.5);
        barLabels.push([f.xLeft,f.xRight,yM-12,barLabel(f)]);
        svg.end();
        continue;
      }
    } else if(TERMINALS.includes(f.type)){
      runDown(f.x,yb,yArrow-24,yDev);
      const h=svg.terminal(f.type,f.x,yArrow-24);
      yLbl=yArrow-24+h+12;
    } else if(carriesOn(items,order,f).length){
      /* The drop carries on to what the way goes to, so there is no arrow:
         the way is not an open end, and an arrowhead here would land on the
         equipment. A sub-board's run is drawn whole by the sub-board loop
         (both devices, `twoDevices`); anything else hangs from the foot of
         the way's own device, which the way draws here so that it belongs to
         the way's row and not to the equipment's. */
      if(!subBoardsOf(items,order,f).length && kind)
        svg.drop(f.x,yb,yb+HANG,kind,yb+30,dash);
      svg.text(f.x+8,(subBoardsOf(items,order,f).length?yDev:yb)+30,lbl,{size:11,anchor:"start"});
      svg.end();
      continue;
    } else {
      runDown(f.x,yb,yArrow-10,yDev);
      svg.arrowDown(f.x,yArrow);
    }
    svg.text(f.x+4,yLbl,lbl,{size:11,anchor:"start",rotate:90});
    svg.end();
  }

  /* transformers hanging under an LV board (a way feeding a motor) */
  for(const tx of txs){
    if(tx.x===null || !boardTx(items,tx)) continue;
    const par=items[tx.parents[0]];
    if(par.xLeft===null) continue;
    svg.begin(tx.id,tx.type);
    const yb=lvY(par), yC1=yb+70;
    svg.dot(tx.x,yb);
    svg.drop(tx.x,yb,yC1-TX_R,protFor(tx,par.id)[1]||"cb",yb+30);
    svg.transformer(tx.x,txLines(tx),"right",yC1);
    if(!Object.values(items).some(c=>c.parents.includes(tx.id)))
      svg.openEnd(tx.x,yC1+27+TX_R,yC1+27+TX_R+36,"outgoing not defined");
    svg.end();
  }

  /* bar labels: placed now that every conductor is drawn — a label starts
     at the left end of its bar unless a conductor already crosses it there */
  for(const [xLeft,xRight,y,lbl] of barLabels)
    svg.text(labelX(xLeft,xRight,crossingXs(svg,xLeft,xRight,y-11.5,y),lbl),y,lbl,
             {size:11.5,anchor:"start",bold:true});

  /* a long RMU or transformer description runs to the right of the symbol
     it names: the sheet grows so no label leaves the paper */
  width=Math.max(width,svg.maxX+24);

  /* title block (a view option) */
  svg.layer="frame";
  if(VIEW.titleBlock){
    const tbW=288,tbH=96,tbX=width-tbW-24,tbY=DIAG_H-tbH-20;
    svg.rect(tbX,tbY,tbW,tbH,1.5);
    svg.line(tbX,tbY+24,tbX+tbW,tbY+24,1.5);
    svg.text(tbX+10,tbY+17,"SLD SKETCH — SITE SURVEY",{size:12,anchor:"start",bold:true});
    /* the value field runs from the label column to the block's inner edge; a
       longer entry is cut there rather than running off the sheet */
    const fits=Math.floor((tbW-58-10)/LABEL_CHAR);
    let ty=tbY+40;
    for(const [k,v0] of [["Site",info.site],["Date",info.date],["By",info.by],["Notes",info.notes]]){
      const v=v0||"";
      svg.text(tbX+10,ty,k+":",{size:11,anchor:"start",bold:true});
      svg.text(tbX+58,ty,v.length<=fits?v:v.slice(0,fits-1).replace(/\s+$/,"")+"…",
               {size:11,anchor:"start"});
      ty+=16;
    }
  }

  /* legend (a view option) */
  const used=new Set(order.map(i=>items[i].type));
  if(order.some(i=>earthBelow(items,items[i]))) used.add(EARTHING);
  for(const i of order) if(items[i].variant) used.add("variant:"+items[i].variant);
  if(!VIEW.legend){ svg.layer="drawing"; return svg.document(width,DIAG_H); }
  svg.layer="legend";
  drawLegend(svg,used,width);
  svg.layer="drawing";

  const rows=legendRows(width,legendEntries(used).length)[1];
  return svg.document(width,DIAG_H+LEGEND_H+LEGEND_ROW_H*(rows-1));
}

export { LEGEND_H, LEGEND_CELL, LEGEND_ROW_H, legendRows, drawLegend, render };
