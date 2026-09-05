/* Words on a motor row that put a starter box on its drop: VSD / VFD / drive
 * draw the drive box; soft starter / soft start draw the Soft S. box in the
 * same place; a row that says both gets the drive. The word is read from
 * Description and Notes, never from Protection, and it changes no geometry
 * but the box: the device the Protection cell names is drawn above it as
 * before. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { draw } from "../src/core/pipeline.js";

const sheet = pump => [
  { id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" },
  { id: "TX1", type: "Transformer", voltage: "11/0.4 kV", prot: "Fuse-switch", from: "MV1" },
  { id: "MSB", type: "LV Busbar", voltage: "400 V", prot: "CB", from: "TX1" },
  { id: "MCC1", type: "MCC", voltage: "400 V", prot: "CB", from: "MSB" },
  { id: "P1", type: "Pump", rating: "37 kW", voltage: "400 V", prot: "Fused contactor", from: "MCC1", ...pump },
];
const boxes = out => out.scene.devices.filter(d => d.owner === "P1" && ["vsd", "softstart"].includes(d.kind)).map(d => d.kind);
const run = pump => draw({ site: "t" }, sheet(pump), { check: true });

test("soft starter in Notes or Description draws the Soft S. box where the drive box goes", () => {
  for (const pump of [{ notes: "Soft starter" }, { desc: "Sewage pump 1 (soft start)" }, { notes: "soft-starter" }, { notes: "Softstarter fitted" }]) {
    const out = run(pump);
    assert.deepEqual(boxes(out), ["softstart"], JSON.stringify(pump));
    assert.ok(out.svg.includes(">Soft S.<"), "the box reads Soft S.");
    assert.equal(out.errors.length + out.warnings.length, 0, JSON.stringify(out.diagnostics));
  }
  /* the same place as the drive: one box swaps for the other, nothing else moves */
  const soft = run({ notes: "Soft starter" }), vsd = run({ notes: "VSD" });
  const at = out => out.scene.devices.find(d => d.owner === "P1" && ["vsd", "softstart"].includes(d.kind));
  assert.deepEqual([at(soft).x, at(soft).y], [at(vsd).x, at(vsd).y]);
  assert.deepEqual(boxes(vsd), ["vsd"]);
  /* the device the Protection cell names is still drawn above it */
  assert.ok(soft.scene.devices.some(d => d.owner === "P1" && d.kind === "fuse-contactor"));
});

test("a plain motor has no box, a row that says both gets the drive, and Protection is not where the word is read", () => {
  assert.deepEqual(boxes(run({})), []);
  assert.deepEqual(boxes(run({ notes: "VSD, soft start bypass" })), ["vsd"]);
  /* "soft starter" written as the Protection is a device the reader does not know — unchanged here */
  const asProt = run({ prot: "Soft starter" });
  assert.deepEqual(boxes(asProt), []);
  assert.ok(asProt.diagnostics.some(d => d.code === "UNKNOWN_PROT"), JSON.stringify(asProt.diagnostics));
});
