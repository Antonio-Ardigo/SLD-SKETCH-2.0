/* Which way every transformer is drawn, from Feeds From alone:
 *   levelLink   joins two MV boards / RMUs on different rows
 *   column      step-up column: source on top, then the transformer, then MV gear
 *   inRow       step-up from a live LV board: board below, MV gear above
 *   reversed    hung under MV gear with a generator as its load: drawn upside down
 *   lvLink      between two LV boards on the LV row
 *   underBoard  off an LV board feeding only motors (or nothing yet): a way of the board
 *   earthing    an earthing transformer / NER: ends in a resistor to earth
 *   dedicated   feeds no board, loads hang straight under it
 *   down        the ordinary step-down into an LV board                        */
import { TRANSFORMER, LV_BUSBAR, earthBelow } from "../types.js";
import { boardTx, txBoard, txLoads } from "../layout.js";
import { childrenOf } from "../model.js";

export default {
  name: "tx-direction",
  apply(ctx) {
    const { items, order, legacy } = ctx;
    const linkIds = new Set(legacy.links.map(([, tx]) => tx.id));
    const out = {};
    for (const id of order) {
      const tx = items[id];
      if (tx.type !== TRANSFORMER) continue;
      let cls = "down";
      if (linkIds.has(id)) cls = "levelLink";
      else if (id in legacy.sus) cls = "column";
      else if (id in legacy.mid) cls = "inRow";
      else if (legacy.genBelow(tx)) cls = "reversed";
      else if (id in legacy.lvsubs) cls = "lvLink";
      else if (boardTx(items, tx)) cls = "underBoard";
      else if (earthBelow(items, tx)) cls = "earthing";
      else if (!txBoard(items, tx) && txLoads(items, order, tx).length) cls = "dedicated";
      const from = tx.parents.slice();
      const to = childrenOf(items, order, id).map(k => k.id);
      out[id] = { class: cls, from, to };
      ctx.tag(id, "tx:" + cls);
      if (cls === "down" && !txBoard(items, tx) && !to.length) ctx.tag(id, "open-outgoing");
      if (!from.length) ctx.tag(id, "open-supply");
    }
    ctx.facts.txDir = out;
    /* loads named on a transformer that feeds a board are ways of that board */
    ctx.facts.waysOfBoard = {};
    for (const id of order) {
      const it = items[id];
      if (!["pump", "mcc"].includes(it.type)) continue;
      for (const p of it.parents) {
        const par = items[p];
        if (par && par.type === TRANSFORMER) { const b = txBoard(items, par); if (b) ctx.facts.waysOfBoard[id] = b.id; }
      }
    }
    void LV_BUSBAR;
  },
};
