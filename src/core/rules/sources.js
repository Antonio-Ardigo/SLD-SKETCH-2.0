/* Generation feeding MV gear through a step-up transformer is drawn as a
 * column on top: source, transformer, then the board. The source row sits
 * above the whole MV distribution, so every MV board nothing feeds from
 * above moves one row down when such a column exists. */
import { MV_BUSBAR, RMU, TRANSFORMER } from "../types.js";
import { childrenOf } from "../model.js";

export default {
  name: "sources",
  apply(ctx) {
    const { items, order, legacy } = ctx;
    const sus = legacy.sus;                       /* step-up tx id → source item (or null) */
    const sourceIds = [];
    for (const txId of Object.keys(sus)) {
      const src = sus[txId];
      ctx.tag(txId, "step-up-column");
      if (!src) continue;
      ctx.ranked.add(src.id); ctx.tag(src.id, "source");
      sourceIds.push(src.id);
      for (const fed of childrenOf(items, order, txId, [MV_BUSBAR, RMU])) ctx.below(fed.id, src.id, 1);
    }
    ctx.facts.sources = sourceIds;
    if (!sourceIds.length) return;
    /* sources on top: every MV board that has no MV supply above it starts below the source row */
    for (const id of order) {
      const it = items[id];
      if (![MV_BUSBAR, RMU].includes(it.type)) continue;
      const fedFromAbove = it.parents.some(p => items[p] && ([MV_BUSBAR, RMU].includes(items[p].type)
        || (items[p].type === TRANSFORMER && items[p].parents.some(q => items[q] && [MV_BUSBAR, RMU].includes(items[q].type)))));
      if (!fedFromAbove) for (const s of sourceIds) ctx.below(id, s, 1);
    }
  },
};
