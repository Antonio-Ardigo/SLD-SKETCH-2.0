# SLD-Sketch constitution

The rules every part of SLD-Sketch — the table, the engine, the drawing, the
tests — must obey. They are short on purpose. A change that breaks one of them
is a change to this document first.

## 1. `Feeds From` is the only topology

Connectivity comes from exactly two columns: **ID** names an item, **Feeds
From** names the item(s) that supply it. Nothing else creates, removes or
redirects a connection: not the Type, not the Voltage, not the row order, not
a keyword, not a drawing option.

The direction of every edge is *supply → load*, and `Feeds From` always
points upstream. A row with several supplies lists them comma-separated, in
the order the drawing should land them.

## 2. Everything else chooses a symbol, a label or a style

- **Type** chooses the symbol family (busbar, transformer, motor, …).
- **Protection** chooses the device drawn on the item's supply side, one
  entry per supply, in `Feeds From` order.
- **Description / Rating / Voltage / Notes** are printed. A handful of
  keywords (VSD, spare, N.O., capacitor, NER, arrester, …) swap or decorate
  the symbol. They never change what is connected to what.
- **Row order** decides left-to-right placement among siblings, never
  connectivity.

## 3. The graph is a pure function of `(ID, Feeds From)`

The engine builds its graph from those two columns alone. Given the same IDs
and the same `Feeds From` strings, the graph — nodes, directed edges and
edge order — is identical whatever the other columns say and whatever view is
selected. This is enforced by a test that scrambles every other column and
asserts the graph is unchanged.

## 4. A view changes the drawing, never the data or the graph

The same table may be drawn in several ways: a step-up shown with the MV
board on top or with power flowing downwards, a ring drawn open or closed
over the top, couplers routed one way or another, labels dense or sparse.
Those are **view options**. They are applied after the graph and its derived
facts exist, they may re-style and re-place, and they are stored beside the
table, not in it. Exporting the table (xlsx, csv) never includes a view.

## 5. Every inference is a named fact

Whatever the engine works out on its own — which level a board sits on,
which RMUs form a ring, which branch is a spur, which way a transformer
steps, where a second supply lands, which lane a run takes — is recorded as
a named fact with the rule that produced it. Facts are visible in the
diagnostics panel, asserted by fixtures, and overridable only through a view
option. No inference lives only inside drawing code.

## 6. A row is never dropped silently

A row the engine cannot place correctly is still drawn — floating, with an
open terminal, or with a message beside it — and a diagnostic names the row
and says why. The survey record is complete or it says that it is not.

## 7. One engine, one set of fixtures

There is one drawing engine, and every front-end (page, command line,
exporter) calls it. Every behaviour the README promises has a fixture in
`testdata/` that fails when the behaviour changes. A new topological case is
one rule, one placement handler if needed, one symbol variant if needed, and
one fixture — never a special case scattered through the renderer.
