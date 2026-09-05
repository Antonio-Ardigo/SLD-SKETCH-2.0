import { MV_INCOMER, RMU, MV_BUSBAR, TRANSFORMER, PUMP, GENERATOR, LV_BUSBAR, FEEDER, MCC, TERMINALS, LV_LOADS, earthBelow } from "./types.js";
import { MARGIN, FEEDER_SPACING, BUS_GAP, MIN_BUS_WIDTH, SLOT_GAP, PUMP_SLOT, TX_LABEL_W, RMU_TEE, TX_R, SUB_PAD, genFeeds, rmuHang, hangHas, suMid, placeSuMid, stepUps, suppliesOf, spreadSupplies, placeSuSources, placeLooseBoards, placeLvSubs, placeTxMotors, placeStepUps, mvDepth, levelLinks } from "./geometry.js";
import { childrenOf } from "./model.js";

/* ------------------------------------------------ layout */
function mccLoads(items, order, m){   /* an MCC's ways: motors, feeders, terminal items, and an MCC fed from it */
  return childrenOf(items,order,m.id,[PUMP,FEEDER,MCC].concat(TERMINALS));
}
function lvKids(items, order, bb){
  /* the ways of an LV board: feeders, MCCs, motors, terminal items and
     sub-boards fed straight from it, each taking a slot on the bar; an MCC
     with loads is a little board of its own: its ways are its kids */
  if(bb.type===MCC) return mccLoads(items,order,bb);
  const kids=childrenOf(items,order,bb.id,LV_LOADS.concat([LV_BUSBAR,TRANSFORMER]))
    .filter(k=>k.type!==TRANSFORMER || boardTx(items,k));
  /* loads named on a transformer that feeds this board are its ways */
  for(const oid of order){
    const tx=items[oid];
    if(tx.type===TRANSFORMER && txBoard(items,tx)===bb)
      for(const k of childrenOf(items,order,tx.id,[PUMP,MCC])) if(!kids.includes(k)) kids.push(k);
  }
  return kids;
}
function subBoardsOf(items, order, f){ return childrenOf(items,order,f.id,[LV_BUSBAR]); }
/* What a feeder carries other than a sub-board: the equipment hung on the way.
   A sub-board has its own path (isSubBoard and the sub-board loop in render);
   everything else — a motor, an MCC, a transformer, a terminal item, another
   feeder — takes the feeder's own slot, because the feeder is the way and the
   thing on the end of it is what the way goes to. */
function hangingOf(items, order, f, seen=[]){
  return f.type!==FEEDER || seen.includes(f.id) ? []
    : childrenOf(items,order,f.id,LV_LOADS.concat([TRANSFORMER])).filter(k=>!seen.includes(k.id));
}
/* The board a feeder is a way of — the one place that decides it, so that the
   layout, the drawing and the checker cannot each hold a different opinion
   (constitution §5).

   A way is a way on either side of the transformer. This used to answer only
   for an LV board or an MCC, which made a way out of an MV switchboard a
   terminating cable and nothing else: a transformer named on one was given no
   slot, landed in the leftover column past the end of the sheet, drew no
   conductor at all and said "supply not defined" — while the table plainly
   named its supply, and nothing was reported.

   The LV types stay first, so an LV way resolves exactly as it always did
   when a row names two supplies. */
const WAY_BOARDS=[LV_BUSBAR,MCC,MV_BUSBAR,RMU];
function feederBoard(items, f){
  if(!f || f.type!==FEEDER) return null;
  return f.parents.map(q=>items[q]).find(o=>o && WAY_BOARDS.includes(o.type)) || null;
}
/* Everything a feeder carries, sub-boards and equipment alike. A feeder that
   carries something is a link: a conductor with a device on it, ending at
   what it feeds, not a symbol with an open end. */
function carriesOn(items, order, f){
  const subs=subBoardsOf(items,order,f);
  return feederBoard(items,f) ? subs.concat(hangingOf(items,order,f)) : subs;
}
function isSubBoard(items, bb){
  /* an LV board fed from a feeder or another LV board hangs below it */
  return bb.type===LV_BUSBAR
    && bb.parents.some(p=>items[p] && [FEEDER,LV_BUSBAR].includes(items[p].type));
}
function boardTx(items, tx){
  /* a transformer taking supply from an LV board and feeding only motors:
     a way of that board, drawn as a step-down on the row below it (a
     transformer feeding MV gear is a step-up, one feeding another LV board
     an LV/LV transformer; both are drawn in the transformer row) */
  if(tx.type!==TRANSFORMER || !tx.parents.length) return false;
  const par=items[tx.parents[0]];
  if(!par || par.type!==LV_BUSBAR) return false;
  if(earthBelow(items,tx)) return false;
  const kids=Object.values(items).filter(c=>c.parents.includes(tx.id));
  return kids.every(c=>c.type===PUMP);   /* motors, or nothing entered yet */
}
function txLines(tx){
  /* the label block of a transformer: id, description, rating+voltage */
  return [tx.id,tx.desc,[tx.rating,tx.voltage].filter(Boolean).join(" ")].filter(Boolean);
}
function txBoard(items, tx){
  /* the LV board a transformer feeds (the first one), or null */
  for(const c of Object.values(items))
    if(c.type===LV_BUSBAR && c.parents.includes(tx.id)) return c;
  return null;
}
function txLoads(items, order, tx){
  /* loads hung straight off a transformer that feeds no board: motors and
     MCCs under it (a dedicated motor or pump-station transformer); a load
     named on a transformer that does feed a board is a way of that board
     instead (see lvKids): the secondary goes to the board's incomer and
     nowhere else, and the load takes its protection from the bar */
  if(txBoard(items,tx)) return [];
  return childrenOf(items,order,tx.id,[PUMP,MCC]);
}
function loadSlot(items, order, k){   /* slot width of one such load */
  if(k.type===MCC && mccLoads(items,order,k).length)
    return lvBoardWidth(items,order,k)+2*SUB_PAD;
  return k.type===PUMP?PUMP_SLOT:FEEDER_SPACING;
}
/* What a way carries, laid across the way's own slot [left, left+width]. A
   transformer takes `placeTxLoads` so its own motors follow it down; anything
   else is one slot wide. A way carrying nothing does nothing here, which is
   what keeps a sheet without one byte-identical. */
/* A way and what it carries stand in one column. The two layout paths reach
   them from opposite ends — the MV board's own pass places the way and hands
   its slot down (placeCarried), while the RMU-without-a-switchboard path
   places the transformer under its board and leaves the way behind — so this
   reconciles whichever came first rather than adding a third placement rule.
   A way carrying nothing is untouched. */
function shareWayColumn(items, order){
  for(const id of order){
    const f=items[id];
    if(f.type!==FEEDER) continue;
    const on=carriesOn(items,order,f);
    if(!on.length) continue;
    if(f.x===null){ const k=on.find(k=>k.x!==null); if(k) f.x=k.x; }
    else for(const k of on) if(k.x===null) k.x=f.x;
  }
}
function placeCarried(items, order, f, left, width){
  const on=carriesOn(items,order,f).filter(k=>k.x===null);
  if(!on.length) return;
  const need=on.reduce((a,k)=>a+slotWidth(items,order,k),0);
  let cur=left+(width-need)/2;
  for(const k of on){
    const w=slotWidth(items,order,k);
    if(k.type===TRANSFORMER) placeTxLoads(items,order,k,cur,w);
    else k.x=cur+w/2;
    cur+=w;
  }
}
function placeLoad(items, order, k, left){
  /* place one transformer load from `left`; returns the next cursor */
  const w=loadSlot(items,order,k);
  k.x=left+w/2;
  if(k.type===MCC && mccLoads(items,order,k).length) placeLvBoard(items,order,k,k.x);
  return left+w;
}
function placeTxLoads(items, order, tx, left, width){
  /* a transformer in [left, left+width] with the loads hung under it
     centred beneath */
  const loads=txLoads(items,order,tx).filter(k=>k.x===null);
  const lw=loads.reduce((a,k)=>a+loadSlot(items,order,k),0);
  tx.x=left+width/2;
  let cur=left+(width-lw)/2;
  for(const k of loads) cur=placeLoad(items,order,k,cur);
}
function lvLevel(items, bb, seen){
  /* how many rows below the main LV row a board sits */
  seen=seen||new Set();
  if(seen.has(bb.id)) return 0;
  seen.add(bb.id);
  for(const p of bb.parents){
    const par=items[p];
    if(!par) continue;
    if(par.type===LV_BUSBAR||par.type===MCC) return lvLevel(items,par,seen)+1;
    if(par.type===TRANSFORMER && bb.type===MCC){   /* a way of that board, or under a lone tx */
      const b=txBoard(items,par); return b?lvLevel(items,b,seen)+1:1;
    }
    if(par.type===FEEDER)
      for(const q of par.parents)
        if(items[q] && items[q].type===LV_BUSBAR) return lvLevel(items,items[q],seen)+1;
  }
  return 0;
}
function lvKidWidth(items, order, k, seen=[]){
  /* slot width of one way: a plain way, or the sub-board(s) under it */
  if(k.type===LV_BUSBAR || (k.type===MCC && mccLoads(items,order,k).length))
    return lvBoardWidth(items,order,k)+2*SUB_PAD;
  const subs=k.type===FEEDER?subBoardsOf(items,order,k):[];
  if(subs.length)
    return Math.max(FEEDER_SPACING,
      subs.reduce((a,b)=>a+lvBoardWidth(items,order,b)+2*SUB_PAD,0));
  const hang=hangingOf(items,order,k,seen);
  if(hang.length){
    /* wide enough for the equipment hung on the way, and for the way's own
       label beside its device — the equipment fills the column below, so
       that label is written across rather than down, and needs the room (the
       same allowance a board transformer gets, below) */
    const lbl=[k.id,k.desc,k.rating].filter(Boolean).join(" · ");
    return Math.max(FEEDER_SPACING, 8+lbl.length*5.8+8,
      hang.reduce((a,h)=>a+lvKidWidth(items,order,h,seen.concat([k.id])),0));
  }
  if(k.type===TRANSFORMER){   /* a board transformer: room for its label */
    const need=TX_R+10+Math.max(...txLines(k).map(t=>t.length))*7.2+8;
    return Math.max(FEEDER_SPACING, FEEDER_SPACING/2+need);
  }
  return FEEDER_SPACING;
}
function nSupOf(items, order, bb){   /* supplies standing over an LV bar */
  return order.filter(i=>items[i].type===TRANSFORMER
      && childrenOf(items,order,i,[LV_BUSBAR]).includes(bb)).length
    + order.filter(i=>items[i].type===GENERATOR
      && genFeeds(items,order,items[i]).some(([b])=>b===bb)).length;
}
function barLabel(bb){
  /* the text over a bar: id, description, rating (and voltage) */
  const parts=bb.type===MCC?[bb.id,bb.desc,bb.rating]:[bb.id,bb.desc,bb.rating,bb.voltage];
  return parts.filter(Boolean).join(" ");
}
function crossingXs(svg, xLeft, xRight, yTop, yBot){
  /* vertical conductors already drawn through a label's band */
  return svg.vlines.filter(([x,y0,y1])=>x>xLeft && x<xRight && y0<yBot && y1>yTop)
                   .map(([x])=>x);
}
function labelX(xLeft, xRight, xs, lbl){
  /* where a bar's label starts: at the left end unless a conductor landing
     on the bar would cross it; then after the last landing, or in the widest
     gap between landings, when the text fits there */
  const w=lbl.length*6.9;
  if(!xs.length || Math.min(...xs)-xLeft>=w+6) return xLeft;
  if(xRight-Math.max(...xs)>=w+6) return Math.max(...xs)+8;
  const s=[...xs].sort((a,b)=>a-b);
  for(let i=0;i+1<s.length;i++) if(s[i+1]-s[i]>=w+16) return s[i]+8;
  /* nowhere on the bar is clear: the least crossed start that still ends on
     the bar, so the label never drifts away from what it names */
  let starts=[xLeft,...s.map(x=>x+8)].filter(x0=>x0+w<=xRight+8);
  if(!starts.length) starts=[xLeft];
  const score=x0=>s.filter(q=>q>x0 && q<x0+w).length;
  return starts.reduce((best,x0)=>
    (score(x0)<score(best) || (score(x0)===score(best) && x0<best))?x0:best, starts[0]);
}
function lvBoardWidth(items, order, bb){
  /* wide enough for its ways, and for its label to fit on one side of a
     centred incomer */
  return Math.max(MIN_BUS_WIDTH,
    lvKids(items,order,bb).reduce((a,k)=>a+lvKidWidth(items,order,k),0),
    2*(barLabel(bb).length*6.9+12)+Math.max(0,nSupOf(items,order,bb)-1)*90);
}
function placeLvBoard(items, order, bb, cx){
  /* an LV busbar on cx with its ways in their slots, and the sub-boards
     beneath its feeders on the row below */
  const kids=lvKids(items,order,bb);
  const width=lvBoardWidth(items,order,bb);
  bb.xLeft=cx-width/2; bb.xRight=cx+width/2; bb.x=cx;
  const widths=kids.map(k=>lvKidWidth(items,order,k));
  let cur=bb.xLeft+(width-widths.reduce((a,b)=>a+b,0))/2;
  kids.forEach((k,i)=>{
    const w=widths[i];
    k.x=cur+w/2;
    if(k.type===TRANSFORMER) k.x=cur+FEEDER_SPACING/2;  /* label block on the right */
    if(k.type===LV_BUSBAR || (k.type===MCC && mccLoads(items,order,k).length))
      placeLvBoard(items,order,k,k.x);
    else if(k.type===FEEDER){
      const subs=subBoardsOf(items,order,k);
      if(subs.length===1) placeLvBoard(items,order,subs[0],k.x);
      else if(subs.length){
        let c=cur;
        for(const b of subs){
          const bw=lvBoardWidth(items,order,b)+2*SUB_PAD;
          placeLvBoard(items,order,b,c+bw/2); c+=bw;
        }
      }
      /* the equipment hung on this way stands in the way's own slot */
      const hang=hangingOf(items,order,k);
      if(hang.length===1){
        hang[0].x=k.x;
        if(hang[0].type===LV_BUSBAR || (hang[0].type===MCC && mccLoads(items,order,hang[0]).length))
          placeLvBoard(items,order,hang[0],k.x);
      } else if(hang.length){
        let c=cur;
        for(const h of hang){
          const hw=lvKidWidth(items,order,h,[k.id]);
          h.x=c+hw/2;
          if(h.type===LV_BUSBAR || (h.type===MCC && mccLoads(items,order,h).length))
            placeLvBoard(items,order,h,h.x);
          c+=hw;
        }
      }
    }
    cur+=w;
  });
  return width;
}
function subLevels(items, order){
  return Math.max(0,...order.filter(i=>items[i].type===LV_BUSBAR
      || (items[i].type===MCC && mccLoads(items,order,items[i]).length)
      || boardTx(items,items[i]))
    .map(i=>lvLevel(items,items[i])));
}
function slotWidth(items, order, item){
  if(item.type===PUMP) return PUMP_SLOT;
  if(item.type===TRANSFORMER||item.type===GENERATOR){
    const boards=childrenOf(items,order,item.id,[LV_BUSBAR]);
    let w=130;
    for(const bb of boards) w=Math.max(w, lvBoardWidth(items,order,bb));
    if(item.type===TRANSFORMER)     /* motors / MCCs hung under it */
      w=Math.max(w, txLoads(items,order,item).reduce((a,k)=>a+loadSlot(items,order,k),0));
    return w;
  }
  /* a way with something on it needs room for it: the way is the way, and
     what is on the end of it stands in the way's own slot (the same rule
     lvKidWidth applies on the LV side) */
  if(item.type===FEEDER){
    const on=carriesOn(items,order,item);
    if(on.length)
      return Math.max(FEEDER_SPACING,
        on.reduce((a,k)=>a+slotWidth(items,order,k),0));
  }
  if(LV_LOADS.includes(item.type)) return FEEDER_SPACING;
  return 130;
}
/* RMUs linked to `head` through RMU-to-RMU cables on the same tier, in
   chain order, with the head centred when it has two neighbours */
function ringGroup(items, order, head, depth){
  const links=r=>{
    const out=r.parents.map(p=>items[p])
      .filter(p=>p.type===RMU && depth[p.id]===depth[r.id]);
    return out.concat(childrenOf(items,order,r.id,[RMU])
      .filter(k=>depth[k.id]===depth[r.id]));
  };
  const seen=new Set([head.id]), chain=[];
  for(const k of links(head)){
    const branch=[]; let node=k;
    while(node && !seen.has(node.id)){
      seen.add(node.id); branch.push(node);
      node=links(node).find(n=>!seen.has(n.id))||null;
    }
    chain.push(branch);
  }
  if(chain.length>=2)
    return chain[0].slice().reverse().concat([head], ...chain.slice(1));
  return [head].concat(...chain);
}

function mvChildren(items, order, node){
  /* the ways of an MV board / RMU that occupy a slot beneath it. An LV-fed
     step-up is a parent in the graph but a way in the drawing; an RMU
     hanging off this RMU is a way too; one member of a ring stands for
     the whole ring, which is laid out as a group */
  const types=[TRANSFORMER,PUMP].concat(LV_LOADS);
  if(node.type===MV_BUSBAR) types.push(MV_BUSBAR,RMU);
  else if(node.type===RMU) types.push(MV_BUSBAR);   /* a switchboard on an RMU way */
  const links=levelLinks(items,order);
  const ltx=new Set(links.map(([,tx])=>tx.id));
  let kids=childrenOf(items,order,node.id,types).filter(k=>!ltx.has(k.id));
  if(node.type===RMU){
    const hang=rmuHang(items,order);
    kids=kids.concat(childrenOf(items,order,node.id,[RMU])
      .filter(k=>hangHas(hang,node.id,k.id)));
  }
  const mid=suMid(items,order);
  for(const t of Object.keys(mid))
    if(mid[t][1].id===node.id && !kids.includes(items[t])) kids.push(items[t]);
  const seen=new Set();
  for(const [u,tx,l] of links)      /* the board on the far side of a
                                       transformer hangs beneath this one */
    if(u.id===node.id && !kids.includes(l) && !seen.has(l.id)){ kids.push(l); seen.add(l.id); }
  const depth=mvDepth(items,order), out=[], grouped=new Set();
  for(const k of kids){
    if(grouped.has(k.id)) continue;
    if(k.type===RMU) for(const m of ringGroup(items,order,k,depth)) grouped.add(m.id);
    out.push(k);
  }
  return out;
}
function mvOwnWidth(items, order, node, depth){
  if(node.type!==MV_BUSBAR && node.type!==RMU)
    return slotWidth(items,order,node);
  const kids=mvChildren(items,order,node);
  const tees=(node.type===RMU)?(rmuHang(items,order)[node.id]||new Set()):new Set();
  const nSup=suppliesOf(items,order,node,stepUps(items,order)).length
    +levelLinks(items,order).filter(([,,l])=>l.id===node.id).length;
  const top=Math.max(nSup>1?(nSup-1)*90+60:0,
    2*(barLabel(node).length*6.9+12)+Math.max(0,nSup-1)*90);
  if(!kids.length) return Math.max(MIN_BUS_WIDTH,top);
  const need=kids.reduce((a,k)=>a+mvWidth(items,order,k,depth),0)
             +SLOT_GAP*(kids.length-1)+(RMU_TEE+SLOT_GAP)*tees.size;
  return Math.max(MIN_BUS_WIDTH,need,top);
}
function mvWidth(items, order, node, depth){
  if(node.type===RMU && depth){
    const g=ringGroup(items,order,node,depth);
    if(g.length>1)
      return g.reduce((a,m)=>a+mvOwnWidth(items,order,m,depth),0)
             +SLOT_GAP*(g.length-1);
  }
  return mvOwnWidth(items,order,node,depth);
}
function placeMvNode(items, order, node, left, width, depth){
  /* a ring head lays its whole ring out side by side in that band */
  if(node.type===RMU && depth){
    const g=ringGroup(items,order,node,depth);
    if(g.length>1){
      const widths=g.map(m=>mvOwnWidth(items,order,m,depth));
      const need=widths.reduce((a,b)=>a+b,0)+SLOT_GAP*(g.length-1);
      let cursor=left+(width-need)/2;
      g.forEach((m,i)=>{
        placeOwn(items,order,m,cursor,widths[i],depth);
        cursor+=widths[i]+SLOT_GAP;
      });
      return;
    }
  }
  placeOwn(items,order,node,left,width,depth);
}
function placeOwn(items, order, node, left, width, depth){
  /* one board / RMU and the ways directly beneath it. An RMU hung below an
     RMU gets a narrow tee-off slot in the enclosure and its own subtree
     beside the enclosure's ways; the enclosure centres on its ways */
  node.x=left+width/2;
  if(node.type===MV_BUSBAR){ node.xLeft=left; node.xRight=left+width; }
  const kids=mvChildren(items,order,node);
  const hang=rmuHang(items,order);
  const tees=(node.type===RMU)?childrenOf(items,order,node.id,[RMU])
    .filter(k=>hangHas(hang,node.id,k.id)):[];
  const own=kids.filter(k=>k.type!==RMU || !tees.length);
  const groups=kids.filter(k=>!own.includes(k));
  const slots=own.map(k=>[k,mvWidth(items,order,k,depth),"way"])
    .concat(tees.map(t=>[t,RMU_TEE,"tee"]))
    .concat(groups.map(g=>[g,mvWidth(items,order,g,depth),"group"]));
  const need=slots.reduce((a,s)=>a+s[1],0)+SLOT_GAP*Math.max(0,slots.length-1);
  let cursor=left+(width-need)/2;
  const span=[];
  for(const [k,w,what] of slots){
    if(what==="tee"){ node.tee[k.id]=cursor+w/2; span.push(cursor+w/2); }
    else if(k.type===MV_BUSBAR||k.type===RMU) placeMvNode(items,order,k,cursor,w,depth);
    else {
      if(k.type===TRANSFORMER) placeTxLoads(items,order,k,cursor,w);
      else k.x=cursor+w/2;
      /* a way carries its equipment across its own slot: the way's x is where
         its device sits on the bar, and what it feeds stands under it */
      if(k.type===FEEDER) placeCarried(items,order,k,cursor,w);
      span.push(k.x);
    }
    cursor+=w+SLOT_GAP;
  }
  if(tees.length && span.length) node.x=(Math.min(...span)+Math.max(...span))/2;
}
function layoutMvBoards(items, order){
  const mvbs=order.map(i=>items[i]).filter(t=>t.type===MV_BUSBAR);
  const mvs=order.map(i=>items[i]).filter(t=>t.type===MV_INCOMER);
  const depth=mvDepth(items,order);
  let x=MARGIN;
  /* roots are the boards not fed from another MV board, nor through a
     transformer from one; an RMU tree of its own is a root too */
  const links=levelLinks(items,order,depth);
  const lowers=new Set(links.map(([,,l])=>l.id));
  const rmus=order.map(i=>items[i]).filter(t=>t.type===RMU);
  const roots=mvbs.filter(b=>!b.parents.some(p=>[MV_BUSBAR,RMU].includes(items[p].type))
                             && !lowers.has(b.id))
    .concat(rmus.filter(r=>!r.parents.some(p=>[MV_BUSBAR,RMU].includes(items[p].type))
                           && !lowers.has(r.id) && r.x===null));
  for(const mvb of roots){
    const w=mvWidth(items,order,mvb,depth);
    placeMvNode(items,order,mvb,x,w,depth);
    x=(mvb.xRight!==null?mvb.xRight:mvb.x+w/2)+BUS_GAP;
  }
  const seenL={};
  for(const [u,tx,l] of links){     /* a level transformer stands over
                                       the board it joins from above */
    if(l.x===null) continue;
    const k=seenL[l.id]||0;
    tx.x=l.x+70*k; seenL[l.id]=k+1;
  }
  /* LV boards centred under their supply transformer(s) - the mean of
     the supplies when a board has two incomers */
  for(const oid of order){
    const bb=items[oid];
    if(bb.type!==LV_BUSBAR || bb.x!==null || isSubBoard(items,bb)) continue;
    const pxs=bb.parents.map(p=>items[p])
      .filter(p=>[TRANSFORMER].includes(p.type) && p.x!==null)
      .map(p=>p.x);
    if(pxs.length) placeLvBoard(items,order,bb,pxs.reduce((a,b)=>a+b,0)/pxs.length);
  }
  x=placeLvSubs(items,order,x);

  /* step-up chains take an incomer position over the board they feed */
  placeStepUps(items,order);
  placeSuSources(items,order);
  placeTxMotors(items,order);

  /* incomers, step-up columns, generators and feeds from above share one
     spread over each board */
  const sus=stepUps(items,order);
  spreadSupplies(items,order,mvbs.concat(rmus),sus,links);
  x=placeSuMid(items,order,x);
  x=placeLooseBoards(items,order,x);
  shareWayColumn(items,order);
  for(const oid of order){
    const it=items[oid];
    if(it.x===null){
      it.x=x+40;
      if(it.type===LV_BUSBAR||it.type===MV_BUSBAR){ it.xLeft=it.x-85; it.xRight=it.x+85; }
      x+=130;
    }
  }
  /* the cursor only follows the boards placed in a row; a branch placed in
     a slot of its own (an RMU hung under another) can reach further */
  const far=Math.max(0,...Object.values(items).map(t=>t.x).filter(v=>v!==null),
    ...Object.values(items).map(t=>t.xRight).filter(v=>v!==null&&v!==undefined));
  return Math.max(x-BUS_GAP+MARGIN,far+MARGIN,640)+230;
}
function layout(items, order){
  if(order.some(i=>items[i].type===MV_BUSBAR)
     || Math.max(0,...Object.values(mvDepth(items,order)))>0)
    return layoutMvBoards(items,order);
  const busbars=order.map(i=>items[i])
    .filter(t=>t.type===LV_BUSBAR && !isSubBoard(items,t));
  const rmus=order.map(i=>items[i]).filter(t=>t.type===RMU);
  const txs=order.map(i=>items[i]).filter(t=>t.type===TRANSFORMER);
  const mvs=order.map(i=>items[i]).filter(t=>t.type===MV_INCOMER);

  let x=MARGIN;
  for(const bb of busbars){
    const width=lvBoardWidth(items,order,bb);
    placeLvBoard(items,order,bb,x+width/2);
    x=bb.xRight+BUS_GAP;
  }
  /* a transformer feeding no board but motors or MCCs gets its own slot */
  for(const tx of txs){
    const loads=txLoads(items,order,tx);
    if(tx.x===null && loads.length && !childrenOf(items,order,tx.id,[LV_BUSBAR]).length){
      const lw=loads.reduce((a,k)=>a+loadSlot(items,order,k),0);
      placeTxLoads(items,order,tx,x,lw);
      x+=lw+BUS_GAP;
    }
  }
  for(const tx of txs){
    const fed=childrenOf(items,order,tx.id,[LV_BUSBAR]);
    if(!fed.length) continue;
    const siblings=txs.filter(t=>{
      const f2=childrenOf(items,order,t.id,[LV_BUSBAR]);
      return f2.length===fed.length && f2.every((b,i)=>b===fed[i]);
    });
    if(siblings.length>1){
      tx.x=fed[0].x+(siblings.indexOf(tx)-(siblings.length-1)/2)*90;
    } else {
      tx.x=fed.reduce((a,b)=>a+b.x,0)/fed.length;
    }
  }
  placeTxMotors(items,order);
  for(const rmu of rmus){
    /* motor and outgoing ways sit beside the transformer ways, left to
       right; without a slot here they fall to the leftover row at the far
       right and drag their RMU's enclosure across the sheet */
    const waysR=childrenOf(items,order,rmu.id,[PUMP].concat(LV_LOADS))
      .filter(k=>!carriesOn(items,order,k).length);   /* a carrying way shares its load's column */
    const txsR=childrenOf(items,order,rmu.id,[TRANSFORMER]);
    const placed=txsR.filter(k=>k.x!==null).map(k=>k.x);
    if(waysR.length && placed.length){
      let cursor=Math.max(...placed)+TX_R+TX_LABEL_W+PUMP_SLOT/2;
      for(const k of waysR){ k.x=cursor; cursor+=PUMP_SLOT+SLOT_GAP; }
    }
    const kids=txsR.concat(waysR).filter(k=>k.x!==null);
    if(kids.length) rmu.x=kids.reduce((a,k)=>a+k.x,0)/kids.length;
  }
  for(const rmu of rmus){
    if(rmu.x===null){
      const placed=childrenOf(items,order,rmu.id,[RMU]).filter(k=>k.x!==null);
      if(placed.length) rmu.x=placed.reduce((a,k)=>a+k.x,0)/placed.length;
    }
  }
  for(const rmu of rmus){
    if(rmu.x===null) continue;
    const feeds=mvs.filter(m=>childrenOf(items,order,m.id).some(k=>k.id===rmu.id));
    feeds.forEach((m,i)=>{ m.x=rmu.x+(i-(feeds.length-1)/2)*80; });
  }
  for(const m of mvs){
    if(m.x===null){
      const placed=childrenOf(items,order,m.id).filter(k=>k.x!==null);
      if(placed.length) m.x=placed.reduce((a,k)=>a+k.x,0)/placed.length;
    }
  }
  x=placeSuMid(items,order,x);
  x=placeLvSubs(items,order,x);
  x=placeLooseBoards(items,order,x);
  shareWayColumn(items,order);
  for(const oid of order){
    const it=items[oid];
    if(it.x===null){
      it.x=x+40;
      if(it.type===LV_BUSBAR){ it.xLeft=it.x-85; it.xRight=it.x+85; }
      x+=130;
    }
  }
  /* the cursor only follows the boards placed in a row; a branch placed in
     a slot of its own (an RMU hung under another) can reach further */
  const far=Math.max(0,...Object.values(items).map(t=>t.x).filter(v=>v!==null),
    ...Object.values(items).map(t=>t.xRight).filter(v=>v!==null&&v!==undefined));
  return Math.max(x-BUS_GAP+MARGIN,far+MARGIN,640)+230;
}

export { mccLoads, lvKids, subBoardsOf, hangingOf, feederBoard, carriesOn, isSubBoard, boardTx, txLines, txBoard, txLoads, loadSlot, placeLoad, placeTxLoads, lvLevel, lvKidWidth, nSupOf, barLabel, crossingXs, labelX, lvBoardWidth, placeLvBoard, subLevels, slotWidth, ringGroup, mvChildren, mvOwnWidth, mvWidth, placeMvNode, placeOwn, layoutMvBoards, layout };
