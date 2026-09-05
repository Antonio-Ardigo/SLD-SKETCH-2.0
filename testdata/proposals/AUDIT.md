# Proposal audit — generated, do not edit

Run `node tools/proposal-audit.mjs` to regenerate. Seed 2026, 200 sites generated, 188 plausible (12 rejected by the consistency checks), engine f0de18c, pool 1fabdc82ab92 (22 field-like fixtures: sites, audit, examples).

**What this measures.** Each site is built the way a surveyor builds it: drop the item on its supply, read what the engine pre-filled, correct what is wrong, fill the rest. A *correction* is a proposed value the sheet did not want. cost is in the entry baseline's unit: 1 per value entered or picked, wherever it sits in the list, 1.5 for a wrong proposal (it can ship), 0 for a right one. potential = breadth (sites affected / sites) × depth (mean cost per affected row) × mean P of the affected sites; headline is drop mode, both orders; only POOL-labelled classes are high potential.

**Provenance.** POOL: the pool's own sheets agree with the correction, not with the engine. MIXED: the pool has some of it. OPINION: only the generator wanted this. BLANK: the sheet left the cell empty — never evidence.

Sample check: the top ten classes over the first 50 sites agree with the full run on 9 of 10.

## High potential — corrections the pool backs

| # | class | type | fed from | correction | pool share (rows / sheets) | sites | breadth | depth | mean P | potential | proposed change |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | PROT_DEFAULT | feeder | lv busbar | — → CB | 0.979 (118 / 20) | 188 | 1 | 1 | 0.194 | 0.194 | deliberate: a feeder is proposed blank so that equipment hung on it gets one device, not two (PR #11). The pool writes a device on nearly every way. A way out: propose MCCB on the drop, and clear it when something is dropped onto the feeder while the cell is still the engine's (it is tinted, so the page knows) |
| 2 | SECOND_SUPPLY | bus coupler | lv busbar | BB1, BB2 | — | 74 | 0.394 | 1.006 | 0.181 | 0.072 | proposeOtherEnd names a coupler's far end only when the sheet leaves no doubt (one other board of the kind, or one genset); here it did not — the surveyor Shift-drags the coupler onto the far end |
| 3 | PROT_DEFAULT | feeder | mv busbar | — → CB | 1 (3 / 3) | 33 | 0.176 | 1 | 0.183 | 0.032 | deliberate: a feeder is proposed blank so that equipment hung on it gets one device, not two (PR #11). The pool writes a device on nearly every way. A way out: propose CB on the drop, and clear it when something is dropped onto the feeder while the cell is still the engine's (it is tinted, so the page knows) |
| 4 | SECOND_SUPPLY | bus coupler | mv busbar | MVB1, MVB2 | — | 29 | 0.154 | 1 | 0.183 | 0.028 | proposeOtherEnd names a coupler's far end only when the sheet leaves no doubt (one other board of the kind, or one genset); here it did not — the surveyor Shift-drags the coupler onto the far end |
| 5 | SECOND_SUPPLY | rmu | mv incomer | MV1, R4 | — | 27 | 0.144 | 1 | 0.166 | 0.024 | a ring's other link is not proposed: which RMU closes the ring is the surveyor's call, made by Shift-dragging the RMU onto it |
| 6 | SECOND_SUPPLY | rmu | rmu | RMU1, RMU3 | — | 27 | 0.144 | 1 | 0.166 | 0.024 | a ring's other link is not proposed: which RMU closes the ring is the surveyor's call, made by Shift-dragging the RMU onto it |

## Generator opinion — corrections the pool does not back

| class | type | fed from | correction | label | pool: intended / proposed (rows) | sites | potential | note |
|---|---|---|---|---|---|---|---|---|
| PROT_DEFAULT | pump | mcc | Fused contactor → CB | OPINION | 0 / 1 (4) | 68 | 0.106 | proposeProt: a pump fed from mcc → CB instead of Fused contactor (one line in the supply-type chain) |
| PROT_DEFAULT | pump | lv busbar | CB → Contactor | MIXED | 0.161 / 0.839 (5) | 45 | 0.073 | proposeProt: a pump fed from lv busbar → Contactor instead of CB (one line in the supply-type chain) |
| DELETE_PROPOSED | pump | mcc | Fused contactor → — | BLANK | 0 / 0 (0) | 63 | 0.063 | the sheet leaves this prot empty on a pump; a blank is not evidence (one tester's habit), so no change unless the pool's filled cells agree |
| PROT_DEFAULT | capacitor bank | lv busbar | — → CB | MIXED | 1 / 0 (1) | 63 | 0.057 | proposeProt: give a capacitor bank a default (CB) — TYPE_DEFAULT_PROT has none |
| PROT_DEFAULT | capacitor bank | mv busbar | — → CB | MIXED | 1 / 0 (1) | 27 | 0.026 | proposeProt: give a capacitor bank a default (CB) — TYPE_DEFAULT_PROT has none |
| PROT_DEFAULT | pump | mv busbar | Fused contactor → CB | MIXED | 0.437 / 0.563 (13) | 4 | 0.004 | proposeProt: a pump fed from mv busbar → CB instead of Fused contactor (one line in the supply-type chain) |

## The palette click — where a row lands with no target

In `click` mode nothing is selected and the supply is `defaultSupply`: SUPPLY_RANK is the wrong *kind* of supply, SUPPLY_LAST_WINS the right kind but the bottom-most one when the sheet has several.

| class | type | intended supply type | sites | breadth | mean pick rank | potential | proposed change |
|---|---|---|---|---|---|---|---|
| SUPPLY_RANK | lv busbar | feeder | 90 | 0.479 | 1.752 | 0.145 | no change: the pool has lv busbars on transformer more often than on feeder, so the click lands on the commoner kind; this one is dropped on its supply instead |
| SUPPLY_LAST_WINS | feeder | lv busbar | 123 | 0.654 | 1 | 0.117 | a palette click with nothing selected lands on the bottom-most lv busbar; with two on the sheet the surveyor drops the chip, or selects the board first (a click adds under the selected row) |
| SUPPLY_RANK | pump | feeder | 45 | 0.239 | 2 | 0.094 | no change: the pool has pumps on mcc more often than on feeder, so the click lands on the commoner kind; this one is dropped on its supply instead |
| SUPPLY_LAST_WINS | lv busbar | transformer | 87 | 0.463 | 1 | 0.086 | a palette click with nothing selected lands on the bottom-most transformer; with two on the sheet the surveyor drops the chip, or selects the board first (a click adds under the selected row) |
| SUPPLY_LAST_WINS | mcc | lv busbar | 91 | 0.484 | 1 | 0.086 | a palette click with nothing selected lands on the bottom-most lv busbar; with two on the sheet the surveyor drops the chip, or selects the board first (a click adds under the selected row) |
| SUPPLY_RANK | transformer | feeder | 32 | 0.17 | 2 | 0.058 | no change: the pool has transformers on mv busbar more often than on feeder, so the click lands on the commoner kind; this one is dropped on its supply instead |
| SUPPLY_RANK | feeder | mv busbar | 36 | 0.191 | 1.462 | 0.052 | no change: the pool has feeders on lv busbar more often than on mv busbar, so the click lands on the commoner kind; this one is dropped on its supply instead |
| SUPPLY_RANK | pump | lv busbar | 49 | 0.261 | 1 | 0.051 | no change: the pool has pumps on mcc more often than on lv busbar, so the click lands on the commoner kind; this one is dropped on its supply instead |
| SUPPLY_LAST_WINS | transformer | rmu | 46 | 0.245 | 1 | 0.041 | a palette click with nothing selected lands on the bottom-most rmu; with two on the sheet the surveyor drops the chip, or selects the board first (a click adds under the selected row) |
| SUPPLY_RANK | rmu | rmu | 46 | 0.245 | 1 | 0.041 | no change: the pool has rmus on mv incomer more often than on rmu, so the click lands on the commoner kind; this one is dropped on its supply instead |

## The engine's own verdict on plausible sites

| finding | sites | breadth | mean P | example |
|---|---|---|---|---|
| OVERLAP\|3 | 20 | 0.106 | 0.164 | 2026-020: 3 |
| DISCONNECTED\|• ~ • (•) | 9 | 0.048 | 0.176 | 2026-035: LVB2 ~ T3 (F8) |
| VIA\|• -> • | 3 | 0.016 | 0.089 | 2026-039: LVB2 -> UPS1 |
| OVERLAP\|4 | 2 | 0.011 | 0.242 | 2026-036: 4 |
| OVERLAP\|6 | 1 | 0.005 | 0.178 | 2026-168: 6 |

## Values the lists do not offer

Typing costs the same one action as a pick, so these are information, ranked by how often the pool writes them.

| type | field | value | pool rows | sites here | change |
|---|---|---|---|---|---|
| pump | rating | 800 kW | 3 | 1 | QUICK.rating: add 800 kW to the pump list (src/ui/app.js) |
| pump | rating | 7.5 kW | 2 | 46 | QUICK.rating: add 7.5 kW to the pump list (src/ui/app.js) |
| transformer | voltage | 400/400 V | 2 | 19 | QUICK.volt: add 400/400 V to the transformer list (src/ui/app.js) |
| generator | rating | 2 MVA | 2 | 16 | QUICK.rating: add 2 MVA to the generator list (src/ui/app.js) |
| lv busbar | rating | 1000 A | 2 | 12 | QUICK.rating: add 1000 A to the lv busbar list (src/ui/app.js) |
| transformer | rating | 2 MVA | 2 | 11 | QUICK.rating: add 2 MVA to the transformer list (src/ui/app.js) |
| transformer | rating | 100 kVA | 2 | 10 | QUICK.rating: add 100 kVA to the transformer list (src/ui/app.js) |
| capacitor bank | rating | 1.5 Mvar | 1 | 40 | QUICK.rating: add 1.5 Mvar to the capacitor bank list (src/ui/app.js) |
| transformer | rating | 20 MVA | 1 | 15 | QUICK.rating: add 20 MVA to the transformer list (src/ui/app.js) |
| transformer | rating | 50 kVA | 1 | 13 | QUICK.rating: add 50 kVA to the transformer list (src/ui/app.js) |
| earthing | rating | 300 A 10 s | 1 | 7 | QUICK.rating: add 300 A 10 s to the earthing list (src/ui/app.js) |
| lv busbar | rating | 100 A | 0 | 19 | QUICK.rating: add 100 A to the lv busbar list (src/ui/app.js) |
| transformer | rating | 5 MVA | 0 | 16 | QUICK.rating: add 5 MVA to the transformer list (src/ui/app.js) |
| capacitor bank | rating | 1200 kvar | 0 | 12 | QUICK.rating: add 1200 kvar to the capacitor bank list (src/ui/app.js) |
| pump | rating | 630 kW | 0 | 7 | QUICK.rating: add 630 kW to the pump list (src/ui/app.js) |

## Left blank on purpose, and what the pool writes there

| type | fed from | intended | label | pool share | sites |
|---|---|---|---|---|---|
| transformer | feeder | 0.4/0.23 kV | OPINION | 0.011 | 23 |
| transformer | lv busbar | 400/400 V | MIXED | 0.148 | 19 |

Uninferable: 257 root voltages (a root nothing on the sheet yet names — the first incomer, a second one), excluded from every ranking.

## ID prefixes — the engine's against the pool's

| type | engine | pool (weight) |
|---|---|---|
| bus coupler | BC | TIE 0.139, LT 0.087, BC 0.077, ATS 0.06, C 0.043 |
| capacitor bank | CAP | CAP 0.05 |
| earthing | NER | NER 0.05 |
| feeder | F | F 4.84, FA 0.22, FS 0.147, FL 0.103, FG 0.071 |
| generator | G | G 0.306, PV 0.091, DG 0.091, BESS 0.045 |
| lv busbar | BB | L 0.533, BB 0.479, LVB 0.476, LVP 0.444, MSB 0.306 |
| mcc | MCC | MCC 0.885, M 0.091, MC 0.065, MCCX 0.063, MCCF 0.063 |
| mv busbar | MVB | MVB 0.285, HV 0.15, MV 0.15, PB 0.092, B 0.071 |
| mv incomer | MV | MV 1.68, U 0.38, INC 0.276, I 0.071 |
| pump | P | P 1.54, B 0.228, PX 0.125, M 0.088, PM 0.064 |
| rmu | RMU | RMU 1.146, R 0.285, RB 0.043, RS 0.029 |
| surge arrester | SA | SAR 0.043, SA 0.029 |
| transformer | TX | TX 1.502, T 0.493, SU 0.208, GT 0.15, VT 0.071 |

## Fill cost

4530 rows placed, 11850 actions, **2.616 per row** in the baseline's unit (desc and notes always cost 1 each; they are never proposed).

## Per archetype

**single_tx** — 188 sites, A = 0.647

| class | label | sites | potential |
|---|---|---|---|
| PROT_DEFAULT\|feeder\|lv busbar\|prot\|→cb | POOL | 188 | 0.194 |
| PROT_DEFAULT\|pump\|mcc\|prot\|fuse-contactor→cb | OPINION | 68 | 0.106 |
| PROT_DEFAULT\|pump\|lv busbar\|prot\|cb→contactor | MIXED | 45 | 0.073 |
| SECOND_SUPPLY\|bus coupler\|lv busbar | POOL | 74 | 0.072 |
| DELETE_PROPOSED\|pump\|mcc\|prot\|fuse-contactor→ | BLANK | 63 | 0.063 |

**twin_tx_coupler** — 54 sites, A = 0.265

| class | label | sites | potential |
|---|---|---|---|
| SECOND_SUPPLY\|bus coupler\|lv busbar | POOL | 54 | 0.192 |
| PROT_DEFAULT\|feeder\|lv busbar\|prot\|→cb | POOL | 54 | 0.191 |
| PROT_DEFAULT\|pump\|mcc\|prot\|fuse-contactor→cb | OPINION | 23 | 0.115 |
| DELETE_PROPOSED\|pump\|mcc\|prot\|fuse-contactor→ | BLANK | 27 | 0.098 |
| PROT_DEFAULT\|pump\|lv busbar\|prot\|cb→contactor | MIXED | 15 | 0.088 |

**rmu_ring** — 46 sites, A = 0.176

| class | label | sites | potential |
|---|---|---|---|
| PROT_DEFAULT\|feeder\|lv busbar\|prot\|→cb | POOL | 46 | 0.169 |
| SECOND_SUPPLY\|rmu\|mv incomer | POOL | 27 | 0.098 |
| SECOND_SUPPLY\|rmu\|rmu | POOL | 27 | 0.098 |
| PROT_DEFAULT\|pump\|mcc\|prot\|fuse-contactor→cb | OPINION | 14 | 0.084 |
| PROT_DEFAULT\|capacitor bank\|lv busbar\|prot\|→cb | MIXED | 17 | 0.061 |

**pump_station_mcc** — 136 sites, A = 0.206

| class | label | sites | potential |
|---|---|---|---|
| PROT_DEFAULT\|feeder\|lv busbar\|prot\|→cb | POOL | 136 | 0.189 |
| PROT_DEFAULT\|pump\|mcc\|prot\|fuse-contactor→cb | OPINION | 68 | 0.146 |
| DELETE_PROPOSED\|pump\|mcc\|prot\|fuse-contactor→ | BLANK | 63 | 0.087 |
| SECOND_SUPPLY\|bus coupler\|lv busbar | POOL | 59 | 0.08 |
| PROT_DEFAULT\|pump\|lv busbar\|prot\|cb→contactor | MIXED | 29 | 0.065 |

**dual_mv_boards** — 29 sites, A = 0.147

| class | label | sites | potential |
|---|---|---|---|
| PROT_DEFAULT\|feeder\|lv busbar\|prot\|→cb | POOL | 29 | 0.183 |
| SECOND_SUPPLY\|bus coupler\|mv busbar | POOL | 29 | 0.183 |
| PROT_DEFAULT\|pump\|mcc\|prot\|fuse-contactor→cb | OPINION | 10 | 0.113 |
| PROT_DEFAULT\|capacitor bank\|lv busbar\|prot\|→cb | MIXED | 11 | 0.058 |
| PROT_DEFAULT\|pump\|lv busbar\|prot\|cb→contactor | MIXED | 6 | 0.053 |

**genset_changeover** — 40 sites, A = 0.118

| class | label | sites | potential |
|---|---|---|---|
| PROT_DEFAULT\|feeder\|lv busbar\|prot\|→cb | POOL | 40 | 0.165 |
| SECOND_SUPPLY\|bus coupler\|lv busbar | POOL | 32 | 0.134 |
| PROT_DEFAULT\|pump\|mcc\|prot\|fuse-contactor→cb | OPINION | 15 | 0.104 |
| PROT_DEFAULT\|pump\|lv busbar\|prot\|cb→contactor | MIXED | 11 | 0.066 |
| DELETE_PROPOSED\|pump\|mcc\|prot\|fuse-contactor→ | BLANK | 10 | 0.039 |

**pfc** — 97 sites, A = 0.088

| class | label | sites | potential |
|---|---|---|---|
| PROT_DEFAULT\|feeder\|lv busbar\|prot\|→cb | POOL | 97 | 0.169 |
| PROT_DEFAULT\|capacitor bank\|lv busbar\|prot\|→cb | MIXED | 63 | 0.11 |
| SECOND_SUPPLY\|bus coupler\|lv busbar | POOL | 41 | 0.073 |
| PROT_DEFAULT\|pump\|lv busbar\|prot\|cb→contactor | MIXED | 26 | 0.072 |
| PROT_DEFAULT\|pump\|mcc\|prot\|fuse-contactor→cb | OPINION | 27 | 0.071 |

**lv_subboards** — 97 sites, A = 0.176

| class | label | sites | potential |
|---|---|---|---|
| PROT_DEFAULT\|feeder\|lv busbar\|prot\|→cb | POOL | 97 | 0.172 |
| PROT_DEFAULT\|pump\|mcc\|prot\|fuse-contactor→cb | OPINION | 37 | 0.103 |
| SECOND_SUPPLY\|bus coupler\|lv busbar | POOL | 44 | 0.078 |
| PROT_DEFAULT\|pump\|lv busbar\|prot\|cb→contactor | MIXED | 23 | 0.063 |
| DELETE_PROPOSED\|pump\|mcc\|prot\|fuse-contactor→ | BLANK | 36 | 0.062 |

**mv_motors** — 15 sites, A = 0.147

| class | label | sites | potential |
|---|---|---|---|
| PROT_DEFAULT\|feeder\|lv busbar\|prot\|→cb | POOL | 15 | 0.186 |
| PROT_DEFAULT\|pump\|mcc\|prot\|fuse-contactor→cb | OPINION | 6 | 0.107 |
| DELETE_PROPOSED\|pump\|mcc\|prot\|fuse-contactor→ | BLANK | 7 | 0.076 |
| PROT_DEFAULT\|pump\|lv busbar\|prot\|cb→contactor | MIXED | 4 | 0.068 |
| PROT_DEFAULT\|pump\|mv busbar\|prot\|fuse-contactor→cb | MIXED | 4 | 0.056 |

**hv_primary** — 30 sites, A = 0.118

| class | label | sites | potential |
|---|---|---|---|
| PROT_DEFAULT\|feeder\|lv busbar\|prot\|→cb | POOL | 30 | 0.083 |
| PROT_DEFAULT\|pump\|mcc\|prot\|fuse-contactor→cb | OPINION | 9 | 0.041 |
| SECOND_SUPPLY\|bus coupler\|lv busbar | POOL | 14 | 0.039 |
| DELETE_PROPOSED\|pump\|mcc\|prot\|fuse-contactor→ | BLANK | 13 | 0.038 |
| PROT_DEFAULT\|capacitor bank\|lv busbar\|prot\|→cb | MIXED | 11 | 0.031 |

**ups_dc** — 19 sites, A = 0.029

| class | label | sites | potential |
|---|---|---|---|
| PROT_DEFAULT\|feeder\|lv busbar\|prot\|→cb | POOL | 19 | 0.114 |
| PROT_DEFAULT\|pump\|mcc\|prot\|fuse-contactor→cb | OPINION | 6 | 0.068 |
| DELETE_PROPOSED\|pump\|mcc\|prot\|fuse-contactor→ | BLANK | 9 | 0.058 |
| SECOND_SUPPLY\|bus coupler\|lv busbar | POOL | 8 | 0.049 |
| PROT_DEFAULT\|pump\|lv busbar\|prot\|cb→contactor | MIXED | 4 | 0.047 |

**ner** — 22 sites, A = 0.088

| class | label | sites | potential |
|---|---|---|---|
| PROT_DEFAULT\|feeder\|lv busbar\|prot\|→cb | POOL | 22 | 0.154 |
| PROT_DEFAULT\|pump\|mcc\|prot\|fuse-contactor→cb | OPINION | 9 | 0.103 |
| SECOND_SUPPLY\|bus coupler\|lv busbar | POOL | 10 | 0.072 |
| SECOND_SUPPLY\|bus coupler\|mv busbar | POOL | 7 | 0.05 |
| DELETE_PROPOSED\|pump\|mcc\|prot\|fuse-contactor→ | BLANK | 6 | 0.048 |

## Sites, by plausibility

| site | P | A | C | V | lowest factor | rows | shapes | corrections | fill / row |
|---|---|---|---|---|---|---|---|---|---|
| 2026-104 | 0.64706 | 0.647 | 1 | 1 | A | 16 | single_tx | 11 | 2.75 |
| 2026-131 | 0.64706 | 0.647 | 1 | 1 | A | 16 | single_tx | 12 | 2.844 |
| 2026-140 | 0.61752 | 0.647 | 1 | 0.954 | A | 16 | single_tx | 12 | 2.813 |
| 2026-043 | 0.35196 | 0.365 | 1 | 0.964 | A | 20 | pump_station_mcc single_tx | 10 | 2.65 |
| 2026-073 | 0.3439 | 0.365 | 1 | 0.942 | A | 16 | pump_station_mcc single_tx | 10 | 2.719 |
| 2026-022 | 0.34342 | 0.365 | 1 | 0.941 | A | 16 | pump_station_mcc single_tx | 9 | 2.625 |
| 2026-057 | 0.34198 | 0.365 | 1 | 0.937 | A | 16 | pump_station_mcc single_tx | 6 | 2.375 |
| 2026-067 | 0.33532 | 0.338 | 1 | 0.992 | A | 23 | rmu_ring single_tx | 15 | 2.717 |
| 2026-160 | 0.33405 | 0.365 | 1 | 0.915 | A | 16 | pump_station_mcc single_tx | 9 | 2.594 |
| 2026-030 | 0.32519 | 0.328 | 1 | 0.992 | A | 21 | pump_station_mcc single_tx twin_tx_coupler | 9 | 2.476 |
| 2026-196 | 0.32355 | 0.328 | 1 | 0.987 | A | 21 | pump_station_mcc single_tx twin_tx_coupler | 13 | 2.738 |
| 2026-055 | 0.32224 | 0.328 | 1 | 0.983 | A | 26 | pump_station_mcc single_tx twin_tx_coupler | 13 | 2.635 |
| 2026-135 | 0.30847 | 0.308 | 1 | 1 | A | 16 | mv_motors single_tx | 11 | 2.813 |
| 2026-049 | 0.30535 | 0.328 | 1 | 0.931 | A | 22 | pump_station_mcc single_tx twin_tx_coupler | 7 | 2.477 |
| 2026-174 | 0.30144 | 0.308 | 1 | 0.977 | A | 21 | dual_mv_boards single_tx | 10 | 2.476 |
| 2026-012 | 0.2831 | 0.286 | 1 | 0.988 | A | 30 | pump_station_mcc rmu_ring single_tx | 17 | 2.65 |
| 2026-080 | 0.2828 | 0.286 | 1 | 0.987 | A | 27 | lv_subboards pump_station_mcc single_tx | 15 | 2.648 |
| 2026-149 | 0.28147 | 0.286 | 1 | 0.983 | A | 30 | pump_station_mcc rmu_ring single_tx | 19 | 2.7 |
| 2026-163 | 0.2773 | 0.281 | 1 | 0.987 | A | 22 | lv_subboards pump_station_mcc single_tx twin_tx_coupler | 12 | 2.636 |
| 2026-195 | 0.27573 | 0.281 | 1 | 0.982 | A | 29 | lv_subboards pump_station_mcc single_tx twin_tx_coupler | 16 | 2.621 |
| 2026-064 | 0.27542 | 0.281 | 1 | 0.981 | A | 23 | lv_subboards pump_station_mcc single_tx twin_tx_coupler | 13 | 2.717 |
| 2026-105 | 0.27264 | 0.286 | 1 | 0.952 | A | 30 | lv_subboards pump_station_mcc single_tx | 15 | 2.7 |
| 2026-170 | 0.26994 | 0.281 | 1 | 0.961 | A | 25 | lv_subboards pump_station_mcc single_tx twin_tx_coupler | 11 | 2.52 |
| 2026-118 | 0.26714 | 0.272 | 1 | 0.982 | A | 29 | lv_subboards rmu_ring single_tx | 13 | 2.552 |
| 2026-123 | 0.26545 | 0.272 | 1 | 0.975 | A | 19 | genset_changeover single_tx twin_tx_coupler | 11 | 2.737 |
| 2026-010 | 0.26435 | 0.272 | 1 | 0.971 | A | 20 | genset_changeover single_tx twin_tx_coupler | 11 | 2.65 |
| 2026-027 | 0.26388 | 0.27 | 1 | 0.979 | A | 25 | dual_mv_boards pump_station_mcc single_tx | 11 | 2.52 |
| 2026-023 | 0.26284 | 0.27 | 1 | 0.975 | A | 21 | mv_motors pump_station_mcc single_tx | 9 | 2.548 |
| 2026-011 | 0.26091 | 0.27 | 1 | 0.968 | A | 20 | dual_mv_boards pump_station_mcc single_tx | 8 | 2.575 |
| 2026-079 | 0.25991 | 0.281 | 1 | 0.925 | A | 23 | lv_subboards pump_station_mcc single_tx twin_tx_coupler | 10 | 2.478 |
| 2026-048 | 0.2588 | 0.27 | 1 | 0.96 | A | 16 | mv_motors pump_station_mcc single_tx | 5 | 2.375 |
| 2026-139 | 0.25235 | 0.254 | 1 | 0.994 | A | 30 | lv_subboards pump_station_mcc rmu_ring single_tx | 13 | 2.55 |
| 2026-181 | 0.24947 | 0.254 | 1 | 0.983 | A | 30 | lv_subboards pump_station_mcc rmu_ring single_tx | 9 | 2.4 |
| 2026-033 | 0.24936 | 0.254 | 1 | 0.983 | A | 30 | lv_subboards pump_station_mcc rmu_ring single_tx | 14 | 2.55 |
| 2026-198 | 0.24789 | 0.27 | 1 | 0.92 | A | 16 | mv_motors pump_station_mcc single_tx | 8 | 2.563 |
| 2026-107 | 0.24286 | 0.25 | 1 | 0.97 | A | 16 | genset_changeover pump_station_mcc single_tx | 8 | 2.719 |
| 2026-128 | 0.24079 | 0.27 | 1 | 0.893 | A | 21 | dual_mv_boards pump_station_mcc single_tx | 9 | 2.571 |
| 2026-191 | 0.23925 | 0.27 | 1 | 0.888 | A | 20 | dual_mv_boards pump_station_mcc single_tx | 10 | 2.675 |
| 2026-060 | 0.23558 | 0.254 | 1 | 0.928 | A | 30 | lv_subboards pump_station_mcc rmu_ring single_tx | 17 | 2.667 |
| 2026-137 | 0.2353 | 0.247 | 1 | 0.952 | A | 20 | pfc single_tx twin_tx_coupler | 12 | 2.7 |

Rejected (12): 2026-031 — SUPPLY_CAN_FEED (F19) (injected: feeder_off_pump); 2026-041 — SUPPLY_CAN_FEED (P1) (injected: pump_on_incomer); 2026-047 — SUPPLY_CAN_FEED (M9) (injected: pump_on_incomer); 2026-094 — SUPPLY_CAN_FEED (F12) (injected: feeder_off_pump); 2026-096 — SUPPLY_CAN_FEED (P3) (injected: pump_on_incomer); 2026-109 — TX_RATIO_BRIDGES (UPS1); 2026-156 — SUPPLY_CAN_FEED (F7) (injected: feeder_off_pump); 2026-162 — VOLT_MATCHES_SUPPLY (LVB1) (injected: ratio_mismatch); 2026-172 — SUPPLY_CAN_FEED (P5) (injected: pump_on_incomer); 2026-179 — COUPLER_SAME_LEVEL (BC1); 2026-183 — VOLT_MATCHES_SUPPLY (F7); 2026-185 — VOLT_MATCHES_SUPPLY (BB1) (injected: ratio_mismatch)

## The page pass

12 sheets, one per shape (2026-104, 2026-030, 2026-067, 2026-043, 2026-174, 2026-123, 2026-137, 2026-080, 2026-135, 2026-040, 2026-126, 2026-015), rebuilt in the page through `addRowFor` — the same call a chip drop makes — and each proposal compared with the engine's: **0 mismatches in 247 drops**. 99 of 247 rows were spliced at the end of the table; the rest after their supply's last way. Page errors: 0.

In the real pickers, of 128 distinct (type, supply, field, value) triples the sheets asked for: **69 in the top four, 43 further down, 16 not offered** (bus coupler|mv busbar|voltage|11 kV; capacitor bank|lv busbar|rating|1.5 Mvar; capacitor bank|mv busbar|rating|1.5 Mvar; feeder|mv busbar|voltage|11 kV; feeder|mv busbar|voltage|33 kV; lv busbar|transformer|rating|100 A; lv busbar|transformer|rating|1000 A; pump|lv busbar|rating|7.5 kW; pump|mcc|rating|7.5 kW; pump|mv busbar|prot|Fuse-contactor; rmu|mv incomer|prot|LBS, LBS; rmu|rmu|prot|LBS, LBS; …).
