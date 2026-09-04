# Extending SLD-Sketch

Three things people add: a test case, a topological rule, a symbol. Each is
one place plus one fixture. `npm test` is the gate for all of them.

## A case

1. `mkdir testdata/<group>/<name>` and write `rows.csv` — the equipment table
   with the header `ID,Type,Description,Rating,Voltage,Protection,Feeds From,Notes`.
   Or import a workbook: `node tools/import-xlsx.mjs <group> survey.xlsx`.
2. Write `case.json`: `name`, `group`, a one-line `description` of the topology
   it pins, `info`, and what it expects — at least
   `"check": {"items":"all","edges":"all","overlaps":0,"falseNets":0}` and
   `"golden": true`. Add `ranks`, `facts` or `diagnostics` when the case is
   about them; add `view` to draw it under a view option.
3. `UPDATE_GOLDEN=1 node tools/golden.mjs <group>/<name>` writes the golden;
   open it and look. `node src/cli/sld.js check testdata/<group>/<name>/`
   prints the verdict.
4. `node tools/gen-fixtures.mjs && node tools/build-page.mjs`, then `npm test`.

## A rule

A rule reads the graph and says what it knows: rank constraints and facts.

1. Create `src/core/rules/<name>.js` exporting `{ name, apply(ctx) }`. In
   `apply`, walk `ctx.order` / `ctx.items` / `ctx.graph`, and:
   - `ctx.below(a, b, gap)` — row `a` sits at least `gap` rows below `b`
   - `ctx.same(a, b)` — `a` and `b` share a row
   - `ctx.ranked.add(id)` — `id` gets a rank at all
   - `ctx.tag(id, "tag")` — mark a node for the layout and the tests
   - `ctx.facts.<thing> = …` — record a named fact (constitution §5)
   `ctx.legacy` carries the predicates already computed once (depth, hang,
   links, sus, mid, lvsubs, gens).
2. Register it in `src/core/rules/index.js` in the order it should run
   (later rules may read earlier facts).
3. Add the case that needs it under `testdata/topics/` with `expect.ranks`
   and `expect.facts`, and extend `factsView()` in `test/fixtures.test.js` if
   the fact is new.
4. `test/facts.test.js` proves the solver still agrees with the historical
   tiers on every existing case; a deliberate change of policy goes in as a
   view option, not a rule (constitution §4).

## A symbol

1. Add an entry to `src/core/symbols/registry.js`: `key`, `label`, the
   `types` (or `devices`) it stands for, `legend: "always" | "when-used" |
   "never"`, and `draw(svg, cx, ytop, ybot)` using the canvas primitives
   (`line`, `rect`, `circle`, `text`, `poly`, `path`) and composites (`drop`,
   `lbs`, `fuseSwitch`, `earth`, …). The legend and the page's palette pick
   it up; the DXF writer gets it for free because it only overrides the
   primitives.
2. Draw it on the sheet where the type is rendered (`src/core/render.js`),
   inside `svg.begin(id, type)` … `svg.end()` so the page can find its row.
3. A new *type* also needs its aliases in `src/core/types.js` (`TYPE_LABELS`,
   `ALIASES`), a prefix in `TYPE_PREFIX` (`src/ui/app.js`) for auto-numbered
   IDs, and a case.

## A proposal rule (what a new row is pre-filled with)

`src/core/propose.js` is the whole of it — a pure function of the current
model, called only when a row is added.

- **A new ID prefix**: add the Type label to `TYPE_PREFIX`.
- **A new default protection**: add it to `TYPE_DEFAULT_PROT`, or, when it
  depends on what the item is fed from, to `proposeProt(type, supply)`.
- **A voltage rule**: `proposeVoltage(items, order, type, supply)` is a short
  chain of cases on the supply's type — transformer (take the secondary), MV
  gear (the ratio for a transformer, the level for anything else), LV gear
  (the level). `parseVoltage` / `formatVoltage` / `formatRatio` do the
  reading and writing; `usualLvVolts` is the LV level the sheet already uses.
- **Which supply a new row lands on** is not here but in
  `src/core/supplies.js`, the one table of which parent type can feed which
  child type. `USUAL_SUPPLIES[childType]` is the child's usual supplies, best
  first; anything else that is not impossible is merely possible; `ROOT_TYPES`
  are the types proposed with no supply at all. A new *type* needs its row in
  `USUAL_SUPPLIES` — `test/supplies.test.js` fails until it has one. Nothing
  else: `defaultSupply` feeds `proposeRow`, `supplyCandidates` feeds the page's
  Feeds from picker, and `canSupply` is the reader's own IMPOSSIBLE_SUPPLY
  predicate, so the advice and the diagnostic can never drift. Changing rank 0
  changes what the reader warns about and moves the fixtures with it.
- Add the case to `test/propose.test.js`; nothing else needs to change,
  because the page only asks for a row and marks the fields the function says
  it filled.

## A view option

Add it with its default to `src/core/views.js`, read it where the drawing is
made (`applyView` in `src/core/geometry.js` for spacing; `VIEW.*` in
`render.js` for what is shown), expose it in the page's view bar, and let
`test/views.test.js` prove the graph, the ranks and the checker verdict do
not move under any of its values.

## The page's fonts

`vendor/fonts/` holds the `.woff2` files and `fonts.json` (each face's family,
weight, subset and unicode range); `fontCss()` in `tools/build-page.mjs` turns
them into `@font-face` rules with the file inline, so the built page needs no
network. To change a family or a weight, edit the `QUERY` in
`tools/vendor-fonts.mjs`, run it, rebuild the page, and update the CSS font
stacks in `src/ui/page.html`. The drawing itself always uses Arial with
Helvetica as fallback and is unaffected.
