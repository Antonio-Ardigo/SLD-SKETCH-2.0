# The proposal audit

What a surveyor has to correct after a drop — measured, not argued.

`node tools/proposal-audit.mjs` generates plausible sites, builds each the way
a person does (drop the item on its supply, read what the engine pre-filled,
correct what is wrong, fill the rest), and ranks the corrections by how often
they happen on how plausible a site. It is the third instrument beside the
goldens (does it draw the same?) and the entry baseline (what does a task
cost?): **is what the engine proposes what the sheet wanted?**

    npm run proposals            # regenerate audit.json, AUDIT.md, configs/
    npm run proposals:check      # exit 1 if audit.json would change
    npm run proposals:page       # also replay one sheet per shape in the page (Node ≥ 22, Chromium)

Deterministic: the seed is in the header. The header also carries the engine
revision the report was generated at (informational, not compared) and a hash
of the pool it was read against (compared), so a diff has three causes and the
header says which: the seed or the grammar changed, the engine changed, or the
pool changed.

## Files

| file | what |
|---|---|
| `audit.json` | the run: header, every site with its score, every class of correction with its ranking, the information tables |
| `AUDIT.md` | the same, readable — **generated, do not edit** |
| `page.json` | the page pass, when run: identity of page and engine per drop, and where each intended value sits in the real pickers |
| `configs/NN_<site>_<shape>.csv` | the ten most plausible sites as plain `rows.csv`, to Import into the page and look at; not fixtures (no `case.json`) |

## How a site is scored

`P = A × C × V`, every factor in 0..1.

- **A** — how often the field-like fixtures (`sites/`, `audit/`, `examples/`;
  `audit/w10_everything` left out as a merge of three others) show this
  site's shapes, Laplace-smoothed, geometric mean over its shapes.
- **C** — hard consistency checks, multiplied. A row's level matches its
  supply's; a transformer's ratio bridges its two boards; a coupler's ends
  share a level; every row traces back to a root; nothing is fed from a motor
  or a terminal item. Any of those at 0 **rejects** the site — it stays in
  the JSON as `rejected`, out of every ranking. Softer checks penalise: a
  motor's size against its voltage (0.3), a board's rating against its
  transformer (0.5), a way rated above its board (0.5), a transformer that
  feeds nothing (0.6; an earthing transformer is exempt).
- **V** — how often the pool has written each cell's value for that type:
  1 if two or more rows have, 0.5 if one, 0.2 if none.

A few sites are given one deliberate fault (`injected`) so the checks have
work and the ranking a floor.

## How a correction is scored

Cost is the entry baseline's unit: 0 when the proposal was right, 1 when the
intended value is picked from a list or typed (one action wherever it sits —
the picker shows the whole list, and pricing a lower rank higher made every
value added to a list cost something), **1.5 when the proposal was wrong** — a
blank is always noticed, a wrong value can ship. The pick's rank is reported,
not priced. `desc` and `notes` always cost 1 and are never a
finding.

`potential = breadth × depth × mean P`: sites affected over sites, mean cost
per affected row, mean plausibility of the affected sites. A board with twenty
feeders cannot win by volume. The headline is `drop` mode (the item dropped on
its supply), both row orders merged; `click` mode (nothing selected, the
palette chip clicked) is its own table.

## Provenance

Every correction is labelled against the pool, and only **POOL** makes the
headline:

| label | meaning |
|---|---|
| POOL | the pool's own sheets write the intended value in this slice at least a quarter of the time, more often than the proposed one, on **three or more rows from two or more sheets** |
| MIXED | the pool has some of it (a tenth or more) |
| OPINION | only the generator's grammar wanted this |
| BLANK | the sheet left the cell empty — a blank is missing data, never evidence |

## Classes

| class | what it catches |
|---|---|
| `PROT_DEFAULT` | the device rule, by type × supply type |
| `VOLT_DEFAULT` | the voltage rule |
| `PLACEHOLDER_CHAIN` | an item dropped on a feeder whose label or device does not follow the board the way leaves (the proposal resolves the way to its board since round 2; anything left is a case that resolution misses) |
| `SECOND_SUPPLY` | a comma list the proposal did not complete: a coupler's far end is proposed when the sheet has exactly one other board of the kind (or one genset); a ring's other link never is |
| `SECOND_END_STALE_PROT` | an RMU's `LBS, LBS` once needed the comma *at drop time*; the page now proposes the device again when the second supply is added, and the replay judges the device on both ends named |
| `DELETE_PROPOSED` | the sheet blanks a proposal (labelled BLANK, never headline) |
| `SUPPLY_RANK` / `SUPPLY_LAST_WINS` | click mode: the wrong *kind* of supply, or the right kind but the bottom-most one |
| `SPELLING` | `Fused contactor` for `Fuse-contactor` — cost 0, the reader understands both |
| `UNINFERABLE` | a root nothing names yet — excluded |
| `DELIBERATE_BLANK` | the LV/LV ratio the engine leaves blank on purpose — reported apart |
| `OFFER_MISS` | a value the quick lists do not hold — information, ranked by pool count |
| `ENGINE_WARNING` / `VIA` / `DISCONNECTED` / `MISSING` | the engine's own verdict on a plausible sheet |

IDs are not corrections: site conventions (`MSB`, `LVB`, `INC`, `T`) are
reported once as a table against `TYPE_PREFIX`.

Each class ends with the engine change that would remove it, phrased against
`docs/EXTENDING.md` "A proposal rule". The audit proposes; it does not change
the engine.
