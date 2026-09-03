/* The LV rows. Every LV board that is not a sub-board shares one row, below
 * the whole MV distribution ("@lv", a pseudo node the solver ranks and the
 * band layer drops). A board fed from a feeder or from another LV board is a
 * sub-board one row below its supply board; an MCC with ways of its own gets
 * a bus one row below the board it hangs from (below the LV row when it hangs
 * from a lone transformer). An LV board that is the source of a step-up
 * column is not on the LV row: it stands on top (sources.js). */
import { MV_BUSBAR, RMU, LV_BUSBAR, MCC, FEEDER, TRANSFORMER } from "../types.js";
import { mccLoads, txBoard } from "../layout.js";

export const LV_ROW = "@lv";

export default {
  name: "lv-rows",
  apply(ctx) {
    const { items, order } = ctx;
    const sources = new Set(ctx.facts.sources || []);
    ctx.ranked.add(LV_ROW);
    for (const id of order) if ([MV_BUSBAR, RMU].includes(items[id].type) || sources.has(id)) ctx.below(LV_ROW, id, 1);

    const boardLike = id => items[id].type === LV_BUSBAR || (items[id].type === MCC && mccLoads(items, order, items[id]).length);
    ctx.facts.subBoards = {};
    for (const id of order) {
      if (!boardLike(id) || sources.has(id)) continue;
      ctx.ranked.add(id);
      const it = items[id];
      let sub = false;
      for (const p of it.parents) {
        const par = items[p];
        if (!par) continue;
        if (par.type === LV_BUSBAR || par.type === MCC) { ctx.below(id, p, 1); sub = true; ctx.facts.subBoards[id] = { via: p }; }
        else if (par.type === FEEDER) {
          const pb = par.parents.map(q => items[q]).find(o => o && o.type === LV_BUSBAR);
          if (pb) { ctx.below(id, pb.id, 1); sub = true; ctx.facts.subBoards[id] = { via: p, board: pb.id }; }
        } else if (par.type === TRANSFORMER && it.type === MCC) {
          const b = txBoard(items, par);
          if (b) { ctx.below(id, b.id, 1); sub = true; }
          else { ctx.below(id, LV_ROW, 1); sub = true; ctx.tag(id, "mcc-as-board"); }
        }
      }
      if (sub) ctx.tag(id, "sub-board");
      else { ctx.same(id, LV_ROW); ctx.tag(id, "lv-row"); }
      /* a board no supply reaches still draws, no higher than the LV row */
      if (ctx.facts.floating.includes(id)) ctx.below(id, LV_ROW, 0);
    }
  },
};
