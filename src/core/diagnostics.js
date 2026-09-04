/* The catalogue of everything the reader and the drawing can say about a
 * table. A diagnostic is
 *
 *   { code, level: "error" | "warning", ids: [rowId…], row?: n, message }
 *
 * `message` is the sentence shown to the surveyor (the page, the CLI). Tests
 * assert on `code` and `ids`, never on the wording, so the wording can improve
 * freely. An "error" is a fault in the table itself (two rows with one ID, a
 * supply that is not on the sheet); a "warning" is a network the reader could
 * read but doubts. Both still draw (constitution §6): the row in question
 * floats, stands open or is marked, and the message says why. A diagnostic
 * may carry a `fix` — `{ id, field, from, to }` — a one-click correction the
 * page can offer; it is never applied on its own. */

export const DIAG = {
  /* reader: the table itself */
  DUP_ID:            { level: "error",   about: "two rows share an ID" },
  UNKNOWN_SUPPLY:    { level: "error",   about: "Feeds From names an ID that is not on the sheet; drawn without that supply" },
  ROW_NO_ID:         { level: "warning", about: "a row has data but no ID; it is ignored" },
  SUPPLY_CASE:       { level: "warning", about: "Feeds From names an ID in another case or spacing; read as the row it matches" },
  ID_CASE_CLASH:     { level: "warning", about: "two rows whose IDs differ only in case or spacing; references go to the first" },
  UNKNOWN_TYPE:      { level: "warning", about: "Type is not one of the known types; drawn as a feeder" },
  UNKNOWN_PROT:      { level: "warning", about: "Protection is not a known device; the default symbol is drawn" },
  PROT_ON_INCOMER:   { level: "warning", about: "protection on an MV incomer is the utility's and is not drawn" },
  /* reader: the network */
  LOOP_NO_SUPPLY:    { level: "warning", about: "rows feed from each other round a loop no supply reaches; drawn floating" },
  NO_SUPPLY:         { level: "warning", about: "a row that needs a supply has an empty Feeds From" },
  TX_NO_SUPPLY:      { level: "warning", about: "a transformer with no Feeds From; drawn with an open supply terminal" },
  TX_NO_LOAD:        { level: "warning", about: "a transformer nothing feeds from; drawn with an open outgoing terminal" },
  TX_BOTH_LEVELS:    { level: "warning", about: "a transformer feeding both MV and LV gear; drawn as a step-up" },
  IMPOSSIBLE_SUPPLY: { level: "warning", about: "the named supply cannot feed this kind of row; drawn floating" },
  LOAD_ON_BOARD_TX:  { level: "warning", about: "a motor or MCC named on a transformer that feeds a board; drawn as a way of that board" },
  MCC_ON_MV:         { level: "warning", about: "an MCC fed from MV gear" },
  MCC_BAD_SUPPLY:    { level: "warning", about: "an MCC fed from something other than an LV board, an MCC or a transformer" },
  GEN_NO_LOAD:       { level: "warning", about: "a generator that feeds nothing" },
  /* the network: couplers */
  COUPLER_INVALID:   { level: "warning", about: "a bus coupler not between two busbars of the same kind; drawn from the end it has, the other open" },
  COUPLER_EXTRA_SUPPLY: { level: "warning", about: "a bus coupler naming more than the two busbars it ties; the rest are not drawn" },
  COUPLER_DUP:       { level: "warning", about: "a second coupler between the same two busbars" },
  /* engine */
  EMPTY_SHEET:       { level: "warning", about: "the table has no rows with an ID" },
  RANK_CYCLE:        { level: "warning", about: "two rows each demand to sit below the other; the rank solver dropped one demand" },
};

export function makeDiag(code, ids, message, row, extra) {
  const def = DIAG[code];
  if (!def) throw new Error(`unknown diagnostic code ${code}`);
  const d = { code, level: def.level, ids: ids.filter(Boolean), message };
  if (row !== undefined) d.row = row;
  if (extra) Object.assign(d, extra);
  return d;
}

/* The drawing used to report its coupler problems as English sentences, and
   this module recovered the code by matching the wording with a regular
   expression — so the judgement lived in the renderer and the code depended
   on its prose. `couplerDiagnostics` in src/core/couplers.js makes them
   directly now (constitution §5), and the drawing says nothing at all. */

/** "CODE:firstId" — the compact form fixtures assert on. */
export function diagKey(d) { return d.ids.length ? `${d.code}:${d.ids[0]}` : d.code; }
