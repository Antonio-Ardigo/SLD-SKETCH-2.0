import { MV_INCOMER, RMU, MV_BUSBAR, TRANSFORMER, PUMP, GENERATOR, LV_BUSBAR, FEEDER, MCC, BUS_COUPLER, CAPACITOR, EARTHING, ARRESTER, TERMINALS, protFor } from "./types.js";
import { childrenOf } from "./model.js";
import { mccLoads, subBoardsOf, isSubBoard, boardTx, txBoard, lvBoardWidth, placeLvBoard, subLevels } from "./layout.js";

/* ------------------------------------------------ geometry constants */
/* horizontal spacing follows the view's spacing scale (applyView); the
   default scale is 1, which is exactly the historical geometry */
let FEEDER_SPACING=95, BUS_GAP=110, MIN_BUS_WIDTH=170, SLOT_GAP=30, PUMP_SLOT=115;
const MARGIN=90, TX_LABEL_W=150, RMU_TEE=40,
      Y_LABEL=34, Y_MV_TOP=62, Y_RMU_TOP=150, Y_RMU_BOT=268, Y_MVBUS=208,
      PUMP_R=20, TX_R=19, TIER_H=150, TIER_LINK_H=200, STEPUP_H=170,
      GEN_H=110, LV_SUB_H=200, SUB_PAD=20,
      Y_GEN=96, Y_SU_C1=196, Y_SU_C2=196+27;
let STEPUP_SHIFT=0;
/* rows below the MV distribution - re-based by setTiers() when MV boards
   or RMUs are fed from another MV board */
let Y_PUMP=352, Y_TX_C1=342, Y_TX_C2=Y_TX_C1+27, Y_BUS=486,
    Y_FEED_BRK=516, Y_ARROW=574, Y_FEED_LBL=592, DIAG_H=780;
const LABEL_CHAR=6.6;      /* width of one character of an 11 px rotated label */
/* the view in force for the drawing being made: constitution §4 — a view
   changes the drawing, never the data or the graph */
const VIEW={spacing:"normal", legend:true, titleBlock:true};
const SPACING_SCALE={compact:0.8, normal:1, wide:1.25};
function applyView(view){
  const v=Object.assign({spacing:"normal", legend:true, titleBlock:true}, view||{});
  if(!(v.spacing in SPACING_SCALE)) v.spacing="normal";
  VIEW.spacing=v.spacing; VIEW.legend=v.legend!==false; VIEW.titleBlock=v.titleBlock!==false;
  const k=SPACING_SCALE[v.spacing];
  FEEDER_SPACING=Math.round(95*k); BUS_GAP=Math.round(110*k); MIN_BUS_WIDTH=Math.round(170*k);
  SLOT_GAP=Math.round(30*k); PUMP_SLOT=Math.round(115*k);
  return VIEW;
}
function extendSheet(extra){ DIAG_H+=extra; }  /* title and bottom move, rows stay */
function labelClearance(items, order, lvY){
  /* how much the sheet must grow so no rotated way label reaches the
     title line (42 px above DIAG_H, plus a 24 px gap) */
  let end=0;
  for(const oid of order){
    const f=items[oid];
    if(f.x===null || !f.parents.length) continue;
    let par=items[f.parents[0]];
    if(par.type===TRANSFORMER && txBoard(items,par)) par=txBoard(items,par);  /* a way of the board it feeds */
    let lbl, y0;
    if([FEEDER,MCC].concat(TERMINALS).includes(f.type)){
      lbl=[f.id,f.desc,f.rating].filter(Boolean).join(" · ");
      const h={[CAPACITOR]:24,[EARTHING]:46,[ARRESTER]:44}[f.type];
      if([MV_BUSBAR,RMU].includes(par.type)) y0=(h===undefined)?Y_PUMP+14:Y_PUMP-24+h+12;
      else if(par.type===LV_BUSBAR||par.type===MCC){
        if(f.type===FEEDER && subBoardsOf(items,order,f).length) continue;
        if(f.type===MCC && mccLoads(items,order,f).length) continue;
        const yb=lvY(par); y0=(h===undefined)?yb+106:yb+64+h+12;
      } else if(par.type===TRANSFORMER && f.type===MCC){
        if(mccLoads(items,order,f).length) continue;
        y0=Y_BUS+106;                 /* hung off the transformer, band 0 */
      } else continue;
    } else if(f.type===PUMP && (par.type===LV_BUSBAR||par.type===MCC)){
      lbl=[f.id,f.desc,f.rating].filter(Boolean).join(" · ");
      y0=lvY(par)+102;
    } else if(f.type===PUMP && boardTx(items,par)){
      lbl=[f.id,f.desc,f.rating].filter(Boolean).join(" · ");
      y0=lvY(items[par.parents[0]])+218;
    } else if(f.type===PUMP && par.type===TRANSFORMER){
      lbl=[f.id,f.desc,f.rating].filter(Boolean).join(" · ");
      y0=Y_ARROW+14;                  /* motor on its own transformer */
    } else continue;
    end=Math.max(end,y0+lbl.length*LABEL_CHAR);
  }
  return Math.max(0,Math.ceil(end+24-(DIAG_H-42)));
}
function allocLanes(runs, slots){
  /* every sideways run its own lane, longest first so nested elbows never
     cross; runs that do not overlap in x may share one. runs: [[key,x0,x1]].
     slots list the lane heights in order of preference, clear of the device
     zones of the drops a lane crosses; more lanes than slots spread out. */
  runs=runs.slice().sort((a,b)=>Math.abs(b[2]-b[1])-Math.abs(a[2]-a[1]));
  const lanes=[], idx={};
  for(const [key,x0,x1] of runs){
    const lo=Math.min(x0,x1)-8, hi=Math.max(x0,x1)+8;
    let k=lanes.findIndex(occ=>occ.every(([a,b])=>hi<a||lo>b));
    if(k<0){ lanes.push([]); k=lanes.length-1; }
    lanes[k].push([lo,hi]); idx[key]=k;
  }
  const n=lanes.length;
  const ys=(n<=slots.length)?slots
    :Array.from({length:n},(_,k)=>slots[0]+(slots[slots.length-1]-slots[0])*k/(n-1));
  const out={}; for(const key of Object.keys(idx)) out[key]=ys[idx[key]];
  return out;
}
function setTiers(extra, top, subLevels){
  STEPUP_SHIFT=top||0; extra=extra+STEPUP_SHIFT;
  Y_PUMP=352+extra; Y_TX_C1=342+extra; Y_TX_C2=Y_TX_C1+27;
  Y_BUS=486+extra; Y_FEED_BRK=516+extra; Y_ARROW=574+extra;
  Y_FEED_LBL=592+extra; DIAG_H=780+extra+LV_SUB_H*(subLevels||0);
}
function genFeeds(items, order, g){
  /* the boards a generator supplies, as [board, device, coupler]: boards
     naming it in Feeds From, and the far end of a Bus Coupler between it
     and a board (a changeover / ATS) */
  const out=[];
  for(const b of childrenOf(items,order,g.id,[LV_BUSBAR,MV_BUSBAR,RMU]))
    out.push([b, protFor(b,g.id)[1]||"cb", null]);
  for(const oid of order){
    const c=items[oid];
    if(c.type!==BUS_COUPLER || !c.parents.includes(g.id)) continue;
    for(const p of c.parents)
      if(p!==g.id && items[p] && [LV_BUSBAR,MV_BUSBAR,RMU].includes(items[p].type))
        out.push([items[p], protFor(c)[1]||"cb", c]);
  }
  return out;
}
function mvGens(items, order){
  /* generators standing over MV gear as a supply of their own */
  const out={};
  for(const oid of order){
    const g=items[oid];
    if(g.type!==GENERATOR) continue;
    if(g.parents.some(p=>items[p].type===TRANSFORMER)) continue;
    const fed=genFeeds(items,order,g).filter(([b])=>[MV_BUSBAR,RMU].includes(b.type));
    if(fed.length) out[g.id]=fed;
  }
  return out;
}
function rmuHang(items, order){
  /* RMUs that hang below another RMU rather than beside it on its ring:
     at an RMU with three or more RMU neighbours, a branch that reaches no
     supply of its own is fed only through that RMU, so it is drawn a tier
     down as a way of it. {rmu id: Set of child ids} */
  const rmus=order.filter(i=>items[i].type===RMU);
  const adj={}; for(const r of rmus) adj[r]=new Set();
  for(const r of rmus) for(const p of items[r].parents)
    if(items[p].type===RMU){ adj[r].add(p); adj[p].add(r); }
  const anchored=new Set(rmus.filter(r=>items[r].parents.some(p=>items[p].type!==RMU)));
  const hang={};
  for(const v of rmus){
    if(adj[v].size<3) continue;
    for(const u of adj[v]){
      const comp=new Set(), stack=[u];
      while(stack.length){
        const n=stack.pop();
        if(comp.has(n)||n===v) continue;
        comp.add(n); stack.push(...adj[n]);
      }
      if(![...comp].some(n=>anchored.has(n))){
        hang[v]=hang[v]||new Set();
        for(const n of comp) if(adj[v].has(n)) hang[v].add(n);
      }
    }
  }
  return hang;
}
function hangHas(hang, p, c){ return !!(hang[p] && hang[p].has(c)); }
/* MV distribution level of each busbar/RMU: a board or RMU fed from an MV
   busbar sits one level below it; RMUs linked to each other stay level */
/* transformers that feed an MV busbar or RMU (step-up) -> their source */
/* step-ups taking power from a real LV board up to MV gear: drawn in the
   transformer row, board below them and their output above */
function suMid(items, order){
  const out={};
  for(const oid of order){
    const tx=items[oid];
    if(tx.type!==TRANSFORMER) continue;
    const up=childrenOf(items,order,tx.id,[MV_BUSBAR,RMU]);
    const src=tx.parents.map(p=>items[p])
      .filter(o=>o.type===LV_BUSBAR && o.parents.length);
    if(up.length && src.length) out[tx.id]=[src[0],up[0]];
  }
  return out;
}
function placeSuMid(items, order, x){
  const mid=suMid(items,order);
  for(const txId of Object.keys(mid)){
    const tx=items[txId], up=mid[txId][1];
    if(tx.x!==null) continue;
    if(up.x!==null){ tx.x=up.x; continue; }   /* gear already has its slot */
    tx.x=x+60; up.x=tx.x;
    if(up.type===MV_BUSBAR){ up.xLeft=tx.x-85; up.xRight=tx.x+85; }
    x+=200;
  }
  return x;
}
function lvSubs(items, order){
  /* a transformer taking supply from one LV board and feeding another:
     drawn in the transformer row between the two bars */
  const mid=suMid(items,order), out={};
  for(const oid of order){
    const tx=items[oid];
    if(tx.type!==TRANSFORMER || (tx.id in mid))
      continue;
    const src=tx.parents.map(p=>items[p])
      .filter(o=>o.type===LV_BUSBAR && o.parents.length);
    const fed=childrenOf(items,order,tx.id,[LV_BUSBAR]);
    if(src.length && fed.length) out[tx.id]=[src[0],fed];
  }
  return out;
}
function stepUps(items, order){
  const out={};
  for(const oid of order){
    const tx=items[oid];
    if(tx.type!==TRANSFORMER) continue;
    if(!childrenOf(items,order,tx.id,[MV_BUSBAR,RMU]).length) continue;
    if(tx.parents.some(p=>items[p].type===LV_BUSBAR && items[p].parents.length))
      continue;                     /* drawn in the transformer row instead */
    if(tx.parents.some(p=>[MV_BUSBAR,RMU].includes(items[p].type)))
      continue;                     /* joins two boards: drawn between tiers */
    out[tx.id]=tx.parents.length?items[tx.parents[0]]:null;
  }
  return out;
}
function suppliesOf(items, order, board, sus){
  /* everything standing over a board as a supply of its own: incomers,
     step-up columns, generators feeding it directly, and the board above */
  const gens=mvGens(items,order);
  return order.map(i=>items[i]).filter(o=>
    ((o.type===MV_INCOMER || (o.id in sus)) &&
     childrenOf(items,order,o.id).some(k=>k.id===board.id))
    || ((o.id in gens) && gens[o.id].some(([b])=>b.id===board.id))
    || (o.type===MV_BUSBAR && board.parents.includes(o.id)));
}
function spreadSupplies(items, order, boards, sus, links){
  /* everything landing on a board from above shares one spread over its
     centre, 90 px apart; a board above keeps its x and only moves its
     landing. The first board an item feeds decides where it stands. */
  const done=new Set();
  for(const mvb of boards){
    if(mvb.x===null) continue;
    const feeds=links.filter(([u,tx,l])=>l.id===mvb.id).map(([u,tx])=>tx)
      .concat(suppliesOf(items,order,mvb,sus));
    const n=feeds.length;
    feeds.forEach((f,i)=>{
      const x=mvb.x+(i-(n-1)/2)*90;
      if(f.type===MV_BUSBAR) mvb.land[f.id]=x;
      else if(!done.has(f.id)){
        f.x=x; done.add(f.id);
        const src=sus[f.id];
        if(src){ src.x=x; if(src.type===LV_BUSBAR){ src.xLeft=x-85; src.xRight=x+85; } }
      }
    });
  }
}
function genBelow(items, order, tx){
  /* a transformer hung under MV gear whose load is a Generator can only be
     a step-up drawn upside down: a generator is never a load */
  return tx.type===TRANSFORMER
    && tx.parents.some(p=>[MV_BUSBAR,RMU].includes(items[p].type))
    && childrenOf(items,order,tx.id,[GENERATOR]).length>0;
}
function placeSuSources(items, order){
  /* the generation source drawn under a reversed step-up follows it */
  for(const oid of order){
    const tx=items[oid];
    if(tx.x===null || !genBelow(items,order,tx)) continue;
    for(const src of childrenOf(items,order,tx.id,
                                [GENERATOR,LV_BUSBAR,MV_INCOMER])){
      src.x=tx.x;
      if(src.type===LV_BUSBAR) placeLvBoard(items,order,src,tx.x);
    }
  }
}
function rightEdge(items, x){
  return Math.max(x,...Object.values(items)
    .filter(b=>[LV_BUSBAR,MV_BUSBAR].includes(b.type) && b.xRight!==null)
    .map(b=>b.xRight));
}
function placeBoardRow(items, order, boards, x){
  let cur=x+BUS_GAP;
  for(const bb of boards){
    const w=lvBoardWidth(items,order,bb);
    placeLvBoard(items,order,bb,cur+w/2);
    cur+=w+BUS_GAP;
  }
  return [x+BUS_GAP,cur];
}
function placeLooseBoards(items, order, x){
  /* transformers and LV boards no other pass claimed - an entry whose
     supply is not filled in yet - still get a proper bar with feeders */
  for(const oid of order){
    const tx=items[oid];
    if(tx.type!==TRANSFORMER || tx.x!==null)
      continue;
    const todo=childrenOf(items,order,tx.id,[LV_BUSBAR]).filter(b=>b.x===null);
    if(!todo.length) continue;
    const [left,cur]=placeBoardRow(items,order,todo,rightEdge(items,x));
    tx.x=(left+cur-BUS_GAP)/2;
    x=cur;
  }
  const loose=order.map(i=>items[i])
    .filter(b=>b.type===LV_BUSBAR && b.x===null && !isSubBoard(items,b));
  if(loose.length) x=placeBoardRow(items,order,loose,rightEdge(items,x))[1];
  for(const oid of order){          /* a generator feeding an LV board
                                       stands over that board's bar */
    const g=items[oid];
    if(g.type!==GENERATOR || g.x!==null) continue;
    const fed=genFeeds(items,order,g).map(([b])=>b)
      .filter(b=>b.type===LV_BUSBAR && b.xLeft!==null);
    if(!fed.length) continue;
    const bb=fed[0];
    const sup=order.map(i=>items[i])
      .filter(o=>([TRANSFORMER,GENERATOR].includes(o.type)
                  && childrenOf(items,order,o.id).some(k=>k.id===bb.id))
                 || (o.type===GENERATOR
                     && genFeeds(items,order,o).some(([b])=>b.id===bb.id)));
    const n=Math.max(1,sup.length), k=sup.indexOf(g)>=0?sup.indexOf(g):0;
    if(isSubBoard(items,bb)){       /* the feed from above takes the centre */
      const gk=sup.filter(o=>o.type===GENERATOR).indexOf(g);
      g.x=bb.x+60*(gk+1);
    } else g.x=(n===1)?bb.x:bb.xLeft+(bb.xRight-bb.xLeft)*(k+0.5)/n;
  }
  return x;
}
function placeLvSubs(items, order, x){
  /* LV/LV transformers and the boards they feed, left to right */
  const subs=lvSubs(items,order);
  for(const txId of Object.keys(subs)){
    const fed=subs[txId][1], todo=fed.filter(b=>b.x===null);
    if(!todo.length){
      if(items[txId].x===null){
        const xs=fed.filter(b=>b.x!==null).map(b=>b.x);
        if(xs.length) items[txId].x=xs.reduce((a,b)=>a+b,0)/xs.length;
      }
      continue;
    }
    const [left,cur]=placeBoardRow(items,order,todo,rightEdge(items,x));
    if(items[txId].x===null) items[txId].x=(left+cur-BUS_GAP)/2;
    x=cur;
  }
  return x;
}
function placeTxMotors(items, order){
  for(const oid of order){
    const t=items[oid];
    if(t.type===TRANSFORMER && t.x!==null)
      for(const m of childrenOf(items,order,t.id,[PUMP].concat(TERMINALS)))
        if(m.x===null) m.x=t.x;
  }
}
function placeStepUps(items, order){
  /* a step-up transformer (and its source) or a generator sits above the
     MV busbar or RMU it feeds, beside any utility incomers there */
  const sus=stepUps(items,order), gens=mvGens(items,order);
  const cols=Object.keys(sus).concat(Object.keys(gens));
  for(const txId of cols){
    const tx=items[txId], src=sus[txId]||null;
    const fedAll=(txId in gens)?gens[txId].map(([b])=>b)
      :childrenOf(items,order,txId,[MV_BUSBAR,RMU]);
    const fed=fedAll.find(f=>f.x!==null);
    if(!fed) continue;
    const peers=suppliesOf(items,order,fed,sus);
    const n=Math.max(1,peers.length);
    const k=peers.indexOf(tx)>=0?peers.indexOf(tx):0;
    tx.x=fed.x+(k-(n-1)/2)*90;
    if(src){
      src.x=tx.x;
      if(src.type===LV_BUSBAR){ src.xLeft=tx.x-85; src.xRight=tx.x+85; }
    }
  }
}

function mvDepth(items, order){
  /* vertical tier of each MV busbar / RMU, from Feeds From alone: whatever
     feeds a board is drawn above it. A board or RMU fed from a board,
     directly or through a transformer, sits one tier below it; RMUs linked
     to each other stay level. Voltage is a label, not a rule. */
  const depth={};
  for(const i of order)
    if([MV_BUSBAR,RMU].includes(items[i].type)) depth[i]=0;
  const hang=rmuHang(items,order);
  for(let pass=0; pass<=Object.keys(depth).length; pass++){
    let changed=false;
    for(const oid of Object.keys(depth))
      for(const p of items[oid].parents){
        const par=items[p]; let d;
        if(par.id in depth){
          if(hangHas(hang,oid,p)) continue;   /* written both ways */
          const down=par.type===MV_BUSBAR || hangHas(hang,p,oid);
          d=depth[par.id]+(down?1:0);
        }
        else if(par.type===TRANSFORMER){
          const pp=par.parents.find(q=>q in depth);
          if(pp===undefined) continue;
          d=depth[pp]+1;
        } else continue;
        if(d>depth[oid]){ depth[oid]=d; changed=true; }
      }
    if(!changed) break;
  }
  return depth;
}
function levelLinks(items, order, depth){
  /* transformers joining two MV boards / RMUs, as [upper, tx, lower] */
  depth=depth||mvDepth(items,order);
  const out=[];
  for(const oid of order){
    const tx=items[oid];
    if(tx.type!==TRANSFORMER) continue;
    const ups=tx.parents.filter(p=>p in depth).map(p=>items[p]);
    const downs=childrenOf(items,order,tx.id,[MV_BUSBAR,RMU]);
    for(const a of ups) for(const b of downs){
      if(a===b) continue;
      out.push(depth[a.id]<=depth[b.id]?[a,tx,b]:[b,tx,a]);
    }
  }
  return out;
}
function tierOffsets(depth, links, hung){
  /* y offset of each tier: 150 px per cascade step, 200 px where a
     transformer sits between the tiers or an RMU hangs off an RMU */
  const n=Math.max(0,...Object.values(depth));
  const crossed=new Set(links.map(([,,l])=>depth[l.id])
                        .concat((hung||[]).map(h=>depth[h])));
  const off=[0]; let y=0;
  for(let d=1; d<=n; d++){ y+=crossed.has(d)?TIER_LINK_H:TIER_H; off.push(y); }
  return off;
}

export { MARGIN, FEEDER_SPACING, BUS_GAP, MIN_BUS_WIDTH, SLOT_GAP, PUMP_SLOT, TX_LABEL_W, RMU_TEE, Y_LABEL, Y_MV_TOP, Y_RMU_TOP, Y_RMU_BOT, Y_MVBUS, PUMP_R, TX_R, TIER_H, TIER_LINK_H, STEPUP_H, GEN_H, LV_SUB_H, SUB_PAD, Y_GEN, Y_SU_C1, Y_SU_C2, STEPUP_SHIFT, Y_PUMP, Y_TX_C1, Y_TX_C2, Y_BUS, Y_FEED_BRK, Y_ARROW, Y_FEED_LBL, DIAG_H, LABEL_CHAR, extendSheet, labelClearance, allocLanes, setTiers, genFeeds, mvGens, rmuHang, hangHas, suMid, placeSuMid, lvSubs, stepUps, suppliesOf, spreadSupplies, genBelow, placeSuSources, rightEdge, placeBoardRow, placeLooseBoards, placeLvSubs, placeTxMotors, placeStepUps, mvDepth, levelLinks, tierOffsets, VIEW, SPACING_SCALE, applyView };
