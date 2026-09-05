# SLD-Sketch

Turn a very simple site-survey spreadsheet into a single-line diagram sketch.

On a site visit you fill in a small Excel workbook (MV incomers, RMUs,
transformers, LV busbars, feeders). Back at the office you run one command and
get an SVG single-line diagram for future reference.

## Quick start

```bash
node src/cli/sld.js draw examples/config1_single_tx.xlsx -o output/config1.svg
node src/cli/sld.js draw survey.xlsx --dxf        # SVG + R12 DXF beside it
node src/cli/sld.js draw testdata/sites/c1_wtw    # a testdata case works too
```

Node 20 or newer, nothing to install. Open the SVG in any browser. To start a
new survey, copy `examples/template.xlsx` and fill in the yellow cells.

(The original Python command line, `sld_sketch.py` and friends, has been
retired: the JavaScript engine under `src/` draws the same picture, checks
it the same way, and is the only implementation. See `docs/PLAN.md`.)

**Prefer not to touch a spreadsheet?** Open `sld_sketchpad.html` in a browser —
the same engine, with an editable equipment table instead of Excel and the
drawing rebuilding live as you type. The seven example configurations are
built in, and your table is kept in the browser between visits. The drawing
sits in a window of its own with scrollbars on both axes: drag it to pan,
Fit / 100 % / − / + (or ctrl+wheel, the keys 0, 1, −, +) to zoom, so a
2500 px site stays reachable end to end.

Filling the table in the page: **Feeds from** offers the IDs already on the
sheet, ordered by what can actually feed the row — the usual supplies first
(a feeder is offered the LV board, a transformer the MV gear), then what
merely draws, then what the reader would call impossible, each saying what it
is and where it is a stretch. Nothing is hidden: the order is the advice.
Type `BB1, ` and it offers the second supply, preferring another board of the
same kind. **Voltage** and
**Rating** offer standard values for what the row *is*, however its Type is
spelled — a `PFC` or a `Cap bank` is a capacitor bank and is offered kvar, a
`Genset` kVA, a `Trafo` the transformer ratios (11 kV, 400 V, 11/0.4 kV,
1000 kVA, 250 A, 55 kW, 300 kvar, …). **Protection** does the same for the
switchgear: the whole vocabulary every time — ACB, CB, MCCB, MCB, VCB, RCBO,
LBS, Isolator, Fuse, Fuse-switch, Contactor, Fused contactor, Motor starter —
with the gear that Type usually carries first (an RMU is offered `LBS`, a
motor `Fused contactor`, a way `MCCB`, a transformer `Fuse-switch`) and the rest
marked *unusual here*. Nothing is hidden: the order is the advice, not a rule.
The last entry is **Unknown** — for a device you can see is there but whose
type you did not get; the default symbol is drawn and nothing is reported.
Choosing a **Type** fills the usual Protection if the cell is empty. `Enter` moves down a row (a new one after the last),
`Alt`+`↑`/`↓` moves the row, `Ctrl`+`Z` / `Ctrl`+`Y` undo and redo. A message
in the problems box marks the row it is about and clicking it jumps there.
**Import…** (or dropping a file on the table) loads a survey workbook, a CSV
of the equipment table, or a saved `.json`; **Download CSV** writes the table
back out. Every symbol on the drawing knows its row: click one to select
the row, and drag a chip from the **symbol palette** above the drawing onto a
busbar, RMU or transformer to add a row of that type fed from it (the ID is
numbered for you, the usual Protection filled in). Clicking a chip adds the
row under the selected item. The table stays the only source of truth: a
drop writes a row, nothing else. The drawing's own bar carries **Download
PDF**, **Download SVG** and **Download DXF** — three files written from the
table by the engine, never copied off the screen.

**A new row comes pre-filled.** However you add it — a drop, a palette chip,
**+ Add row**, `Enter` on the last row — the engine proposes what it can and
writes it into the table. `Enter` on the last row **repeats the row above**:
same Type, same supply, the next ID, the usual device and the voltage, all
tinted — a run of feeders on one board or pumps on one MCC is one `Enter` and
a description per row. **+ Add row** gives a blank row for a different item.
The proposal writes: the ID (numbered from the type: `TX3`, `F12`), the
supply (the drop target, else the best supply on the sheet for that Type — the
last LV board for a feeder, the last MV board for a transformer — so the item
lands where it belongs instead of at the edge of the drawing), the usual
protection, and the voltage read off that supply (a transformer on an 11 kV
board gets `11/0.4 kV`, a feeder on a 400 V board `400 V`, a board under a
`33/11 kV` transformer `11 kV`). A **source** — an MV Incomer, a Generator and its
variants — is added with no supply at all, whatever it was dropped on: it is
fed from off the sheet, and what it feeds is named in *that* item's `Feeds
From`. Its own cell stays there and stays editable, and leaving it empty is
never a warning. Proposed cells are tinted; the tint goes as
soon as you type in one, so you can see what came from the engine and what
you entered. Choosing a Type on a blank row fills the rest the same way.
Nothing is proposed once the row exists: from then on every cell is yours.

**Re-wire by dragging the symbol.** Drag a symbol on the drawing onto the
board, RMU, transformer or MCC that feeds it and its `Feeds From` becomes
that item — one gesture, no ID typed. Hold **Shift** to *add* the target as a
further supply (a changeover's second board, a ring's second link) instead of
replacing. Releasing on nothing does nothing. Panning still starts on empty
canvas; a drag that begins on a symbol moves its connection, not the sheet.
Whatever the reader thinks of the new supply, it says so in the problems box
as it does for a typed one — the gesture writes the same cell.

**Renaming an ID renames every reference to it.** Change a board's ID and,
when you leave the cell, every `Feeds From` that named the old ID names the
new one — one edit, one undo step, the same drawing under a new name. If the
new ID is already another row's, nothing follows: the reader reports the
duplicate and the references that now dangle, each with the ID it thinks
they meant.

**An error never takes the drawing away.** A `Feeds From` that names an ID
not on the sheet, or two rows with one ID, is an error in the problems box —
but the sheet still draws: the row in question floats (or, for a duplicate,
the second row is left out) and the message says so. Exports work too. An
unknown supply that is within a slip of an existing ID — `BB!` for `BB1` —
is named in the message with a **use BB1** button; that click, and only that
click, writes it into the cell.

**The same ID written two ways is one ID.** `bb1`, `BB 1` and `BB1` are the
same board: the row is connected and the box says how the cell was read,
rather than calling it an error and asking you to correct a spelling that
was already understood. Your cell is left exactly as you typed it, and the
exports print it that way. Two rows whose IDs differ only in case are not
refused — both draw, and the box says which one references will go to.

**A coupler is a row like any other.** A bus coupler with only one end
written, or one naming something that is not a busbar, is drawn from the end
it has with its other end open, and the message says which. So a coupler you
have half-entered has a symbol you can grab: drop the chip on one board and
**Shift**-drag it onto the other to finish it, without typing an ID. A
coupler naming more supplies than the two it ties says which are not drawn —
it used to draw an ordinary tie and discard them in silence.

**Spreadsheets are read as they come.** Import sniffs the separator, so a
workbook exported where the list separator is `;` — or a tab-separated file —
reads like any other. Columns bind by their name before any word inside it,
so a `Building ID` column beside `ID` cannot quietly become every row's
identity; when a column is matched only by a word it contains, the status
line says which column was read as what. A file that holds no equipment rows
leaves your table alone.

**View options** sit in the drawing's toolbar: spacing (compact / normal /
wide), the legend and the title block on or off, and **Focus drawing**, which
gives the drawing the whole window (Esc to leave). A view changes the picture
and never the table: the same rows draw the same network under every view
(`test/views.test.js` proves it on every case), the view is kept beside the
table in the browser and is never exported with it. The CLI takes none yet;
a case can carry one in `case.json` (`"view": {"spacing": "compact"}`).

**The page works offline.** `sld_sketchpad.html` carries everything it needs,
its two typefaces included, and asks the network for nothing at all: open it
from a laptop on a site with no signal, from a USB stick, from an email
attachment. Only importing an `.xlsx` reaches outside the file, to
`vendor/xlsx.full.min.js` beside it; CSV and JSON import do not.

## The spreadsheet

One workbook per site, two sheets (plus a "How to fill" sheet with these same
instructions):

**`Info`** — key/value rows: Site, Date, Surveyed by, Notes. Shown in the
diagram's title block.

**`Equipment`** — one row per item:

| Column | Meaning | Example |
|---|---|---|
| ID | Short unique tag you invent | `MV1`, `RMU1`, `TX1`, `BB1`, `F1` |
| Type | Dropdown: MV Incomer, Generator, MV Busbar, RMU, Transformer, Pump, LV Busbar, Feeder, MCC, Bus Coupler, Capacitor Bank, Earthing/NER, Surge Arrester — and four symbol variants: UPS (a transformer that draws as the UPS box), Inverter and Battery (generation sources with their own marks), DC Busbar (a dashed bar) | `Transformer` |
| Description | Free text | `Oil-immersed, Dyn11` |
| Rating | From the nameplate | `1000 kVA`, `630 A` |
| Voltage | From the nameplate | `11/0.4 kV`, `400 V` |
| Protection | Device on **this item's supply side**, from a drop-down that follows the row's Type: ACB, CB, MCCB, MCB, VCB, RCBO, LBS, Isolator, Fuse, Fuse-switch, Contactor, Fused contactor, Motor starter, or **Unknown** for a device whose type you did not get. Blank = the usual default for that Type, and on a **Feeder** it means no device at all (see *The feeder is a placeholder*). Comma list matches Feeds From order. Free text on a busbar (e.g. `87B differential`) is printed as a label annotation | `CB` or `LBS, CB` |
| Feeds From | ID of the item supplying this one; comma for two supplies | `RMU1` or `BB1, BB2` |
| Notes | Anything else | `Normally open` |

**Generation and step-up transformers.** A `Generator` feeding an LV board is
drawn as a G-circle in the transformer row. A transformer that feeds an MV
Busbar or RMU is a **step-up**: its source (a Generator, an LV Busbar acting as
a generation board, or an MV Incomer row) is drawn at the top, the transformer
below it, then down into the MV board beside any utility incomers.

There is **one `Transformer` type** — step-up and step-down are the same
IEC symbol, and which way round it is drawn follows `Feeds From`. Write
"step-up" in Description if you like; the Voltage field (`0.4/11 kV` against
`11/0.4 kV`) says it too. Sheets that used the old `SU Transformer` type still
load — the name is kept as an alias of `Transformer`.

| Wiring | Drawn as |
|---|---|
| TX `Feeds From` MV gear, an LV board feeds from TX | ordinary step-down |
| TX `Feeds From` a Generator or generation board, MV gear feeds from TX | source-on-top column |
| TX `Feeds From` a live LV board, MV gear feeds from TX | step-up in the transformer row |
| TX `Feeds From` MV gear, a Generator feeds from TX | the same column drawn upside down |
| TX `Feeds From` an LV board, only Pumps feed from TX (or nothing yet) | step-down under the board: a way of it, the transformer on the row below, the motor (or an open terminal) under it |
| TX `Feeds From` MV gear, no board but a Pump or MCC feeds from TX | dedicated transformer: the load under it (an MCC becomes the board: incomer device, box, bus and motors in the dashed outline) |
| TX feeds a board, and a Pump or MCC also names TX | a way of that board, not a tap on the secondary (a note says so) |

The last one works because a generator is never a load: a `Generator` whose
`Feeds From` names a transformer can only be feeding *up* through it.

An MV switchboard whose `Feeds From` names an **RMU** is a board on one of the
RMU's ways: it is drawn one tier below the enclosure, wired from the way out of
it. Two RMUs naming each other are a ring and stay level; a board never is.

Because `Feeds From` only ever points *upstream*, a step-up needs to be named
on the row of the board it supplies. Until you do that it still draws — as a
way under its LV board with an **open terminal** marked "outgoing not defined"
— and a warning tells you which row to add it to.

**A half-filled row still draws.** A transformer whose supply or whose load
you have not entered yet is drawn where it belongs, with an **open terminal**
on the missing side ("supply not defined" / "outgoing not defined") and a
warning saying so — rather than floating unconnected or vanishing. The board
under such a transformer still gets a bar sized from its own feeders.
Any other row with an empty `Feeds From`, a row whose supply cannot feed it
(a feeder off a pump, a pump off an MV incomer, anything off a bus coupler or
a terminal item), and rows that feed from each other round a loop no supply
reaches, are drawn floating and warned about by ID, so a survey sheet never
loses a row silently.

A transformer can also sit between **two LV boards**: a 400/690 V unit for
drives, say. Fed from one LV board and feeding another, it is drawn in the
transformer row between the two, its supply taken from the parent board's bar
and its output dropped into the fed board, which stands beside its parent with
its own feeders. These chain, and one unit can feed several boards.

**Generators as supplies.** A `Generator` can feed any board directly: name
it in the board's `Feeds From` (`MV, DG1, DG2` on an 11 kV generation board
with two gensets). On MV gear it stands above the bar like an incomer, on an
LV board over the bar; several supplies share one spread. A standby set on a
**changeover** is a `Bus Coupler` whose two ends are the board and the
generator (`MSB3, G1`, Notes `ATS`): the generator drops onto the board
through the coupler's device, with the coupler's ID and Notes beside it.

**The feeder is a placeholder.** A `Feeder` is the way out of the board it
names — an `LV Busbar`, an `MCC`, an `MV Busbar` or an `RMU` alike —
somewhere to hang equipment on. Anything may feed from one: a `Pump`, an
`MCC`, a `Transformer`, another board, a terminal item. What hangs there
takes the way's place in the row of ways, and the way stops drawing its
arrow, because it is no longer an open end. A way that carries **nothing**
is the outgoing cable it always was, and keeps its arrow.

Its **Protection cell decides whether the way carries a device of its own**.
Leave it empty and none is drawn, so a motor on a way has one device — its
own starter — and not two in series. Write one (`MCCB`, `Fuse`, `LBS`…) and
it is drawn above the equipment's, which is what a real board way feeding an
MCC or a sub-board looks like. A new feeder is proposed with the cell empty.
The one exception is an **RMU**, which draws the device of every way inside
its enclosure: a way out of one hands over a bare conductor from the bottom
of the box, because a second device below it would be the same switch drawn
twice.

A "way" that is **not on a board** — one named on a motor, or one whose own
supply the sheet never resolved — has nothing to hang anything from, so what
it carries draws floating and the row is named in the problems box.

> If you are bringing in a spreadsheet where the Protection column was left
> blank on ways that do have breakers, those breakers will not be drawn. The
> cell is visibly empty and the equipment table prints it empty, so the
> drawing and the table agree — fill the column in and they appear.

**Sub-boards.** An `LV Busbar` fed from a **Feeder** (`DBL1` feeds from `F1`)
or straight from another **LV Busbar** hangs on a row below its supply board,
under the way that feeds it, with its own feeders under it; the feeder's
device sits by the upper bar and the sub-board's own Protection, when given,
by its bar as its incomer. Cascades can be any depth, two boards can share
one feeder, and a sub-board can carry a tie, a motor, an MCC or a generator
like any other board.

**Outgoing ways on MV gear and terminal items.** A `Feeder` on an MV Busbar
or RMU is an outgoing cable way with its device and an arrow in the
transformer row. Three types need no load by design: `Capacitor Bank`,
`Earthing/NER` (neutral earthing resistor) and `Surge Arrester`, each drawn
with its IEC symbol to earth, on MV gear or an LV board. You need not even
change the Type: a `Feeder` whose Description or Notes says *capacitor*,
*PFC*, *kvar*, *NER*, *earthing* or *arrester* is drawn as that item, and a
`Transformer` with no load whose row says *earthing*, *NER* or *zig-zag* is
an earthing transformer, ending in a resistor to earth instead of an "outgoing
not defined" stub.

**Notes that change the symbol.** *VSD* (or *VFD*, *drive*) in a motor's
Description or Notes puts a drive box on its drop, and *soft starter* (or
*soft start*) a *Soft S.* box in the same place — a drive wins when a row
says both; Notes starting with
*spare*, *future* or *out of service* dash the way's conductor; *N.O.* or
*normally open* in an RMU's Notes marks the open point of a ring with an
"N.O." on the cable to the RMU it names (`N.O. towards RMU2`), or under the
box when no way is named. Nothing else in Notes is read.

**Motors.** A `Pump` on an MV Busbar or RMU is an MV motor drawn in the
transformer row. A `Pump` on an **LV Busbar** is an LV motor drawn in the
feeder band below the board, and a `Pump` fed straight from a **Transformer**
hangs under that transformer (a dedicated motor supply). When that transformer
itself feeds from an LV board (a 400/300 V motor supply, say) it is a way of
the board: dot on the bar, the board's device, the transformer on the row
below, the motor under its secondary.

A transformer's secondary goes to one place: the incomer of the board it
feeds. So a `Pump` or `MCC` whose `Feeds From` names a transformer that also
feeds a board is drawn as a **way of that board**, taking its protection from
the bar, and the reader prints a note suggesting the board in `Feeds From`. A
transformer that feeds **no board** keeps its loads under it: a dedicated
motor transformer, or a pump-station transformer feeding an `MCC` directly,
which is then drawn as the board itself: transformer, incomer device, MCC box,
its bus and the motors inside the dashed outline. An `MCC` belongs on an
LV Busbar; putting one on MV gear warns. A `Pump` or `Feeder` can feed from
an **MCC**: the MCC then gets a bus of its own on the row below the board,
and its motors hang off that bus with their starters (a contactor unless the
row's Protection says otherwise). Its incomer, box and bus sit inside a
dashed outline, like an RMU, so the MCC reads as one piece of switchgear.

Either type can also hang off an **RMU**: it takes a proper way inside the
enclosure, with its device on the tee-off. A generation **LV board** under an
SU is sized from its own feeders like any other board.

An MV Busbar or RMU can itself feed from another MV Busbar: the fed board or
RMU is then drawn on its own tier below its source, with the feed through its
Protection device. Cascades can be any depth (main MV board -> sub-board ->
sub-sub-board), and the transformer and LV rows move down to suit.

**Spurs and sub-rings.** RMUs that feed from each other draw side by side as
a ring. Where one RMU of a ring feeds a branch that has no supply of its own
(a spur RMU, or a sub-ring fed at both ends from the same RMU), that branch
hangs a tier below it: a tee-off way in the enclosure, a dog-leg cable down
to the branch, and the branch's own ring beside the enclosure's other ways.
A link written on both rows (`R1` feeds from `R2` and `R2` from `R1`) is
drawn once.

**Several voltage levels.** Whatever feeds a board is drawn above it. A board
fed from another board, directly or through a transformer, sits one tier
below it, so a 33 kV board, the 11 kV board its grid transformer feeds and a
3.3 kV pump board under that draw as three rows, with each transformer drawn
between the two tiers it joins: the upper board's breaker above it, the fed
board's incomer below. The Voltage column is printed but never read for
layout, so two boards of the same voltage can sit at different heights, and
the row direction is the one lever: write `MV ← ET ← HV ← U` to put the grid
on top, or `HV ← ET ← MV` to show an export board below the collector with
its utility incomer beside it.

Every sideways run (a board fed from two transformers, a step-up taking
supply from an LV board, a transformer fed from a board with no load entered
yet, a sub-board or RMU offset from its feeder) gets a lane of its own, so no
two connections ever share a line; the protection device always sits at the
board end of the run, where the cubicle is.

That's all the connectivity the tool needs: everything hangs off `Feeds From`.
A bus coupler feeds from its two busbars (`BB1, BB2`); an RMU on a ring feeds
from both ring incomers (`MV1, MV2`). A coupler between boards on **different levels** runs in the gap beside the two boards (to the left if the right is taken), its device on the vertical; a coupler that reaches past an **intervening board** runs on its own lane above the bar row with its device at its own end, clear of the other board's incomer. A sub-board fed from **two feeders** gets one landing point and one incomer device per feeder, like a board fed from two transformers. Couplers must join
two busbars of the same kind — anything else (an RMU, one board, three boards)
warns instead of drawing, and a duplicate coupler on a pair warns too.

## Example configurations

| Workbook | Configuration | Sketch |
|---|---|---|
| `examples/config1_single_tx.xlsx` | MV incomer → RMU → 1000 kVA transformer → LV busbar, 4 feeders | `output/config1.svg` |
| `examples/config2_twin_tx.xlsx` | MV incomer → RMU → 2× 1600 kVA transformers → two LV busbars + bus coupler, 6 feeders | `output/config2.svg` |
| `examples/config3_ring_main.xlsx` | Ring main: 2 MV incomers → RMU → 800 kVA transformer → LV busbar, 3 feeders | `output/config3.svg` |
| `examples/config4_dual_mv_boards.xlsx` | 2 utility incomers → 2 MV switchboards (6 riser feeders each, N.O. bus tie) → 3 transformers + 3 MV pumps per board; each transformer → LV board with 2–3 MCCs | `output/config4.svg` |
| `examples/config5_cascaded_rmus.xlsx` | Utility incomer → RMU1, which feeds RMU2 and RMU3 by interconnecting cables; each of those feeds a 1000 kVA transformer, and each transformer feeds two LV panels | `output/config5.svg` |
| `examples/config6_closed_ring.xlsx` | Same as config 5 but with the RMU2–RMU3 cable in place, closing the ring RMU1–RMU2–RMU3–RMU1 (RMU3 feeds from `RMU1, RMU2`) | `output/config6.svg` |
| `examples/config7_mcc_motors.xlsx` | Pump station: utility incomer → RMU → 1000 kVA transformer → LV board with three MCCs; the pump MCC feeds four motors (one on a VSD) and an auxiliaries feeder, the blower MCC two VSD motors, each MCC in its own dashed enclosure | `output/config7.svg` |

The example tables live in `testdata/examples/*/rows.csv`; `node
tools/gen-fixtures.mjs` regenerates the workbooks (into `build/xlsx/`) and
the page's built-in examples from them, and `node src/cli/sld.js draw
<workbook> -o <out.svg>` draws a sketch.

**DXF export.** `node src/cli/sld.js draw <workbook> --dxf` writes the SVG
and a `.dxf` beside it (or `node src/cli/sld.js dxf <workbook> -o out.dxf` for
the DXF alone). The file is R12 DXF, the dialect every CAD package and viewer opens:
the sketch exactly as the SVG draws it, built from the same symbol
primitives, with the equipment table that produced it laid out beside the
sheet, to its right. The drawing is centred on the origin and the file's
opening view is fitted to it, so it comes up in the middle of the window in
any CAD program. One drawing unit is one sketch pixel, meant as 1 mm. Entities are
sorted onto layers so a CAD user can switch parts off: `SLD_DRAWING`
(conductors and symbols), `SLD_BUSBAR` (the thick bars, as polylines with
width), `SLD_TEXT`, `SLD_ENCLOSURE` (RMU boxes, dashed), `SLD_FRAME` (title
and title block), `SLD_LEGEND` and `SLD_TABLE`. The Sketchpad page has the
same exporter behind its **Download DXF** button. CAD text
is set with a width factor that keeps it no wider than the browser's, long
table cells wrap, and `node src/cli/sld.js dxf <workbook> --check` reads the
file back and reports any text that overlaps another text or crosses a table
rule.

**PDF export.** `node src/cli/sld.js pdf <workbook> -o out.pdf` writes one A3
landscape page: the sketch with the equipment table beside it or under it,
whichever leaves the drawing bigger, scaled to fit and centred. It is drawn
through the same symbol primitives as the SVG and the DXF, so nothing about
the drawing moves. The text is set in the base-14 Helvetica, so no font
travels in the file and none is fetched, and nothing is compressed, so the
file is plain ASCII. The page has the same exporter behind **Download PDF**.

**Checking a drawing against its table.** `node src/cli/sld.js check
<workbook>` draws the sheet and verifies, from the scene the renderer records,
that every item is drawn and every `Feeds From` edge is a continuous conductor
between the two symbols; it also reports conductors drawn on top of each
other and drawn nets the table does not contain. It exits 1 unless every
table given is clean.

## Test data and tests

`testdata/` is the pool of survey tables the engine is tested against — 48
cases in five groups (`examples`, `sites`, `levels`, `features`, `audit`),
each a folder with `rows.csv` (the equipment table, exactly the columns of
the workbook), `case.json` (site info, a one-line description, what the case
expects) and `golden.svg` (the drawing the page produces today). The
workbooks and the page's built-in examples are generated from it:

```bash
npm test                          # node --test: every case draws its golden, generators in step
node tools/golden.mjs             # redraw every case, list changes (--report out.html for a side-by-side)
UPDATE_GOLDEN=1 node tools/golden.mjs   # accept the current drawing as the new golden
node tools/gen-fixtures.mjs       # build/xlsx/<group>/<case>.xlsx + the page's presets block
node tools/import-xlsx.mjs sites survey.xlsx   # add a workbook as a new case
node tools/smoke-page.mjs         # drive the page in headless Chromium (needs Chrome)
```

Needs Node 20+ and nothing from npm: `.xlsx` is read and written with the
vendored SheetJS build. `testdata/README.md` describes the case format and
the history of scores; `docs/CONSTITUTION.md` states the rules the data and
the drawing obey; `docs/PLAN.md` is the roadmap.

## Code layout

```
vendor/       xlsx.full.min.js (SheetJS) and fonts/ (Archivo, IBM Plex Mono)
src/core/     the engine, as ES modules: types, supplies (which supply can feed
              which row), diagnostics, geometry, model (the
              reader), graph, rules/ + rank + facts (what the engine infers),
              layout, svg (primitives and symbols), symbols/registry (one entry
              per symbol: legend and palette), render, eqtable (the equipment
              table beside the sheet), dxf, pdf, scene + check (the
              drawing verified against the table), pipeline (draw())
src/io/       csv and xlsx (SheetJS) ⇄ table rows
src/ui/       page.html (template), app.js (table, viewer, import), presets.generated.js
src/cli/      sld.js — draw | dxf
tools/        import-xlsx, golden, gen-fixtures, build-page, smoke-page, usage-baseline, proposal-audit
testdata/usage/  the entry baseline: actions per task, outcomes when the topology is wrong
testdata/proposals/  the proposal audit: what a surveyor has to correct after a drop, ranked
testdata/     the cases; test/ the node --test suites
```

**The entry baseline.** `testdata/usage/baseline.json` is what the page costs
a surveyor, measured: `node tools/usage-baseline.mjs` replays the common
data-entry tasks in the page under headless Chromium — five feeders on a
board, ten rows from a spreadsheet, a board renamed, a typo'd supply fixed, a
feeder moved, a coupler drawn, a semicolon-separated file imported — and
counts every click, key, drop and value entered, recording too whether the
drawing on screen was fresh or stale and whether an export was possible. The
`W*` entries record what the page does when the topology goes wrong: a board
with ways deleted, a supply in the wrong case, a coupler with one end or with
a supply too many, a spreadsheet with a decoy ID column. `--check` fails on
any difference, so an improvement lands with the number it earned and a
regression cannot land quietly. `testdata/usage/README.md` states the
counting rule.

**The proposal audit.** `testdata/proposals/AUDIT.md` is whether what the
engine pre-fills is what the sheet wanted, measured: `node
tools/proposal-audit.mjs` generates two hundred plausible sites from a seeded
grammar, scores each for plausibility (its shape's frequency among the real
fixtures × hard consistency checks × how often the pool writes each value),
builds each the way a surveyor does — drop the item on its supply, read the
proposal, correct it, fill the rest — and ranks the corrections by how often
they happen on how plausible a site. Every correction is labelled against the
pool, and only the ones the pool backs make the headline; the generator's
opinion is kept apart. `--check` fails if any class moves, `--page` rebuilds
one sheet per shape in the browser and confirms the page hands over exactly
what the engine returns. The audit proposes the engine change that would
remove each class; it does not make it (`testdata/proposals/README.md`).

**Continuous integration.** `.github/workflows/ci.yml` runs on every push and
pull request, in two jobs so a failure says which half broke. `engine` is pure
Node — the test suites, the 79 goldens byte for byte, and a check that the
generated files (the presets, the example workbooks, `sld_sketchpad.html`) are
not stale, because a source edit that was never rebuilt ships a stale page.
`page` builds the page, drives it in headless Chrome for the smoke checks, and
holds the entry baseline. Nothing is installed: there are no npm dependencies
and SheetJS is vendored.

**The demo film.** `node tools/demo-video.mjs` records
`output/sld-demo.mp4` — a narrated run through drawing a small substation by
dragging symbols, from the incomer to the last pump. It drives the same
headless Chromium the smoke test uses, and every drop in it is a real `drop`
event carrying a real `DataTransfer`, so the film cannot show behaviour the
page does not have; a pointer, the carried chip and a caption bar are drawn
over the page, and nothing else is touched. It needs `ffmpeg` and `espeak-ng`,
the only two things in this repository that are not already needed to run the
tests — which is why CI does not run it.

For the commentary it looks for three synthesisers, best first, and they are
three different things. **piper** is a neural vocoder trained on recorded
speech: it generates the waveform continuously, so there are no seams inside a
word — `pip install piper-tts`, then put a voice model in `vendor/piper/`
(gitignored, ~60 MB; `en_GB-alba-medium.onnx` and its `.json` from the
`rhasspy/piper-voices` collection). **mbrola** (`apt-get install mbrola
mbrola-en1`) is diphone synthesis — recorded fragments butted together, warmer
than formant but you can hear the joins. **espeak-ng** alone is formant
synthesis: nothing in it was ever spoken, and it is the metallic one, kept so
the tool always runs. Either way the narration is EQ'd and levelled on the way
out, lightly for piper and heavily for the others.

`sld_sketchpad.html` is **built**: `node tools/build-page.mjs` concatenates
the modules into the page's single `<script>` (browsers refuse `import` from
`file://`, and the page must open from a plain file) and inlines the vendored
fonts as `data:` URIs. Edit `src/`, rebuild, and `npm test` fails if the page
or the presets are out of step. `node tools/vendor-fonts.mjs` refreshes the
font files themselves; it is the one step that needs the network.

## What the symbols mean

IEC-style sketch symbols: MV incomers come in from the top (source tick),
the RMU is a dashed enclosure with load-break switches on the incoming ways and
a fuse-switch on each transformer tee-off, MV and LV busbars are the thick
horizontal bars, transformers are the two overlapping circles, pumps/motors are
a circle with an "M 3~", MCCs are small labelled boxes, and the switch symbol
with an × at its hinge is a circuit breaker (every way on an MV switchboard
gets one). Feeders drop off a busbar
and end in an arrow; a Bus Coupler between two busbars is drawn as a breaker in
the gap, with its Notes text (e.g. "Normally open") underneath. The legend
folds into as many rows as the sheet width allows, and the sheet grows so
the longest feeder label never reaches the title line. A capacitor
bank is the two plates to earth, a neutral earthing resistor the box to
earth, a surge arrester the box with the arrow inside, to earth; the legend
gains these entries only on sheets that use them.

The Protection column swaps the device drawn on an item's supply side, using
IEC 60617 notation, where the function mark sits at the hinge of the switch
blade: an × at the hinge is a circuit breaker, a circle at the hinge (blade
onto a contact bar) is a load-break switch (switch-disconnector), an arc at
the hinge is a contactor, a small rectangle with the conductor through it is
a fuse (switch + rectangle = fuse-switch), and a Fused contactor (a motor
starter, on an MCC way or an MV motor) is the fuse in series with the contactor. The words are read
loosely, so a sheet may say what it says: `MCCB`, `MCB`, `ACB`, `VCB`, `RCBO`,
`Breaker` all draw the breaker; `Isolator`, `Disconnector`, `Switch` the
load-break switch; `SFU`, `Switch-fuse` the fuse-switch; `Starter`,
`Motor starter` the fused contactor; `Unknown` or `TBC` the default symbol,
without a complaint. A word outside that vocabulary still draws the default
symbol and is reported, so `Thermal relay` — a relay, not a switching device —
is drawn as the breaker it trips and named in the problems box.
Protection never changes the topology — only `Feeds
From` does — it only changes which symbol sits on the connection. Protection
on an MV Incomer is the utility's device and is not drawn (you get a warning).
RMU-to-RMU interconnecting cables draw a load-break switch inside each
enclosure by default; the fed RMU's Protection entry can override the symbol
on its incoming way.

This is a *sketch* tool for survey records — not a protection study or a
CAD-grade drawing.
