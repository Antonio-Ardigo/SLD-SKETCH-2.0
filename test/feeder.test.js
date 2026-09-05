/* The feeder is the way out of a board — a placeholder to hang equipment on.
 *
 * Two things follow, and they are the whole of what this file pins:
 *
 *   a blank Protection cell draws no device, a written one draws
 *     so attaching a motor to a way gives one device on the run, not two.
 *     What counts is whether the surveyor filled the cell in, not whether the
 *     engine recognised the word: "Thermal relay" is a device someone asked
 *     for, drawn with the default glyph (and reported by UNKNOWN_PROT).
 *
 *   a way that carries something is a link, not a symbol
 *     it has no open end and draws no arrow, so it has no symbol geometry for
 *     the checker to find. Constitution §6 still holds — the row must reach
 *     the sheet — so the checker judges it by its group instead, and reads
 *     its edge as board ~ load, naming the way.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { draw } from "../src/core/pipeline.js";
import { normalizeRows } from "../src/core/pipeline.js";
import { buildModel } from "../src/core/model.js";
import { proposeRow } from "../src/core/propose.js";
import { carriesOn, feederBoard } from "../src/core/layout.js";

/** The devices the drawing actually placed, as "owner:kind", legend excluded. */
const devicesOf = out => out.scene.devices.filter(d => d.layer !== "legend" && d.owner).map(d => `${d.owner}:${d.kind}`);
const kindsOn = (out, id) => devicesOf(out).filter(d => d.startsWith(id + ":"));

const board = extra => [
  { id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" },
  { id: "TX1", type: "Transformer", voltage: "11/0.4 kV", prot: "Fuse-switch", from: "MV1" },
  { id: "MSB", type: "LV Busbar", voltage: "400 V", prot: "CB", from: "TX1" },
].concat(extra);

const way = (prot, load) => board([
  { id: "F1", type: "Feeder", desc: "Way", rating: "55 A", voltage: "400 V", prot, from: "MSB" },
].concat(load || []));

const pump = { id: "P1", type: "Pump", desc: "Pump", rating: "37 kW", voltage: "400 V", prot: "Contactor", from: "F1" };

test("a blank Protection draws no device on the way", () => {
  const out = draw({ site: "t" }, way(""), { check: true });
  assert.deepEqual(kindsOn(out, "F1"), [], "nothing was asked for, so nothing is drawn");
  assert.ok(out.check.clean, JSON.stringify(out.check));
});

test("a written Protection draws it, recognised or not", () => {
  for (const [prot, kind] of [["CB", "cb"], ["MCCB", "cb"], ["Fuse", "fuse"], ["LBS", "lbs"], ["Thermal relay", "cb"]]) {
    const out = draw({ site: "t" }, way(prot), { check: true });
    assert.deepEqual(kindsOn(out, "F1"), [`F1:${kind}`], `${prot}: the cell was filled in`);
  }
});

test("a motor on a blank way has exactly one device — the motor's", () => {
  const out = draw({ site: "t" }, way("", pump), { check: true });
  assert.deepEqual(kindsOn(out, "F1"), [], "the way names no device");
  assert.deepEqual(kindsOn(out, "P1"), ["P1:contactor"]);
  assert.ok(out.check.clean, JSON.stringify(out.check));
});

test("a motor on a written way has two, the way's above the motor's", () => {
  const out = draw({ site: "t" }, way("MCCB", pump), { check: true });
  assert.deepEqual(kindsOn(out, "F1"), ["F1:cb"], "the way's own device belongs to the way's row");
  assert.deepEqual(kindsOn(out, "P1"), ["P1:contactor"]);
  const [f] = out.scene.devices.filter(d => d.owner === "F1");
  const [p] = out.scene.devices.filter(d => d.owner === "P1");
  assert.ok(f.y < p.y, `the way's device is upstream of the motor's (${f.y} < ${p.y})`);
  assert.ok(out.check.clean, JSON.stringify(out.check));
});

test("a way that carries something draws no arrow and is not missing", () => {
  const arrows = out => out.scene.ops.filter(o => o.t === "poly" && o.owner === "F1").length;
  assert.equal(arrows(draw({ site: "t" }, way("CB"), {})), 1, "an empty way is an open end: it keeps its arrow");
  const carried = draw({ site: "t" }, way("CB", pump), { check: true });
  assert.equal(arrows(carried), 0, "a way with a motor on it is not an open end");
  assert.deepEqual(carried.check.items.missing, [],
    "no arrow means no symbol geometry — the checker must judge the way by its group instead");
  assert.ok(carried.check.items.total >= 5 && carried.scene.groups.some(g => g.id === "F1"),
    "the row still reached the sheet");
});

test("the checker reads the edge as board ~ load, naming the way", () => {
  const out = draw({ site: "t" }, way("CB", pump), { check: true });
  assert.deepEqual(out.check.edges.disconnected, []);
  assert.deepEqual(out.check.edges.via, []);
  assert.equal(out.check.edges.connected, out.check.edges.total);
});

test("a pump, an MCC, a transformer and a sub-board all hang on a way", () => {
  for (const load of [
    [{ id: "X1", type: "Pump", rating: "37 kW", voltage: "400 V", prot: "Contactor", from: "F1" }],
    [{ id: "X1", type: "MCC", rating: "250 A", voltage: "400 V", prot: "CB", from: "F1" }],
    [{ id: "X1", type: "Transformer", voltage: "400/230 V", prot: "CB", from: "F1" },
     { id: "X2", type: "Pump", rating: "5 kW", voltage: "230 V", prot: "Contactor", from: "X1" }],
    [{ id: "X1", type: "LV Busbar", rating: "250 A", voltage: "400 V", prot: "MCCB", from: "F1" }],
  ]) {
    const what = load[0].type;
    const out = draw({ site: "t" }, way("MCCB", load), { check: true });
    assert.deepEqual(out.check.items.missing, [], what);
    assert.deepEqual(out.check.edges.disconnected, [], what);
    assert.deepEqual(out.warnings, [], `${what}: a way is an ordinary place to hang one`);
  }
});

/* A way is a way on either side of the transformer. What decides whether it
   terminates is not which board it leaves — it is whether anything is named
   on it. An MV outgoing cable to a farm carries nothing, so it keeps its
   arrow; five fixtures in the pool are exactly that and must not move. */
test("an MV way that carries nothing is a cable, and keeps its arrow", () => {
  for (const board of [
    { id: "B", type: "RMU", voltage: "11 kV", prot: "LBS", from: "MV1" },
    { id: "B", type: "MV Busbar", voltage: "11 kV", prot: "CB", from: "MV1" },
  ]) {
    const out = draw({ site: "t" }, [
      { id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" },
      board,
      { id: "OUT", type: "Feeder", desc: "Cable to farm", voltage: "11 kV", prot: "", from: "B" },
    ], { check: true });
    assert.equal(feederBoard(out.items, out.items.OUT).id, "B", board.type);
    assert.deepEqual(carriesOn(out.items, out.order, out.items.OUT), [], board.type);
    assert.equal(out.scene.ops.filter(o => o.t === "poly" && o.owner === "OUT").length, 1, board.type);
    assert.deepEqual(out.check.items.missing, [], board.type);
  }
});

test("a proposed feeder arrives blank, so the first thing hung on it is the device", () => {
  const { items, order } = buildModel(normalizeRows(way("")));
  const r = proposeRow(items, order, { type: "Feeder", targetId: "MSB" });
  assert.equal(r.prot, "", "a placeholder starts without a device");
  assert.equal(r.from, "MSB");
});

test("a sub-board run still draws both devices, and each belongs to its row", () => {
  const out = draw({ site: "t" }, way("MCCB", [
    { id: "DB1", type: "LV Busbar", rating: "250 A", voltage: "400 V", prot: "MCCB", from: "F1" },
  ]), { check: true });
  assert.deepEqual(kindsOn(out, "F1"), ["F1:cb"], "the way's outgoing");
  assert.deepEqual(kindsOn(out, "DB1"), ["DB1:cb"], "the board's incoming");
  assert.deepEqual(out.scene.devices.filter(d => d.layer !== "legend" && !d.owner), [],
    "no device on the drawing is left without a row to answer for it");
  assert.ok(out.check.clean, JSON.stringify(out.check));
});

/* ---------------------------------------------------------------- MV ways
 *
 * A way is a way on either side of the transformer. `feederBoard` used to
 * answer only for an LV board or an MCC, so a way out of an MV switchboard
 * was a terminating cable and nothing else: a transformer named on one was
 * given no slot, landed in the leftover column past the end of the sheet,
 * drew no conductor at all and said "supply not defined" — with nothing
 * reported anywhere.
 */
const mvBoard = extra => [
  { id: "MV1", type: "MV Incomer", voltage: "33 kV", from: "" },
  { id: "MVB", type: "MV Busbar", rating: "1250 A", voltage: "33 kV", prot: "CB", from: "MV1" },
].concat(extra);
const mvWay = (prot, load) => mvBoard([
  { id: "W1", type: "Feeder", desc: "Way", rating: "630 A", voltage: "33 kV", prot, from: "MVB" },
].concat(load || []));

test("a way out of an MV board carries what is named on it", () => {
  for (const load of [
    [{ id: "X1", type: "Transformer", voltage: "33/0.4 kV", prot: "CB", from: "W1" },
     { id: "X2", type: "LV Busbar", rating: "800 A", voltage: "400 V", prot: "CB", from: "X1" }],
    [{ id: "X1", type: "Pump", rating: "500 kW", voltage: "33 kV", prot: "Fuse-contactor", from: "W1" }],
    [{ id: "X1", type: "MCC", rating: "400 A", voltage: "400 V", prot: "CB", from: "W1" }],
  ]) {
    const what = load[0].type;
    const out = draw({ site: "t" }, mvWay("CB", load), { check: true });
    assert.deepEqual(out.check.items.missing, [], what);
    assert.deepEqual(out.check.edges.disconnected, [], what);
    assert.equal(out.items.X1.x, out.items.W1.x, `${what}: it stands in the way's own column`);
    assert.equal(out.scene.ops.filter(o => o.t === "poly" && o.owner === "W1").length, 0,
      `${what}: the way is no longer an open end, so it draws no arrow`);
  }
});

test("the way's device and the transformer's are both drawn, on one run", () => {
  const out = draw({ site: "t" }, mvWay("CB", [
    { id: "X1", type: "Transformer", voltage: "33/0.4 kV", prot: "CB", from: "W1" },
    { id: "X2", type: "LV Busbar", rating: "800 A", voltage: "400 V", prot: "CB", from: "X1" },
  ]), { check: true });
  assert.deepEqual(kindsOn(out, "W1"), ["W1:cb"], "the way's own");
  const [w] = out.scene.devices.filter(d => d.owner === "W1");
  const [x] = out.scene.devices.filter(d => d.owner === "X1");
  assert.ok(w.y < x.y, `the way's device is upstream of the transformer's (${w.y} < ${x.y})`);
  assert.ok(out.check.clean, JSON.stringify(out.check));
});

test("a blank way on an MV board leaves the transformer's device the only one", () => {
  /* a transformer carries one device per side — its incoming from the way and
     its outgoing into the board it feeds — so what the way's blank cell
     changes is the count on the run above it, not X1's own */
  const run = prot => {
    const out = draw({ site: "t" }, mvWay(prot, [
      { id: "X1", type: "Transformer", voltage: "33/0.4 kV", prot: "CB", from: "W1" },
      { id: "X2", type: "LV Busbar", rating: "800 A", voltage: "400 V", prot: "CB", from: "X1" },
    ]), { check: true });
    assert.ok(out.check.clean, prot + " " + JSON.stringify(out.check));
    const top = out.scene.ops.find(o => o.t === "circle" && o.owner === "X1").y;
    return { ways: kindsOn(out, "W1"),
      above: out.scene.devices.filter(d => d.layer !== "legend" && d.y < top).map(d => `${d.owner}:${d.kind}`) };
  };
  const blank = run(""), written = run("CB");
  assert.deepEqual(blank.ways, [], "nothing was asked for on the way");
  assert.deepEqual(blank.above, ["MV1:cb", "X1:cb"],
    "one device between the bar and the transformer: the transformer's own");
  assert.deepEqual(written.ways, ["W1:cb"]);
  assert.deepEqual(written.above, ["MV1:cb", "X1:cb", "W1:cb"],
    "a written cell adds the way's, above it");
});

test("an MV motor on a way stays in the transformer row", () => {
  const onBar = draw({ site: "t" }, mvBoard([
    { id: "X1", type: "Pump", rating: "500 kW", voltage: "33 kV", prot: "Fuse-contactor", from: "MVB" },
  ]), {});
  const onWay = draw({ site: "t" }, mvWay("CB", [
    { id: "X1", type: "Pump", rating: "500 kW", voltage: "33 kV", prot: "Fuse-contactor", from: "W1" },
  ]), {});
  const circle = out => out.scene.ops.find(o => o.t === "circle" && o.owner === "X1");
  assert.equal(circle(onWay).y, circle(onBar).y,
    "a way does not move a motor to another row");
  assert.equal(circle(onWay).r, circle(onBar).r, "nor shrink it to an LV one");
});

test("an RMU way hands over a bare conductor: the device is in the enclosure", () => {
  const out = draw({ site: "t" }, [
    { id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" },
    { id: "R1", type: "RMU", rating: "630 A", voltage: "11 kV", prot: "LBS", from: "MV1" },
    { id: "W1", type: "Feeder", desc: "Way", voltage: "11 kV", prot: "Fuse-switch", from: "R1" },
    { id: "X1", type: "Transformer", voltage: "11/0.4 kV", prot: "CB", from: "W1" },
    { id: "X2", type: "LV Busbar", rating: "800 A", voltage: "400 V", prot: "CB", from: "X1" },
  ], { check: true });
  assert.deepEqual(kindsOn(out, "W1"), [],
    "the RMU already drew the way's switch inside the box — a second one would be the same switch twice");
  assert.ok(kindsOn(out, "R1").includes("R1:fuse-switch"), JSON.stringify(devicesOf(out)));
  assert.equal(out.items.X1.x, out.items.W1.x);
  assert.ok(out.check.clean, JSON.stringify(out.check));
});

test("a row on a way that is not a way of any board is named, not left silent", () => {
  const out = draw({ site: "t" }, [
    { id: "MV1", type: "MV Incomer", voltage: "11 kV", from: "" },
    { id: "TX1", type: "Transformer", voltage: "11/0.4 kV", prot: "CB", from: "MV1" },
    { id: "BB1", type: "LV Busbar", voltage: "400 V", prot: "CB", from: "TX1" },
    { id: "P3", type: "Pump", rating: "30 kW", voltage: "400 V", prot: "CB", from: "BB1" },
    { id: "FP", type: "Feeder", desc: "Off a motor", voltage: "400 V", prot: "", from: "P3" },
    { id: "X9", type: "Transformer", voltage: "400/230 V", prot: "CB", from: "FP" },
  ], { check: true });
  const named = new Set(out.diagnostics.flatMap(d => d.ids || []));
  assert.ok(named.has("X9"), "the carried row is named: " + JSON.stringify(out.warnings));
  assert.ok(out.diagnostics.some(d => d.code === "WAY_NOT_ON_BOARD" && d.ids.includes("X9")));
  /* every row the checker could not connect is named by some message (§6) */
  for (const e of out.check.edges.disconnected)
    assert.ok(e.split(/ -> | ~ /).some(t => named.has(t.replace(/ \(.*\)$/, ""))), e);
});
