#!/usr/bin/env node
/* Convert survey workbooks into testdata cases.
 *
 *   node tools/import-xlsx.mjs <group> <file.xlsx>…   # e.g. sites survey.xlsx
 *   node tools/import-xlsx.mjs --historical           # re-import the original 48 from examples/ and tests/
 *
 * Each case becomes testdata/<group>/<name>/rows.csv + case.json. Existing
 * case.json files keep their "description" and "expect" blocks; only info
 * and rows are refreshed. Then run tools/golden.mjs (UPDATE_GOLDEN=1) and
 * tools/gen-fixtures.mjs. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readWorkbook } from "../src/io/xlsx.js";
import { rowsToCsv } from "../src/io/csv.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TESTDATA = path.join(ROOT, "testdata");

/* one line per case, from README.md, tests/*.md and the audit README */
const DESCRIPTIONS = {
  config1_single_tx: "MV incomer → RMU → 1000 kVA transformer → LV busbar, 4 feeders",
  config2_twin_tx: "MV incomer → RMU → 2× 1600 kVA transformers → two LV busbars + bus coupler, 6 feeders",
  config3_ring_main: "Ring main: 2 MV incomers → RMU → 800 kVA transformer → LV busbar, 3 feeders",
  config4_dual_mv_boards: "2 utility incomers → 2 MV switchboards (N.O. bus tie) → 3 transformers + 3 MV pumps per board; each transformer → LV board with 2–3 MCCs",
  config5_cascaded_rmus: "Utility incomer → RMU1 feeding RMU2 and RMU3 by interconnecting cables; each feeds a 1000 kVA transformer and two LV panels",
  config6_closed_ring: "Config 5 with the RMU2–RMU3 cable in place, closing the ring RMU1–RMU2–RMU3–RMU1",
  config7_mcc_motors: "Pump station: utility incomer → RMU → 1000 kVA transformer → LV board with three MCCs; motors on VSDs, an auxiliaries feeder",
  template: "Blank survey template with one example row",
  c1_wtw: "Water treatment works: 33/11/3.3/0.4 kV, dual utility, A/B boards with ties at two levels, 3-RMU ring with N.O. point, 3.3 kV pump board, genset on an ATS, 3 MCCs",
  c2_building: "Building: LV cascade 3 deep, UPS modelled as a 400/400 V transformer, PFC, 690 V drive board, genset through a changeover, 2 couplers",
  c3_pumps: "Pumping station: 2 MV incomers, 2 MV boards + ties, 6 MV motors, 11/0.69 kV drive transformers, 400/230 V transformer, cap bank, NER, battery charger feeder",
  c4_ring: "5-RMU closed ring off a primary board, N.O. at RMU3, 2-RMU closed sub-ring off RMU4, 7 transformers / 7 LV boards, LV cross-tie",
  c5_hybrid: "Hybrid plant: PV blocks + BESS + 2 gensets, 3 step-ups, 33/11 kV grid transformer; generation board fed from 6 supplies",
  l1_chain: "33 kV → 33/11 → 11 kV → 11/0.4 → LV chain",
  l2_sections: "L1 with A/B sections and a tie at each of 3 levels",
  l3_two_down: "11 kV → 11/3.3 → 3.3 kV pump board, and 11/0.4 → LV: two step-downs side by side",
  l4_mid_two_supplies: "11 kV board fed from 33 kV above and a genset step-up below",
  l5_two_up: "PV → two 400 V boards → two 0.4/11 step-ups → 11 kV → 11/33 → 33 kV export board",
  l6_loop: "11 kV A → 11/0.4 → LV → 0.4/11 → 11 kV B, A–B tie: a cycle through transformers",
  l7_three_tier: "33 → 11 → 3.3 kV with LV boards under the 11 kV and 3.3 kV boards (4 levels)",
  l8_mixed_cascade: "11 kV main → same-voltage 11 kV sub-board and → 11/3.3 board",
  l9_rmu_down: "RMU ring → RMU1 → 11/3.3 → 3.3 kV pump board",
  l10_both_under_board: "One 11 kV board with a step-down, a reversed step-up and a step-up column",
  f1_mv_sources: "Gensets beside a utility incomer, on an RMU, and through two MV changeovers",
  f2_spur: "Ring with a spur RMU, links written on both rows, spare feeder",
  f3_terminals: "Every terminal type (cap bank, NER, arrester) on MV gear / RMU / LV board, MV outgoing ways, alias type names",
  f4_subboards: "3 levels of sub-boards, two DBs on one feeder, tie between sub-boards, genset on a DB via ATS, VSD motor",
  f5_rmu_spur: "RMU-only chain with a spur, no MV board on the sheet",
  f6_mcc: "Motors and a feeder under an MCC (MCC gets its own bus and dashed enclosure)",
  f7_board_tx: "Transformers off an LV board: motor supply, no-load one, LV/LV with a sub-board",
  f8_tx_loads: "Motors/MCCs named on a transformer secondary, with and without a board",
  f9_ties: "Couplers between boards on different levels and past an intervening board, 3 voltage tiers, parallel transformers",
  f10_dual_feeds: "LV board fed from two transformers on different MV boards; sub-board fed from two feeders",
  f11_rmu_cascade: "One RMU feeding two RMUs, 5 RMUs each with a substation (sheet-width case)",
  f12_rmu_mv_loads: "Motor + capacitor + arrester as ways of ring RMUs on a site with no MV busbar",
  f13_utility_direct: "Utility → 2 transformers directly (no MV board/RMU), LV board from both",
  f14_earthing_ner: "Earthing transformer with an Earthing/NER row on its secondary; long Site name",
  f15_long_labels: "RMU with 4 substations and long descriptions at the right sheet edge",
  w01_waterworks: "Two MV boards with an N.O. tie, six transformers, LV tie, MCCs with VSD and spare motors, sub-boards, capacitor bank and NER on MV gear",
  w02_ring: "Four RMUs closed in a ring, a spur RMU, a sub-ring, a genset through a changeover",
  w03_pumpstation: "Dedicated transformer whose MCC is the board, two MCCs on an MSB, a 400/300 V motor transformer, an LV/LV transformer to a 230 V board",
  w04_generation: "Generation board feeding a step-up beside a utility incomer, and a reversed step-up to a generator",
  w05_deepcascade: "Four board levels with 40-character descriptions",
  w06_wideboard: "One bar with 24 ways of every load type",
  w07_multisupply: "Board fed from two transformers on different MV boards, a sub-board fed from two feeders",
  w08_wrongloads: "ADVERSARIAL: a pump on an MV incomer, a feeder on a motor, an MCC on a feeder and on an RMU, motor/MCC named on a transformer. Five edges must stay disconnected and every bad row must draw a message",
  w10_everything: "95 rows: w01 + w03 + w05 merged with prefixed IDs",
  w11_couplers_levels: "Couplers between levels and past an intervening board, 33/11/0.4 kV, live step-up",
};

/* examples/config<n> are the sketchpad's built-in presets, keyed "1".."7" */
const PRESET_KEY = name => (name.match(/^config(\d)_/) || [])[1] || null;

function importOne(group, file) {
  const name = path.basename(file, ".xlsx");
  const dir = path.join(TESTDATA, group, name);
  fs.mkdirSync(dir, { recursive: true });
  const { info, rows } = readWorkbook(file);
  fs.writeFileSync(path.join(dir, "rows.csv"), rowsToCsv(rows));

  const caseFile = path.join(dir, "case.json");
  const prev = fs.existsSync(caseFile) ? JSON.parse(fs.readFileSync(caseFile, "utf8")) : {};
  const preset = PRESET_KEY(name);
  const c = {
    name, group,
    description: prev.description ?? DESCRIPTIONS[name] ?? "",
    source: path.relative(ROOT, file).split(path.sep).join("/"),
    info,
    ...(preset ? { preset } : {}),
    expect: prev.expect ?? { golden: true },
  };
  fs.writeFileSync(caseFile, JSON.stringify(c, null, 2) + "\n");
  return { name, group, rows: rows.length };
}

function main(argv) {
  const jobs = [];
  if (!argv.length || argv[0] === "-h" || argv[0] === "--help") {
    console.log("usage: node tools/import-xlsx.mjs <group> <file.xlsx>…   |   --historical");
    process.exit(argv.length ? 0 : 2);
  }
  if (argv[0] !== "--historical") {
    const [group, ...files] = argv;
    if (!files.length) { console.error("no workbook given"); process.exit(2); }
    for (const f of files) jobs.push([group, f]);
  } else {
    const pick = (group, dir) => {
      const d = path.join(ROOT, dir);
      if (!fs.existsSync(d)) return;
      for (const f of fs.readdirSync(d).filter(f => f.endsWith(".xlsx")).sort())
        jobs.push([group, path.join(d, f)]);
    };
    pick("examples", "examples");
    pick("sites", "tests/sites");
    pick("levels", "tests/levels");
    pick("features", "tests/features");
    pick("audit", "tests/audit");
  }
  let n = 0;
  for (const [group, file] of jobs) {
    const r = importOne(group, file);
    console.log(`${r.group}/${r.name}: ${r.rows} rows`);
    n++;
  }
  console.log(`${n} case(s) written under ${path.relative(ROOT, TESTDATA)}/`);
}

main(process.argv.slice(2));
