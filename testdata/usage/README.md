# The entry baseline

`baseline.json` is what the page costs a surveyor today, measured: how many
actions the common data-entry tasks take, and what the page does when the
topology goes wrong. `node tools/usage-baseline.mjs` replays every task in the
page under headless Chromium and writes the file; `--check` replays and exits 1
on any difference. It sits beside the 77 golden drawings: they pin what is
*drawn*, this pins what it costs to *enter*.

## How actions are counted

One action is one of: a click, a drag, a choice in a select, a shortcut or
navigation key, or **one value entered** — typing a value counts 1 whatever
its length, because the letters are not overhead the tool can remove. Steps
taken outside the page (saving a file in another program so it can be
imported) count a fixed 3.

Each task also records what the surveyor is looking at when done:
`drawing` is `fresh`, `stale` (an error stopped the redraw and the previous
picture is still on screen) or `none`; `export` says whether Download PDF /
SVG / DXF would work.

## The tasks

| task | what the surveyor does |
|---|---|
| `T1_five_feeders` | adds five feeders to the board the last row is on |
| `T2_ten_rows_from_excel` | brings ten rows that exist in a spreadsheet |
| `T3_rename_board_with_ways` | renames a board that five rows feed from |
| `T4_fix_typo_supply` | corrects a supply typed as `BB!` |
| `T5_move_feeder` | moves a feeder from one board to the other |
| `T6_coupler_second_end` | draws a bus coupler between two boards |

## The wrong-topology scenarios

`W*` entries record the outcome, not a count: what the page does when a board
with ways is deleted, when a supply is written in the wrong case, when Enter is
pressed six times with only IDs typed, and when a feeder chip is dropped on a
pump.

## Changing the file

The file changes when the page changes. An improvement lands by running the
tool without `--check` and committing the lower numbers or the better outcome
with it; a rise in any count fails `--check` and is a regression to explain.
