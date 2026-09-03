/* Bus couplers never rank: a coupler is a link between two busbars of the
 * same kind (or a changeover between a board and a generator). Anything
 * else cannot be drawn and is recorded as invalid. */
import { BUS_COUPLER, LV_BUSBAR, MV_BUSBAR, GENERATOR, RMU } from "../types.js";

export default {
  name: "couplers",
  apply(ctx) {
    const { items, order } = ctx;
    const out = [], seenPairs = new Map();
    for (const id of order) {
      const bc = items[id];
      if (bc.type !== BUS_COUPLER) continue;
      const ends = bc.parents.map(p => items[p]).filter(Boolean);
      const gen = ends.find(e => e.type === GENERATOR);
      if (gen) {
        const board = ends.find(e => [LV_BUSBAR, MV_BUSBAR, RMU].includes(e.type));
        out.push({ id, kind: "changeover", a: board ? board.id : null, b: gen.id, valid: !!board });
        ctx.tag(id, "changeover");
        continue;
      }
      const bars = ends.filter(e => e.type === LV_BUSBAR || e.type === MV_BUSBAR);
      const valid = bars.length === 2 && bars[0].type === bars[1].type && bc.parents.length === 2;
      const rec = { id, kind: "tie", a: bars[0] ? bars[0].id : null, b: bars[1] ? bars[1].id : null, valid,
        reason: valid ? null : ends.some(e => e.type === RMU) ? "rmu-end" : bars.length !== 2 ? "not-two-busbars" : "mixed-kinds" };
      if (valid) {
        const key = [rec.a, rec.b].sort().join("|");
        rec.duplicate = seenPairs.has(key);
        seenPairs.set(key, id);
        ctx.tag(id, rec.duplicate ? "coupler-dup" : "coupler");
      } else ctx.tag(id, "coupler-invalid");
      out.push(rec);
    }
    ctx.facts.couplers = out;
  },
};
