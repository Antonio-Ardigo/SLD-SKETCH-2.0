#!/usr/bin/env node
/* The entry baseline: how many actions a surveyor spends on the common tasks,
 * and what the page does when the topology goes wrong — measured, not argued.
 *
 * Each task is replayed in the page under headless Chromium the way a surveyor
 * would do it, and every gesture is counted. One action is one click, one
 * drag, one choice in a select, one shortcut or navigation key, or one value
 * entered — typing a value counts 1 whatever its length, because the letters
 * are not overhead. Steps outside the page (saving a file to import) are
 * counted at a fixed 3. The result records, per task, whether a drawing was on
 * screen at the end (fresh / stale / none) and whether an export was possible.
 *
 *   node tools/usage-baseline.mjs            # replay and write testdata/usage/baseline.json
 *   node tools/usage-baseline.mjs --check    # replay and exit 1 on any difference from the file
 *
 * A difference is a difference either way: an improvement lands by updating the
 * file it beats, and a regression is caught before it lands. Needs no npm
 * packages. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/cases.mjs";
import { openPage, sleep } from "./lib/headless.mjs";

const OUT = path.join(ROOT, "testdata", "usage", "baseline.json");
const CHECK = process.argv.includes("--check");
const OUTSIDE_THE_PAGE = 3;    /* save-as in another program: dialog, name, save */

const pg = await openPage();
const { evaluate } = pg;
const settle = () => sleep(400);   /* the page redraws 250 ms after the last edit */

/* ---------------------------------------------------------------- gestures, each one action */
let actions = 0;
const act = async (expr) => { actions++; await evaluate(expr); };
const q = s => JSON.stringify(s);
const cell = (i, f) => `document.querySelector('tr[data-i="${i}"] [data-f="${f}"]')`;
const gestures = {
  /* focus a cell and press a key */
  key: (i, f, key, mods = {}) => act(`(function(){ const el=${cell(i, f)}; el.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
    el.dispatchEvent(new KeyboardEvent('keydown',{key:${q(key)},bubbles:true,...${q(mods)}})); })()`),
  /* enter one value into a cell (the whole value is one action) */
  type: (i, f, value) => act(`(function(){ const el=${cell(i, f)}; el.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
    el.value=${q(value)}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()`),
  /* choose in the Type select */
  pick: (i, value) => act(`(function(){ const s=${cell(i, "type")}; s.value=${q(value)};
    s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); })()`),
  /* press a button in the page */
  click: (selector) => act(`document.querySelector(${q(selector)}).click()`),
  /* drag a palette chip onto a symbol */
  drop: (type, targetId) => act(`addRowFor(${q(type)}, ${q(targetId)})`),
  /* click a symbol on the drawing (selects and focuses its row) */
  clickSymbol: (id) => act(`(function(){ selectId(${q(id)}); const i=rowIndexOf(${q(id)}); if(i>=0) flashRow(i); })()`),
  /* click a line in the problems box (jumps to its row) */
  clickProblem: (n) => act(`(function(){ const d=document.querySelectorAll('#problems div[data-row]')[${n}]; if(d) d.click(); })()`),
  /* a row's own buttons */
  rowButton: (i, op) => act(`document.querySelector('tr[data-i="${i}"] button[data-op="${op}"]').click()`),
  /* a file made elsewhere, then Import…, then the file picker */
  importCsv: async (csv, name) => { actions += OUTSIDE_THE_PAGE; await act(`1`); await act(`importFile(new File([${q(csv)}], ${q(name)}, {type:'text/csv'}))`); },
};

/* ---------------------------------------------------------------- what the page shows afterwards */
async function state() {
  return evaluate(`(function(){
    const errs=document.querySelectorAll('#problems .err').length, warns=document.querySelectorAll('#problems .warn').length;
    const sheet=document.querySelector('#sheet'), svg=!!sheet.querySelector('svg');
    /* the page stamps the drawing with the table it was made from */
    return { errors: errs, warnings: warns,
      drawing: !svg ? "none" : (sheet.dataset.rev===modelRev() ? "fresh" : "stale"),
      export: currentSheet()!==null, rows: state.rows.length };
  })()`);
}
async function loadPreset(n) {
  await evaluate(`(function(){ const p=document.querySelector('#preset'); p.value=${q(String(n))}; p.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await settle();
}
async function loadRows(rows) {
  await evaluate(`(function(){ state.rows=${q(rows)}.map(r=>R(r.id,r.type,r.desc||"",r.rating||"",r.voltage||"",r.from||"",r.notes||"",r.prot||"")); rebuildTable(); redraw(); })()`);
  await settle();
}
const rowIndex = id => evaluate(`rowIndexOf(${q(id)})`);
const last = () => evaluate(`state.rows.length-1`);
const rowsWhere = expr => evaluate(`state.rows.filter(r=>${expr}).length`);

/* two LV boards under one MV board: the sheet several tasks start from */
const TWIN = [
  { id: "MV1", type: "MV Incomer", desc: "Utility", voltage: "11 kV" },
  { id: "MVB1", type: "MV Busbar", desc: "MV board", rating: "1250 A", voltage: "11 kV", prot: "CB", from: "MV1" },
  { id: "TX1", type: "Transformer", desc: "Tx A", rating: "1000 kVA", voltage: "11/0.4 kV", prot: "CB", from: "MVB1" },
  { id: "TX2", type: "Transformer", desc: "Tx B", rating: "1000 kVA", voltage: "11/0.4 kV", prot: "CB", from: "MVB1" },
  { id: "BB1", type: "LV Busbar", desc: "Board A", rating: "1600 A", voltage: "400 V", prot: "CB", from: "TX1" },
  { id: "BB2", type: "LV Busbar", desc: "Board B", rating: "1600 A", voltage: "400 V", prot: "CB", from: "TX2" },
  { id: "F1", type: "Feeder", desc: "Lighting", rating: "100 A", voltage: "400 V", prot: "CB", from: "BB1" },
  { id: "F2", type: "Feeder", desc: "Small power", rating: "160 A", voltage: "400 V", prot: "CB", from: "BB1" },
  { id: "F3", type: "Feeder", desc: "HVAC", rating: "250 A", voltage: "400 V", prot: "CB", from: "BB2" },
];

/* ---------------------------------------------------------------- the tasks */
const result = {};
async function task(name, fn) {
  actions = 0;
  const extra = (await fn()) || {};
  const s = await state();
  result[name] = { actions, drawing: s.drawing, export: s.export, ...extra };
  console.log(`${name.padEnd(30)} actions ${String(actions).padStart(2)}   drawing ${s.drawing.padEnd(5)}  export ${s.export}${Object.keys(extra).length ? "   " + JSON.stringify(extra) : ""}`);
}
async function scenario(name, fn) {
  actions = 0;
  const outcome = await fn();
  result[name] = { outcome };
  console.log(`${name.padEnd(30)} ${JSON.stringify(outcome)}`);
}

/* T1 — five more feeders on the board the last row is on (example 1: F1–F4 on BB1) */
await task("T1_five_feeders", async () => {
  await loadPreset(1);
  for (let n = 0; n < 5; n++) {
    const i = await last();
    await gestures.key(i, "desc", "Enter");                  /* a new row after the last */
    await gestures.pick(i + 1, "Feeder");                    /* its Type */
    await gestures.type(i + 1, "desc", `Feeder ${n + 1}`);   /* its description */
    await settle();
  }
  return { feedersOnBB1: await rowsWhere(`r.type==='Feeder'&&r.from==='BB1'`) };
});

/* T2 — ten rows that exist in a spreadsheet, brought into the page */
await task("T2_ten_rows_from_excel", async () => {
  await loadPreset(1);
  const before = await evaluate(`state.rows.length`);
  const csv = fs.readFileSync(path.join(ROOT, "testdata", "sites", "c1_wtw", "rows.csv"), "utf8").split("\n").slice(0, 11).join("\n");
  await gestures.importCsv(csv, "survey.csv");
  await settle();
  const after = await evaluate(`state.rows.length`);
  return { rowsBrought: 10, tableKept: after === before + 10 };
});

/* T3 — a board is renamed; every way that names it must follow */
await task("T3_rename_board_with_ways", async () => {
  await loadPreset(7);
  const i = await rowIndex("MSB");
  const ways = await rowsWhere(`r.from.split(',').map(s=>s.trim()).includes('MSB')`);
  await gestures.type(i, "id", "MSB1");
  await settle();
  const during = (await state()).drawing;
  for (let k = 0; k < (await evaluate(`state.rows.length`)); k++) {
    const from = await evaluate(`state.rows[${k}].from`);
    if (from.split(",").map(s => s.trim()).includes("MSB")) await gestures.type(k, "from", from.replace(/\bMSB\b/, "MSB1"));
  }
  await settle();
  return { ways, drawingWhileRenamed: during };
});

/* T4 — a supply typed wrong ("BB!") is put right */
await task("T4_fix_typo_supply", async () => {
  await loadPreset(1);
  await loadRows((await evaluate(`state.rows`)).map(r => r.id === "F2" ? { ...r, from: "BB!" } : r));
  const s0 = await state();
  const suggestion = await evaluate(`!!document.querySelector('#problems button.fix')`);
  if (suggestion) await gestures.click("#problems button.fix");   /* the message names the ID: one click */
  else {
    await gestures.clickProblem(0);                            /* the message takes you to the row */
    await gestures.type(await rowIndex("F2"), "from", "BB1");  /* and you retype it */
  }
  await settle();
  return { drawingWhileWrong: s0.drawing, exportWhileWrong: s0.export, suggestion };
});

/* T5 — a feeder is moved from one board to the other */
await task("T5_move_feeder", async () => {
  await loadRows(TWIN);
  await gestures.clickSymbol("F1");                          /* find its row from the drawing */
  await gestures.key(await rowIndex("F1"), "id", "Tab");     /* over to the Feeds from cell */
  await gestures.type(await rowIndex("F1"), "from", "BB2");
  await settle();
  return { movedTo: await evaluate(`state.rows[rowIndexOf('F1')].from`) };
});

/* T6 — a bus coupler between the two boards */
await task("T6_coupler_second_end", async () => {
  await loadRows(TWIN);
  await gestures.drop("Bus Coupler", "BB1");                 /* one end by dropping the chip */
  const i = await evaluate(`state.rows.findIndex(r=>r.type==='Bus Coupler')`);
  await gestures.type(i, "from", "BB1, BB2");                /* the other end typed */
  await settle();
  return { from: await evaluate(`state.rows.find(r=>r.type==='Bus Coupler').from`), typoProof: false };
});

/* W1 — a board with ways is deleted */
await scenario("W1_delete_board_with_ways", async () => {
  await loadPreset(7);
  const ways = await rowsWhere(`r.from.split(',').map(s=>s.trim()).includes('MSB')`);
  await gestures.rowButton(await rowIndex("MSB"), "del");
  await settle();
  const s = await state();
  return { ways, errors: s.errors, drawing: s.drawing, export: s.export, orphansStillDrawn: await evaluate(`!!document.querySelector('#sheet svg g[data-id="MSB"]')`) };
});

/* W2 — a supply written in the wrong case */
await scenario("W2_case_mismatch_bb1", async () => {
  await loadPreset(1);
  await gestures.type(await rowIndex("F1"), "from", "bb1");
  await settle();
  const s = await state();
  return { errors: s.errors, drawing: s.drawing, export: s.export,
    suggestion: await evaluate(`!!document.querySelector('#problems button.fix')`) };
});

/* W3 — Enter six times, typing only an ID each time */
await scenario("W3_enter_x6_ids_only", async () => {
  await loadPreset(1);
  for (let n = 0; n < 6; n++) {
    const i = await last();
    await gestures.key(i, "id", "Enter");
    await gestures.type(i + 1, "id", `X${n + 1}`);
  }
  await settle();
  const s = await state();
  return { rowsFedFromBB1WithNoType: await rowsWhere(`r.type===''&&r.from==='BB1'`), warnings: s.warnings, errors: s.errors, drawing: s.drawing };
});

/* W4 — a feeder chip dropped on a pump */
await scenario("W4_drop_feeder_on_pump", async () => {
  await loadPreset(7);
  await gestures.drop("Feeder", "P1");
  await settle();
  const s = await state();
  const row = await evaluate(`JSON.stringify((state.rows.find(r=>r.type==='Feeder'&&r.from==='P1')||{}).from||null)`);
  return { written: JSON.parse(row), refused: JSON.parse(row) === null, warnings: s.warnings, errors: s.errors, drawing: s.drawing,
    impossible: await evaluate(`/cannot supply/.test(document.querySelector('#problems').textContent)`) };
});

pg.close();
if (pg.errors.length) { console.error("page errors:\n  " + pg.errors.join("\n  ")); process.exit(1); }

/* ---------------------------------------------------------------- write, or compare */
const json = JSON.stringify(result, null, 2) + "\n";
if (!CHECK) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  console.log(`\nwrote ${path.relative(ROOT, OUT)}`);
  process.exit(0);
}
const have = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
let diffs = 0;
for (const name of new Set([...Object.keys(have), ...Object.keys(result)])) {
  const a = JSON.stringify(have[name]), b = JSON.stringify(result[name]);
  if (a === b) continue;
  diffs++;
  const more = have[name] && result[name] && "actions" in result[name] && result[name].actions > have[name].actions;
  const fewer = have[name] && result[name] && "actions" in result[name] && result[name].actions < have[name].actions;
  console.log(`\n${name}: ${more ? "REGRESSION — more actions than the baseline" : fewer ? "improved — fewer actions; update the baseline to keep it" : "changed"}\n  baseline ${a}\n  now      ${b}`);
}
if (diffs) { console.log(`\n${diffs} task(s) differ from ${path.relative(ROOT, OUT)} — run without --check to accept`); process.exit(1); }
console.log(`\nbaseline holds: ${Object.keys(result).length} tasks unchanged`);
