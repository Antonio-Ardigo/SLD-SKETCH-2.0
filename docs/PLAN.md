# SLD-Sketch 2.0 — review and improvement plan

## Status

| phase | state | landed as |
|---|---|---|
| 1 — scaffold, constitution, test pool, data-entry quick wins | done | PR #2 |
| 2 — engine as ES modules, Node CLI, page built from modules | done | `src/core/*`, `src/cli/sld.js`, `tools/build-page.mjs` |
| 3 — structured diagnostics, graph, `<g data-id>`, click-select, drag & drop v1 | done | `src/core/diagnostics.js`, `src/core/graph.js`, palette in `src/ui/app.js`, `testdata/warnings/*` |
| 4 — rules, rank solver, scene, scene checker, new topology fixtures | done | `src/core/rules/*`, `rank.js`, `facts.js`, `scene.js`, `check.js`, `sld check`, `testdata/topics/*` (10 cases; the MCC-under-MCC gap fixed). The solver reproduces today's tiers on every case and is not yet driving the layout — content-sized bands are the remaining piece, folded into phase 5/6 |
| 5 — symbol registry, legend from registry, DXF text check, Python retired | done | `src/core/symbols/registry.js` (legend and palette draw from it, goldens identical), `src/core/dxf-check.js` + `sld dxf --check`; `sld_sketch.py`, `sld_dxf.py`, `sld_check.py`, `make_examples.py` removed. Not done: `device()`/`deviceH()` are still two hand-written orientation variants |
| 6 — view options, larger sketch area, constitution enforcement | done | `src/core/views.js` (spacing, legend, title block) applied through `geometry.applyView`; view bar and Focus mode in the page; `testdata/views/*`; `test/views.test.js` (graph, ranks and verdict fixed under every view), `test/boundaries.test.js` (module import rules); `docs/EXTENDING.md`. Not done: a "flow down" step-up policy — the legacy layout has no such mode, it would be a new placement, not an option |
| 9 — the page works offline | done | The Google Fonts link is gone: `tools/vendor-fonts.mjs` fetches the Latin subsets of Archivo and IBM Plex Mono into `vendor/fonts/`, and `tools/build-page.mjs` inlines them as `data:` URIs. Verified with the network emulated offline and every non-`file://` request blocked: 12 faces load, no request is attempted. The page grows from 212 kB to 637 kB |
| 8 — proposals at addition | done | `src/core/propose.js`: when a row is added (drop, palette, + Add row, Enter, or choosing a Type on a blank row) the engine proposes ID, supply, protection and voltage and the page writes them in, tinted until edited. `test/propose.test.js`; smoke checks for the tint and for the proposal never reaching an export. Nothing is proposed after the row exists |
| 10 — the supply table: Feeds from offers what can feed the row | done | `src/core/supplies.js` — one table of which parent type can feed which child type (2 usual / 1 possible / 0 impossible). `model.js` asks it for IMPOSSIBLE_SUPPLY and for what counts as a root, so the reader's judgement and the page's advice cannot drift; `propose.js` starts a new row on `defaultSupply` (the best supply on the sheet for its Type) instead of copying the row above; the Feeds from picker lists every ID ordered by `supplyCandidates`, each saying what it is and where it is a stretch. `test/supplies.test.js`; the 76 goldens are unchanged — this touches no drawing |
| 11 — the export bar: three files, no clipboard | done | `src/core/pdf.js` writes a one-page A3 landscape PDF through the same canvas primitives as the DXF (base-14 Helvetica, nothing embedded, nothing compressed, so the file is ASCII); the equipment table goes beside the sheet or under it, whichever leaves the drawing bigger. `src/core/eqtable.js` holds that table for both writers (the DXF stays byte-identical). The page's bar is **Download PDF / SVG / DXF**: **Copy SVG** and **Copy DXF** are gone, and the SVG is now regenerated from the model rather than lifted out of the DOM with the page's hit rects in it. `sld pdf` on the CLI; `test/pdf.test.js`; the smoke test catches each Blob the buttons hand the browser |
| 12 — a source is added with no supply | done | From testing: a Generator is a source, so its `Feeds From` is noise. A second `Feeds To` column is not possible (constitution §1), so the request is served through the one column: `proposeRow` gives a root type (`ROOT_TYPES`: MV Incomer, Generator and its Battery / Inverter variants) an empty supply by every route — a drop, a palette click, `+ Add row`, or choosing the Type on a blank row — while the drop target still decides where the row goes in the table and still gives it a voltage (a label, not a connection). `refillProposal` now clears any proposal the new Type does not make, so switching a row to Generator drops the device and ratio the old Type had proposed. The cell stays editable and an empty one is still never warned about; `GEN_NO_LOAD` stays, and is what tells the surveyor to name the generator in the board's `Feeds From` |
| 13 — the entry baseline | done | `tools/usage-baseline.mjs` replays six data-entry tasks and four wrong-topology scenarios in the page under headless Chromium (on `tools/lib/headless.mjs`, now shared with the smoke test) and counts every action; `testdata/usage/baseline.json` holds today's numbers and `--check` fails on any difference, either way. Today: five feeders 15 actions; ten rows from a spreadsheet 5 actions and the table replaced; a board renamed 6 edits with a stale drawing meanwhile; a typo'd supply 2 actions with the drawing stale and export blocked; a moved feeder 3; a coupler 2, typed. Deleting a board with ways leaves 5 errors, a stale drawing and no export; `bb1` for `BB1` is an error with no suggestion; Enter ×6 gives six typeless rows on one board |
| 14 — Enter repeats the row above | done | `addRow(repeat)`: from the keyboard the new row is the row above's Type with its supply as the drop target, so a run of feeders or pumps arrives typed, numbered, with device and voltage, all tinted; the `+ Add row` button keeps the blank row. Baseline T1: 15 → 10; W3 (Enter ×6, IDs only) went from six typeless rows on one board with six UNKNOWN_TYPE warnings to six typed feeders and no message |
| 15 — paste from a spreadsheet | not to be done (decision) | a `paste` listener on the table: tab / `;` / `,` blocks with or without a header row, appended at the paste point; the page's duplicate `parseCsv`/`tableToRows` retired for `src/io/csv.js`, which learns the two delimiters. T2: 5 → 2, table kept |
| 16 — renaming an ID renames its references | done | `src/core/edit.js` `renameReferences` / `canFollowRename`: on commit of the ID cell every `Feeds From` token equal to the old ID is rewritten; no snapshot of its own, so one undo brings back the name and its references together; the graph signature is identical under the new name (`test/edit.test.js`, constitution §3). A rename onto an ID another row already carries is not refused (no new constraint) — the references simply do not follow, and the reader reports the duplicate and the dangling references with their suggested fix. Baseline T3: 6 → 1 |
| 17 — draw through errors, and name the fix | done | `draw()` and `redraw()` no longer withhold the picture on `UNKNOWN_SUPPLY` / `DUP_ID`: the reader resolves Feeds From once (`supplies` as written, `parents` what resolved), the row draws floating with its message (constitution §6), exports are allowed and the CLI writes the file and exits 1. An unknown supply carries the ID it most likely meant — the same letters in another case or spacing, else within two edits — as a `fix` on the diagnostic, and the problems box offers **use BB1**: one click, and only that click, changes the table. `warnings/dup_id` and `warnings/unknown_feeds_from` now have goldens; `warnings/unknown_supply_suggests` is new; `test/errors.test.js`. Baseline: T4 2 → 1 with the drawing on screen throughout; W1 and W2 no longer stale, export no longer blocked |
| 18 — re-wire by dragging the symbol | done | a pointer-drag that starts on a symbol moves its connection (`rewire` in `app.js`): release on another symbol writes that row's `Feeds From`; Shift appends it as a further supply; released on nothing, nothing. No target is refused (no new constraint): the reader reports an unlikely supply exactly as it does for a typed one. When the point is a supply, a bar beats the way that leaves it at that very point (`symbolAt(x,y,asSupply)`, also used for chip drops). Panning starts on empty canvas. The drawing's own messages (a coupler it could not place) now reach the problems box. Baseline T5: 3 → 1 by gesture. T6 stays typed: a one-ended coupler has no symbol to drag until its second end exists |
| 7 — UPS / Inverter / Battery / DC Busbar | done, as symbol variants | The Type label picks the glyph, the family keeps the behaviour (constitution §2): UPS draws as the conversion box where a transformer would, Inverter and Battery as marked generation sources, DC Busbar as a dashed bar; legend entries appear only when used; `testdata/topics/dc_ups_types`. Not done: DC-specific rules (a DC bus feeding AC gear is not warned about) |

## Context

SLD-Sketch turns a survey spreadsheet (one row per item; `Feeds From` is the only topology column) into an SVG/DXF single-line diagram. Two front-ends exist: `sld_sketch.py` (Python CLI, 3058 lines) and `sld_sketchpad.html` (browser page with a hand-ported JS copy of the same engine, 3332 lines). The user asked for a review and a plan covering: easier human data entry; a larger sketch area with any number of levels; better handling of particular topological cases; a written "constitution" that keeps `Feeds From` the single topological column while allowing several graphical representations later; quick standard MV/LV values; filling the table by dragging symbols onto the drawing; a test-data pool in its own directory.

Decisions already taken with the user:
- **One engine in JavaScript** (plain ES modules, no framework); a small Node CLI replaces the Python CLI; xlsx via SheetJS. Python is retired.
- **Test data master is text** (CSV rows + JSON expectations per case); a generator emits `.xlsx` and the sketchpad presets.
- **Drag & drop v1**: palette; dropping a symbol on a drawn busbar/RMU/transformer creates a row (Type set, ID auto-numbered, `Feeds From` = target); clicking a symbol selects its row. The table stays the source of truth.

Assumptions I made where the user has not decided (override any of them):
- Step-up transformers keep today's "MV on top" drawing as the default; the pure "flow down" version becomes a view option.
- New types (UPS, Inverter, Battery, DC Busbar) are deferred to an optional last phase; until then they are modelled with Transformer/Generator/Feeder as today.
- SheetJS Community Edition is vendored (offline page must work); CDN is not relied on.
- Python files are deleted in phase 5, when the JS checker fully replaces `sld_check.py`.
- Generated `examples/*.xlsx` (the user-facing templates) stay committed; generated test workbooks under `build/` are gitignored.
- Node 20+ and `node --test`; no test framework dependency.

---

## Review findings

### Engine (`sld_sketch.py`, mirrored in the HTML)
- Pipeline `read_workbook → layout → render (→ DXF)`. `render()` is 1163 lines (38 % of the file); `layout()` forks into two divergent algorithms (`layout_mv_boards` vs the inline RMU/LV path) with different spread constants (90 vs 80 px).
- **No graph object.** ~20 predicate functions re-scan `items`/`order` on every call (`children_of` has 46 call sites; `mv_children` recomputes `level_links`, `rmu_hang`, `su_mid`, `mv_depth` each time). Roughly cubic on a big sheet; nothing cached.
- **Fixed row structure.** Module-global y constants (`Y_MVBUS`, `Y_TX_C1`, `Y_BUS`, `DIAG_H`, …) are rebased by `set_tiers()`/`extend_sheet()` *from inside render*. One MV band, one transformer row, one LV row, then sub-rows. Not reentrant; "multi-level" today means shifting these globals. Only MV boards/RMUs get a rank (`mv_depth`); LV sub-boards are ranked separately (`lv_level`); transformers have no rank.
- **Topology inferred from layout output**: ring closure is decided in render by comparing x coordinates (line ~1952). `Item` carries drawing state (`x`, `land`, `tee`).
- `alloc_lanes()` is a sound interval-colouring routine, but every call site passes a fixed 3–4-slot list; overflow silently spreads lanes through device zones.
- Symbols: the `SVG` class has a clean primitive boundary (8 primitives + ~14 composites) and `sld_dxf.DXF(SVG)` proves it by overriding only the primitives. But `device()`/`device_h()` are duplicated if-chains and `draw_legend()` redraws every symbol by hand.
- Warnings go to `stderr` as text; no structured list a UI or a test can consume.
- Adding one topological case today touches ~8 places: a predicate, two duplicated exclusion lists (~2246 and ~2610), a render section, `label_clearance`, a lane slot list, `set_tiers`, both layout paths, the legend.

### Sketchpad (`sld_sketchpad.html`)
- 2490 of 3332 lines are the ported engine + DXF writer; 325 lines are UI. 62 JS functions mirror Python defs by name, comments ported verbatim. **Every engine change is made twice** and the APIs have already drifted (JS `render()` takes a `warnings` array; Python's does not).
- Data entry: Type is a `<select>`; Protection has a 6-entry `<datalist>`; **Feeds From is a bare text box** with no ID picker. Validation is post-hoc in `buildModel()`; errors keep the last good drawing with no cell highlighting. No undo, no keyboard flow, no import of any kind, reorder only via ↑/↓ buttons. `localStorage` JSON has no schema version.
- Drawing: the SVG is a string set via `innerHTML`; **no `id`/`data-id`/`<g>` on any element**, so nothing on the canvas maps back to a row. Layout x is discarded after render; y is never stored. `pointerdown` grabs the viewport for panning, so a drop handler must coexist with it.
- Rebuild is a 250 ms debounced full `buildModel → layout → render → innerHTML`. Fine at 37 rows, will hitch at a few hundred.
- Viewport is `min(72vh, 900px)` inside a 1240 px column.

### Tests and data
- 48 workbooks: `examples/` 8, `tests/sites/` 5 (up to 4 voltage levels, a 6-supply generation board), `tests/levels/` 10, `tests/features/` 15, `tests/audit/` 10 (`w08` adversarial by design; `w10` has 95 rows). **The 40 `tests/*.xlsx` have no generator** in the repo; only `examples/` come from `make_examples.py`.
- `sld_check.py` is a real regression oracle (renders in-process, regex-parses the SVG back, classifies symbols geometrically, rebuilds the conductor graph, verifies items-drawn-once and every `Feeds From` edge as a continuous conductor, counts overlaps/false nets/crossings/off-sheet). But it takes file paths only, prints rather than asserts, and its expected scores live as pasted text in `BASELINE.md`/`LEVELS.md`. No pytest, no CI, no JS harness; the "parity harness" the README mentions is not in the repo.
- Only input format is xlsx. `openpyxl` isn't installed in this checkout, so the Python tools cannot run here as-is.
- Uncovered topology: more than 2 bus sections, more than 2 parallel transformers, 3-supply boards (only the 6-supply `c5.GB`), meshed MV boards, double-ended substations, UPS with bypass, DC/UPS/PV-inverter/BESS as first-class types, 6+ level cascades, 40-way boards, and every warning path (duplicate ID, unknown type, unsupplied loop, empty sheet).

---

## Target architecture

### Pipeline with hard boundaries

```
rows (strings) → normalize → Model + Diagnostics
              → graph     → Graph (pure function of ID + Feeds From)
              → rules     → Facts (rank, rings, spurs, txDir, couplers, supplies, …)
              → views     → Facts' (view options may re-style, never re-wire)
              → layout    → Scene (every item: id, bbox, anchors; every edge: polyline; lanes)
              → render    → SVG / DXF via a Canvas + symbol registry
              → check     → scores from the Scene (no SVG parsing)
```

### Module layout

```
src/core/
  types.js            canonical types, aliases, protection aliases, keyword tables (data only)
  diagnostics.js      DIAG code catalogue + collector
  normalize.js        rows → Model + Diagnostics          (seed: sketchpad buildModel ~L897)
  graph.js            Model → Graph, memoised adjacency    (replaces 46 children_of call sites)
  rules/              one file per topological case; ordered registry in rules/index.js
    sources.js ring.js spur.js tx-direction.js level-link.js sub-board.js
    tx-loads.js mcc.js coupler.js terminal.js
  rank.js             constraint solver: below/same/between → rank per node (longest path)
  layout/
    layout.js bands.js columns.js landings.js lanes.js route.js   → Scene
  scene.js            Scene shape, bbox/anchor helpers, query(id)
  symbols/
    canvas.js         Canvas interface (line rect circle dot poly text path group endGroup document)
    svg-canvas.js     emits <g data-id data-kind> wrappers
    dxf-canvas.js     R12 DXF, layers, equipment table
    devices.js        CB/LBS/fuse/fuse-switch/contactor/fuse-contactor with v/h orientation
    registry.js       one SymbolDef per type: variants, anchors, draw(), legend entry
  render/render.js legend.js     Scene → document on any Canvas; legend from registry entries used
  views/index.js      ViewOptions + applyView(facts, options) → facts'
  check.js            scene-graph checker (port of sld_check metrics)
  pipeline.js         run(rows, info, options) → {model, diagnostics, graph, facts, scene, svg}
src/io/   csv.js json.js xlsx.js (SheetJS)
src/ui/   app.js table.js pickers.js palette.js viewer.js problems.js presets.generated.js
src/cli/  sld.js      draw | dxf | check | import | gen
tools/    build-page.mjs (concat modules → dist/sld_sketchpad.html)  gen-fixtures.mjs
          import-xlsx.mjs  golden.mjs  serve.mjs
docs/CONSTITUTION.md
testdata/             see below
vendor/xlsx.full.min.js
```

Import boundaries enforced by a test that scans `import` lines: `render/` and `symbols/` import only `scene.js`; `layout/` never imports `normalize.js`; `views/` reads `Graph` but never mutates it; `ui/` and `cli/` import only `pipeline.js`, `io/`, `check.js`.

### Data shapes (plain objects)

```js
Row   = { id, type, desc, rating, voltage, prot, from, notes }              // strings, workbook columns
Item  = { id, type /*canonical*/, rawType, desc, rating, voltage, notes, row,
          supplies: [{ id, prot, raw }],          // Feeds From, in order
          symbolClass: 'capacitor'|'earthing'|'arrester'|null,   // keyword override; type untouched
          flags: { vsd, spare, normallyOpen, noToward: [] } }
Diag  = { code, level: 'error'|'warning'|'note', ids, row, field, message, hint }
Graph = { nodes: Map, edges: [{ id, from, to, index, prot, tags: Set }], out, in, primaryParent }
Facts = { rank: Map, bands, constraints, supplies, rings, spurs, txDir, couplers,
          subBoards, waysOfBoard, floating, tags }
Scene = { width, height, bands: [{ rank, y0, y1, barY, laneYs }],
          items: Map<id, { symbol, variant, x, y, bbox, anchors: { in, out, land }, enclosure, devices }>,
          edges: [{ id, from, to, points, dash, deviceAt, laneId }], lanes, labels, legend }
```
Layout coordinates live only in `Scene`; `Item` never carries `x/land/tee` again.

### Arbitrary levels: rank solver + content-sized bands
1. Ranked nodes: MV Busbar, RMU, LV Busbar, MCC-with-bus, a Generator or MV Incomer that feeds a transformer. Transformers, feeders, pumps, terminals are in-band or between-band and take position from ranked neighbours.
2. Default constraint per supply edge between ranked nodes: `below(child, parent, 1)`; through a transformer also `between(tx, parent, child)`.
3. Rules override: `ring.js` → `same(a, b)` for anchored RMU–RMU links (duplicate two-way links collapse to one edge); `spur.js` → `below(branch, hub)` (today's `rmu_hang`, generalised beyond degree ≥ 3); `tx-direction.js` → records `txDir[tx].class` (`column|inRow|underBoard|dedicated|levelLink|lvLink`) and emits the constraint for the default "MV on top" policy; `coupler.js` → no constraint, records `rankGap` and `intervening`.
4. Solve: union-find on `same`, longest path from roots over `below`. A surviving cycle → `DIAG.RANK_CYCLE`, back edge dropped; unreachable nodes → `facts.floating`, placed on a bottom "leftover" band.
5. `bands.js`: each band's height = max in-band supply stack + bar/label zone + deepest in-band load column; each gap = transformer height (if a level-link lives there) + `laneCount × LANE_PITCH` + device zones. Prefix sums give every y. No module-level y constants remain; only pitches.
6. `columns.js`: recursive slot widths over `primaryParent` (first `Feeds From` entry), children in row order, generalising `mv_width/place_mv_node/lv_board_width` to every rank. Extra supplies become landings + lanes, so "board fed from N transformers" is no longer a special case.

### Topological cases as rules
```js
export default { name: 'spur', after: ['ring'], apply(graph, facts, diag) { … } }
```
Layout dispatches placement handlers on `(kind, tag)`; render picks symbol variants from `SceneItem.symbol/variant`. **Adding a case = one rule file + (if needed) one placement handler + (if needed) one symbol variant + one fixture.** The two exclusion lists, `label_clearance`, the slot lists, `set_tiers` and the dual layout paths all disappear.

### Symbol registry
One `SymbolDef` per type with `variants`, `anchors(variant)`, `draw(canvas, cx, cy, variant, item)`, `legend`. Devices are entries with `orient: 'v'|'h'`, replacing the duplicated `device()/device_h()`. `legend.js` iterates the symbols actually drawn and calls the same `draw()`. `svg-canvas.group(id, kind)` wraps every item in `<g data-id data-kind>` and every edge in `<g data-edge>`; hit-testing in the UI is `event.target.closest('[data-id]')`. `dxf-canvas.group()` only switches layer.

### Diagnostics
`diagnostics.js` holds the catalogue (the 16 messages in `buildModel`, the two coupler ones now in render, plus `EMPTY_SHEET`, `RANK_CYCLE`, `LOOP_NO_SUPPLY`, `FEEDS_SELF`). Rules push diagnostics too. UI panel groups by level; clicking an entry scrolls/flashes the table row and outlines the `<g data-id>`. Fixtures assert `code:firstId`, never message text.

### View options (the constitution's future graphical variants)
`applyView(facts, options) → facts'` may change `txDir` policy, ring style, coupler routing style, landing order, label density, compactness. It receives `Graph` read-only; a test deep-freezes the graph and asserts `facts'.rank` differs only where the option says it may. `normalize.js`/`graph.js` never see options. View options are stored beside the table state and never exported to xlsx.

### Constitution (`docs/CONSTITUTION.md`, ~1 page, normative)
1. `Feeds From` is the only source of connectivity and direction (supply → load).
2. Every other column, keyword and option selects symbols, labels or placement style only.
3. The graph stage is a pure function of `(ID, Feeds From)` and is tested as such.
4. View options may change the drawing, never the data or the graph.
5. Every inference the engine makes (level, ring, spur, transformer direction, landing, lane) is a named fact, visible in diagnostics/tests, and overridable only through a view option.
6. A row is never dropped silently: it draws floating and warns.

---

## Migration strategy (strangler, not rewrite)

The sketchpad JS is the reference implementation; the 48 workbooks must stay clean at every commit.

0. **Pin the current drawing.** `tools/import-xlsx.mjs` converts all 48 workbooks to `testdata/` cases. `tools/golden.mjs` runs the *current* engine (script text sliced from the HTML, evaluated in Node) and writes `golden.svg` per case. Test = byte-identical SVG.
1. **Extract verbatim** into `legacy/engine.js`, `legacy/dxf.js`, `legacy/ui.js` with `export` added; `tools/build-page.mjs` concatenates back into `dist/sld_sketchpad.html`. Goldens identical.
2. **Split along the existing section comments** into the target file names, same code. Goldens identical.
3. **Structured diagnostics + memoised `graph.js` facts** threaded into layout/render replacing internal recomputation. Goldens identical; performance fixed for free.
4. **`<g data-id>` wrappers.** First intentional SVG change; goldens regenerated once under a *geometry-equal* compare (parse both SVGs into primitives, ignore `<g>`, compare multisets). Unlocks click-select and drop targets before the new layout exists.
5. **New layout side by side** behind `pipeline.run(..., { engine: 'v2' })`, gated by the scene checker (`check.js`): every item exactly one `SceneItem`; every `Feeds From` edge one `SceneEdge` whose endpoints coincide with anchors of its two items and whose polyline crosses no other item's bbox; no collinear shared segments; connected components equal the table's; crossings/labels/off-sheet counted. Same metric names as `sld_check.py`. Flip the default when all 47 clean cases are clean and `w08` reports its expected five disconnected edges.
6. **Registry render + DXF from the scene**, then delete `legacy/` and the Python files. Goldens regenerated with a side-by-side visual report (`tools/golden.mjs --report`).

---

## Test data pool

```
testdata/
  README.md   schema/case.schema.json
  examples/<case>/  levels/<case>/  features/<case>/  sites/<case>/  audit/<case>/   (48 converted)
  topics/<case>/      new topology cases
  warnings/<case>/    one case per diagnostic code
  each case: rows.csv  case.json  golden.svg
build/xlsx/<group>/<case>.xlsx   generated, gitignored (examples/*.xlsx regenerated and committed)
```
- `rows.csv`: header exactly `ID,Type,Description,Rating,Voltage,Protection,Feeds From,Notes`; byte-equivalent to the Equipment sheet.
- `case.json`: `info`, `description`, `preset` flag, and `expect: { diagnostics, ranks, facts, check: { items, edges, overlaps, falseNets }, golden }`. Only keys present are asserted. `w08` sets `check.edges` to the expected number.
- `tools/gen-fixtures.mjs`: every case → xlsx (Info, Equipment, How to fill); every `preset: true` case → `src/ui/presets.generated.js`. Round-trip test: generated xlsx read back equals `rows.csv`.
- Runner: `node --test` walks `testdata/**/case.json` and runs the full pipeline + checker (+ golden when set); `UPDATE_GOLDEN=1` rewrites goldens; `node src/cli/sld.js check testdata/**` prints the tag × case matrix.

New cases (~20):

| case | exercises |
|---|---|
| `topics/b3_three_sections` | LV board A/B/C, 3 tx, 2 couplers |
| `topics/p3_parallel_tx` | 3 transformers from one RMU onto one LV board |
| `topics/s3_three_supply_board` | LV board from 2 tx + genset; MV board with 3 incomers |
| `topics/mesh_mv` | 3 MV boards each fed from the other two |
| `topics/double_ended` | MV A/B, tx A/B, LV A/B, LV tie + N.O. MV tie |
| `topics/ups_bypass` | UPS as Transformer, bypass as Bus Coupler between input and output boards |
| `topics/deep6_cascade` | 132→33→11→3.3→0.4→sub→sub-sub |
| `topics/wide40_board` | one bar, 40 ways of every load type, long labels (timing assertion) |
| `topics/ring_board_fed_rmu` | RMU ring where one RMU is fed from an MV board |
| `topics/mcc_cascade` | MCC → MCC → motors |
| `topics/stepup_flow_view` | L6 rows rendered with `view.stepUpDirection: 'flow'` |
| `warnings/dup_id`, `unknown_type`, `unknown_feeds_from`, `loop_no_supply`, `impossible_supply`, `empty_sheet`, `coupler_invalid`, `tx_open_ends`, `no_id_row` | every diagnostic code once |
| `topics/dc_ups_types` | only if phase 7 is done |

---

## Phased plan

| # | Goal | Size | Main files | Acceptance |
|---|---|---|---|---|
| 1 | Scaffold, constitution, test pool, UI quick wins (no engine change) | M | `package.json`, `docs/CONSTITUTION.md`, `tools/import-xlsx.mjs`, `tools/gen-fixtures.mjs`, `tools/golden.mjs`, `tools/build-page.mjs`, `testdata/**` (48 cases), `vendor/xlsx.full.min.js`; in the HTML: Feeds From `<datalist>` of current IDs, per-type default Protection, MV/LV quick values for Voltage (11 kV, 33 kV, 400 V, 690 V, 11/0.4 kV, …) and Rating (630/1000/1600 kVA, 100–2500 A), Enter = new row, Alt+↑/↓ move, error-row highlight by ID, CSV/xlsx import, undo/redo snapshot stack, `localStorage` schema version | `node --test` green with byte goldens for 48; `dist/sld_sketchpad.html` builds and behaves as today |
| 2 | Extract engine as-is into ES modules; Node CLI `draw`/`dxf` | M | `legacy/*.js` → `src/core/{types,normalize,layout,symbols,render}.js`, `src/ui/*.js`, `src/cli/sld.js` | Goldens byte-identical; CLI output equals page output |
| 3 | Structured diagnostics, memoised graph facts, `<g data-id>`, click-select, drag & drop v1 | M | `diagnostics.js`, `graph.js`, `svg-canvas.js`, `ui/problems.js`, `ui/palette.js` | Goldens geometry-equal; `warnings/*` fixtures pass; drop on board/RMU/tx creates a row; click selects the row |
| 4 | Rules + rank solver + content-sized bands + Scene + scene checker (engine v2 behind a flag, then default) | L | `rules/*.js`, `rank.js`, `layout/*.js`, `scene.js`, `check.js`, `topics/*` fixtures | Scene checker clean on all cases except `w08`; `expect.ranks/facts` pass; deep6 / wide40 / b3 / p3 / s3 / mesh / double-ended render; visual side-by-side report reviewed |
| 5 | Symbol registry render, legend from registry, DXF from Scene; delete `legacy/` and Python | L | `symbols/registry.js`, `devices.js`, `render/*.js`, `dxf-canvas.js`; remove `sld_sketch.py`, `sld_dxf.py`, `sld_check.py`, `make_examples.py` | Goldens regenerated and reviewed; DXF text-overlap check ported; README rewritten for the JS toolchain |
| 6 | View options, larger sketch area, constitution enforcement | M | `views/index.js`, view toolbar, viewport fills the window (table collapsible/side-by-side), import-boundary and graph-purity tests, "how to add a case" walkthrough | Switching any view option leaves `graph` deep-equal; a new rule added end-to-end following the walkthrough |
| 7 (optional) | First-class UPS / Inverter / Battery / DC Busbar | M | `types.js`, `rules/dc.js`, registry entries, fixtures | Fixtures clean; legend gains entries only when used |

Existing code to reuse rather than rewrite: `buildModel` (sketchpad ~L897) seeds `normalize.js`; `rmu_hang`/`mv_depth`/`level_links`/`su_mid`/`lv_subs`/`step_ups` (sld_sketch.py L575–717) seed the rule files; `alloc_lanes` (L496) seeds `lanes.js`; the `SVG`/`DXF` classes seed the canvases; `sld_check.py` metrics (`check()` L688, `TAGS` L596) define the scene checker; `make_examples.py` (`HEADERS`, sheet layout, "How to fill" text) defines `gen-fixtures.mjs` output; `bindViewer` (sketchpad ~L3131) becomes `ui/viewer.js`.

---

## Risks
- **SheetJS**: npm `xlsx` is stale (0.18.5); the maintained CE build comes from cdn.sheetjs.com. Vendor it (Apache-2.0). CE cannot write data-validation dropdowns or cell fills, so the generator should fill a hand-made `template.xlsx` (dropdowns and yellow cells preserved) instead of writing workbooks from scratch.
- **`file://` blocks ES module imports** in Chrome. Development runs over `node tools/serve.mjs`; the deliverable stays a single offline file from `tools/build-page.mjs` (topological concat, import/export lines stripped; no bundler).
- **Rank policy changes drawings**: pure longest-path would move today's "MV on top" cases (L6, w04, c5). The `tx-direction` rule defaults to today's behaviour; the phase-4 visual report is where individual cases get judged.
- **Golden churn**: byte goldens break on every intentional change; from phase 4 the scene checker is the gate and goldens are review aids.
- **Drop vs pan**: palette drags use HTML5 drag events (pan uses pointer events), touch needs long-press.
- **Persistence**: migrate the unversioned `localStorage` blob once.

## Verification
- After every phase: `node --test` green; `node tools/build-page.mjs` produces `dist/sld_sketchpad.html`; open it via `file://` and load each preset; run `node src/cli/sld.js draw examples/config4_single_tx.xlsx` and compare with the committed `output/config4.svg`.
- Phase 3: open a preset, drag a Feeder from the palette onto `BB1`; a new row appears with Type Feeder, next free ID, Feeds From `BB1`, and the drawing shows it. Click a transformer; its row highlights.
- Phase 4: `node src/cli/sld.js check testdata/**` shows zero items missing / zero disconnected on all cases except `w08` (5 expected), zero overlaps and false nets; `topics/deep6_cascade` renders 7 bands; `topics/wide40_board` completes under a set time budget.
- Phase 6: toggle `stepUpDirection` on `levels/l6_loop`; the drawing changes, `graph` and `rows` do not (asserted by test).
