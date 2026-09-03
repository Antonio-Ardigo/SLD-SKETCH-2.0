/* What supplies every board, and which rows no supply reaches. */
import { LV_BUSBAR, MV_BUSBAR, RMU, MCC, MV_INCOMER, GENERATOR, TRANSFORMER, FEEDER, BUS_COUPLER } from "../types.js";

export default {
  name: "supplies",
  apply(ctx) {
    const { items, order, graph } = ctx;
    const supplies = {};
    for (const id of order) {
      const it = items[id];
      if (![LV_BUSBAR, MV_BUSBAR, RMU, MCC].includes(it.type)) continue;
      supplies[id] = it.parents.filter(p => items[p]).map(p => {
        const par = items[p];
        const via = par.type === TRANSFORMER || par.type === FEEDER ? p : null;
        const src = via ? (par.parents[0] || null) : p;
        return { id: src, via, kind: par.type, prot: (graph.in.get(id).find(e => e.from === p) || {}).prot?.[1] || null };
      });
    }
    /* a changeover adds the generator as a supply of the board */
    for (const id of order) {
      const bc = items[id];
      if (bc.type !== BUS_COUPLER) continue;
      const gen = bc.parents.map(p => items[p]).find(e => e && e.type === GENERATOR);
      const board = bc.parents.map(p => items[p]).find(e => e && [LV_BUSBAR, MV_BUSBAR, RMU].includes(e.type));
      if (gen && board && supplies[board.id]) supplies[board.id].push({ id: gen.id, via: id, kind: BUS_COUPLER, prot: null });
    }
    ctx.facts.supplies = supplies;

    for (const id of ctx.facts.floating) ctx.tag(id, "floating");
    void MV_INCOMER;
  },
};
