/* Constitution §2: "Protection chooses the device drawn on the item's supply
 * side, one entry per supply, in Feeds From order."
 *
 * A transformer hung straight on an MV incomer used to be the one supply where
 * that was not true. The reader took the Protection column, the model carried
 * it, `protFor` returned it — and the drawing ran a bare conductor from the
 * incomer to the transformer and never asked. Written, understood, and thrown
 * away without a word. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { draw } from "../src/core/pipeline.js";
import { listCases, loadCase, drawCase } from "../tools/lib/cases.mjs";

/** The devices the drawing actually placed, as "owner:kind", legend excluded. */
const devicesOf = out => out.scene.devices.filter(d => d.layer !== "legend" && d.owner).map(d => `${d.owner}:${d.kind}`);

const onIncomer = prot => [
  { id: "MV1", type: "MV Incomer", desc: "Utility", voltage: "11 kV", from: "" },
  { id: "TX1", type: "Transformer", rating: "1000 kVA", voltage: "11/0.4 kV", prot, from: "MV1" },
  { id: "BB1", type: "LV Busbar", voltage: "400 V", prot: "CB", from: "TX1" },
];

test("a transformer on an incomer draws the device its Protection names", () => {
  for (const [prot, kind] of [["Fuse-switch", "fuse-switch"], ["CB", "cb"], ["LBS", "lbs"], ["Fuse", "fuse"]]) {
    const out = draw({ site: "t" }, onIncomer(prot), { check: true });
    assert.ok(devicesOf(out).includes(`MV1:${kind}`), `${prot}: expected a ${kind} on the run from the incomer, got ${JSON.stringify(devicesOf(out))}`);
    assert.deepEqual(out.check.items.missing, [], prot);
    assert.equal(out.check.edges.connected, out.check.edges.total, `${prot}: the device must not break the conductor`);
  }
});

test("an empty Protection still draws a bare conductor, inventing nothing", () => {
  const out = draw({ site: "t" }, onIncomer(""), { check: true });
  assert.deepEqual(devicesOf(out).filter(d => d.startsWith("MV1:")), [],
    "there is no board here to make a way of: an unwritten device is not drawn");
  assert.equal(out.check.edges.connected, out.check.edges.total);
});

test("two transformers on one incomer each get their own device", () => {
  const out = draw({ site: "t" }, [
    { id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" },
    { id: "TX1", type: "Transformer", voltage: "11/0.4 kV", prot: "Fuse-switch", from: "MV1" },
    { id: "TX2", type: "Transformer", voltage: "11/0.4 kV", prot: "LBS", from: "MV1" },
    { id: "BB1", type: "LV Busbar", voltage: "400 V", prot: "CB", from: "TX1" },
    { id: "BB2", type: "LV Busbar", voltage: "400 V", prot: "CB", from: "TX2" },
  ], { check: true });
  const on = devicesOf(out).filter(d => d.startsWith("MV1:")).sort();
  assert.deepEqual(on, ["MV1:fuse-switch", "MV1:lbs"], "each run carries the device its own row named");
  assert.deepEqual(out.check.items.missing, []);
});

test("the other ways a transformer is supplied were already right", () => {
  /* the regression guard: these paths drew the device before the fix and must
     go on doing so, from the same Protection column */
  const viaBoard = draw({ site: "t" }, [
    { id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" },
    { id: "MVB", type: "MV Busbar", voltage: "11 kV", prot: "CB", from: "MV1" },
    { id: "TX1", type: "Transformer", voltage: "11/0.4 kV", prot: "Fuse-switch", from: "MVB" },
    { id: "BB1", type: "LV Busbar", voltage: "400 V", prot: "CB", from: "TX1" },
  ], { check: true });
  assert.ok(devicesOf(viaBoard).includes("TX1:fuse-switch"), JSON.stringify(devicesOf(viaBoard)));

  const viaRmu = draw({ site: "t" }, [
    { id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" },
    { id: "RMU1", type: "RMU", voltage: "11 kV", prot: "LBS", from: "MV1" },
    { id: "TX1", type: "Transformer", voltage: "11/0.4 kV", prot: "Fuse-switch", from: "RMU1" },
    { id: "BB1", type: "LV Busbar", voltage: "400 V", prot: "CB", from: "TX1" },
  ], { check: true });
  assert.ok(devicesOf(viaRmu).includes("RMU1:fuse-switch"), "the RMU way carries it: " + JSON.stringify(devicesOf(viaRmu)));
});

test("every Protection written anywhere in the pool reaches the drawing", () => {
  /* the general form of the bug: a device named on a row that resolves to a
     supply, and no device of that kind anywhere on the sheet */
  const KIND = { cb: 1, lbs: 1, fuse: 1, "fuse-switch": 1, contactor: 1, "fuse-contactor": 1 };
  for (const dir of listCases()) {
    const c = loadCase(dir);
    if (!c.rows.length) continue;
    const out = drawCase(c, { check: true });
    if (!out.svg) continue;
    const drawn = new Set(out.scene.devices.filter(d => d.layer !== "legend").map(d => d.kind));
    for (const id of out.order) {
      const it = out.items[id];
      if (!it.parents.length || !it.prots.length) continue;
      for (const raw of it.prots) {
        const kind = (out.items[id].prots.length ? raw : "").trim().toLowerCase().replace(/\s+/g, " ");
        const canon = { "circuit breaker": "cb", breaker: "cb", acb: "cb", mccb: "cb", mcb: "cb", vcb: "cb",
          "load break switch": "lbs", isolator: "lbs", switch: "lbs", disconnector: "lbs", fuses: "fuse",
          "fuse switch": "fuse-switch", "switch-fuse": "fuse-switch", "switch fuse": "fuse-switch", sfu: "fuse-switch",
          "vacuum contactor": "contactor", "fuse contactor": "fuse-contactor", "fused contactor": "fuse-contactor",
          starter: "fuse-contactor", "motor starter": "fuse-contactor" }[kind] || kind;
        if (!KIND[canon]) continue;                    /* a note, not a device */
        assert.ok(drawn.has(canon),
          `${c.data.group}/${c.data.name}: "${id}" names ${raw} but no ${canon} is drawn on the sheet`);
      }
    }
  }
});
