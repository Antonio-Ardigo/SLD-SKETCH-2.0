# Test data

The pool of survey tables the engine is tested against. Every case is a
folder:

```
testdata/<group>/<name>/
  rows.csv      the equipment table — header exactly
                ID,Type,Description,Rating,Voltage,Protection,Feeds From,Notes
  case.json     name, group, one-line description, site info, what the case expects
  golden.svg    the drawing the engine produces for it (byte-exact)
```

`rows.csv` is the master copy of the table: text, one row per item, diffable,
and what a workbook's `Equipment` sheet holds cell for cell. The `.xlsx`
workbooks are generated from it (`node tools/gen-fixtures.mjs` →
`build/xlsx/<group>/<name>.xlsx`), and so is the presets block of
`sld_sketchpad.html` for the cases that carry a `preset` key.

`case.json`:

```json
{
  "name": "l1_chain", "group": "levels",
  "description": "33 kV → 33/11 → 11 kV → 11/0.4 → LV chain",
  "source": "tests/levels/l1_chain.xlsx",
  "info": { "site": "…", "date": "…", "by": "…", "notes": "…" },
  "preset": "1",                       // only the built-in examples
  "expect": {
    "golden": true,                    // the case must draw, and draw its golden.svg
    "legacy": { "items": 8, "errors": 0, "warnings": 0 }   // what the reader reports today
  }
}
```

Only the keys present under `expect` are asserted:

- `diagnostics` — the sorted `CODE:firstId` keys (`["DUP_ID:F1"]`) the reader
  must report; `src/core/diagnostics.js` is the catalogue.
- `golden: false` — the case must *not* draw (only an empty table does not draw; an error still draws, with the row it names floating or dropped and the message saying so).
- `ranks` — the row every board sits on, from the rank solver (`{"HV":0,"MV":1,"LV":2}`).
- `facts` — a subset of the named facts: `rings` (members, closed), `spurs`,
  `txDir` (class per transformer), `couplers`, `sources`, `subBoards`,
  `waysOfBoard`, `floating`.
- `check` — the drawing checker's verdict: `items: "all"`, `edges: "all"` (or
  `disconnected`/`via` counts), `overlaps`, `falseNets`. Every case that must
  draw cleanly says so here; `audit/w08_wrongloads` says `disconnected: 5`.
- `legacy` — item/error/warning counts from the reader (kept while the
  message-based reader exists).

## Groups

| group | cases | what they are |
|---|---|---|
| `examples` | 8 | the seven example configurations of the README plus the blank template; the page's presets |
| `sites` | 5 | deliberately demanding sites: 4 voltage levels, 3-deep LV cascade, pump station, 5-RMU ring with a sub-ring, PV/BESS/genset plant |
| `levels` | 10 | every arrangement of boards at different voltages joined by transformers (`levels/LEVELS.md`) |
| `features` | 15 | regression fixtures, each added after a bug |
| `audit` | 10 | sites written by an independent tester from the README alone (`audit/README.md`); `w08_wrongloads` is wrong on purpose |
| `topics` | 10 | topologies the original corpus lacked: three bus sections, three parallel transformers, three-supply boards, meshed MV boards, a double-ended substation, a UPS with bypass, a seven-row cascade, a forty-way board, a board-fed ring, an MCC cascade |
| `warnings` | 15 | one case per diagnostic code: duplicate ID, unknown supply, unknown type, a row with no ID, a loop no supply reaches, impossible supplies, open transformer ends, couplers that cannot be drawn, … Each `case.json` lists the `CODE:firstId` keys the reader must report |

## Commands

```bash
npm test                                # node --test: goldens, diagnostics counts, generators in step
node tools/golden.mjs [group[/name]]    # redraw and compare; --report out.html for a side-by-side page
UPDATE_GOLDEN=1 node tools/golden.mjs   # accept the current drawing (review the report first)
node tools/gen-fixtures.mjs             # regenerate build/xlsx/ and the page's presets
node tools/import-xlsx.mjs sites new_site.xlsx   # add a workbook as testdata/sites/new_site/
node tools/smoke-page.mjs               # drive the page in headless Chromium
```

## Adding a case

1. Write `rows.csv` by hand (or import a workbook with `tools/import-xlsx.mjs`).
2. Write `case.json` with a description that says which topology the case pins.
3. `UPDATE_GOLDEN=1 node tools/golden.mjs <group>/<name>` and look at the drawing.
4. `node tools/gen-fixtures.mjs`, then `npm test`.

## Scores

`BASELINE.md` is the journal of the checker scores at each engine change
(items drawn, edges connected, overlaps, false nets) as first measured by
`sld_check.py`. The same questions are now asked by `src/core/check.js` from
the scene the renderer records (`node src/cli/sld.js check testdata/*/*/`),
and every case carries its verdict in `expect.check`; the byte-exact goldens
remain the regression gate for the picture itself.

Both engines round a half-way coordinate the same way (`n1` / `n0`): Python's
`format` rounds half to even and JavaScript's `toFixed` does not, so 501.25
used to print 501.2 on one side and 501.3 on the other. The goldens are the
JavaScript engine's output.
