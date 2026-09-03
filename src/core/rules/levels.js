/* MV cascade: whatever feeds a board is drawn above it.
 *   board fed from an MV busbar            → one row below it
 *   board fed through a transformer from MV gear → one row below that gear (a level link)
 *   RMU fed from an RMU                    → the ring rule decides (rings.js) */
import { MV_BUSBAR, RMU, TRANSFORMER } from "../types.js";

export default {
  name: "levels",
  apply(ctx) {
    const { items, order } = ctx;
    for (const id of order) {
      const it = items[id];
      if (![MV_BUSBAR, RMU].includes(it.type)) continue;
      ctx.ranked.add(id);
      for (const p of it.parents) {
        const par = items[p];
        if (!par) continue;
        if (par.type === MV_BUSBAR) { ctx.below(id, p, 1); ctx.tag(id, "cascade"); }
        else if (par.type === TRANSFORMER) {
          for (const pp of par.parents) {
            if (items[pp] && [MV_BUSBAR, RMU].includes(items[pp].type)) {
              ctx.below(id, pp, 1); ctx.tag(id, "level-link"); ctx.tag(p, "level-link");
            }
          }
        }
      }
    }
  },
};
