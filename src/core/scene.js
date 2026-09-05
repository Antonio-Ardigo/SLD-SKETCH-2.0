/* The scene: what the drawing is made of, as data.
 *
 * SceneCanvas draws exactly what SVG draws (every primitive calls through)
 * and records each one with the row that owns it, the layer it was drawn on,
 * and whether it is part of a device glyph. Protection devices are recorded
 * as zones (centre, half-extent, orientation) so the checker knows where a
 * conductor is interrupted by a symbol rather than broken.
 *
 *   ops:     [{ t: "line"|"rect"|"circle"|"dot"|"poly"|"text"|"path", …geometry,
 *               owner: rowId|null, kind: type|null, layer, mark: bool }]
 *   devices: [{ x, y, g, orient: "v"|"h", kind, owner }]
 *   groups:  [{ id, kind }]  every begin() seen, in order
 */
import { SVG } from "./svg.js";

export class SceneCanvas extends SVG {
  constructor() {
    super();
    this.stack = []; this.depth = 0;
    this.ops = []; this.devices = []; this.groups = [];
  }
  _owner() { return this.stack.length ? this.stack[this.stack.length - 1] : { id: null, kind: null }; }
  _rec(op) {
    const o = this._owner();
    op.owner = o.id; op.kind = o.kind; op.layer = this.layer; op.mark = this.depth > 0;
    this.ops.push(op);
  }
  begin(id, kind) { super.begin(id, kind); this.stack.push({ id, kind }); this.groups.push({ id, kind }); }
  end() { super.end(); this.stack.pop(); }

  line(x1, y1, x2, y2, w = 2, dash = null) { super.line(x1, y1, x2, y2, w, dash); this._rec({ t: "line", x1, y1, x2, y2, w, dash }); }
  rect(x, y, w, h, sw = 2, dash = null, fill = "none") { super.rect(x, y, w, h, sw, dash, fill); this._rec({ t: "rect", x, y, w, h, sw, dash, fill }); }
  circle(x, y, r, sw = 2) { super.circle(x, y, r, sw); this._rec({ t: "circle", x, y, r, sw }); }
  dot(x, y, r = 3.2) { super.dot(x, y, r); this._rec({ t: "dot", x, y, r }); }
  poly(pts, fill = "#111") { super.poly(pts, fill); this._rec({ t: "poly", pts: pts.map(p => [p[0], p[1]]), fill }); }
  text(x, y, s, opts = {}) { super.text(x, y, s, opts); if (s) this._rec({ t: "text", x, y, s: String(s), size: opts.size ?? 12, anchor: opts.anchor ?? "middle", rotate: opts.rotate ?? null }); }
  path(d, sw = 2) { super.path(d, sw); this._rec({ t: "path", d, sw }); }

  /* devices: the glyph's primitives are marks, the zone is recorded once */
  /* the layer is recorded like it is on an op: check.js skips the legend's
     devices by it, and a legend glyph is not a device on anyone's run */
  _zone(x, y, g, orient, kind) { this.devices.push({ x, y, g, orient, kind, owner: this._owner().id, layer: this.layer }); }
  device(kind, x, y) { this.depth++; const g = super.device(kind, x, y); this.depth--; this._zone(x, y, g, "v", kind || "cb"); return g; }
  deviceH(kind, x, y) { this.depth++; const g = super.deviceH(kind, x, y); this.depth--; this._zone(x, y, g, "h", kind || "cb"); return g; }
  lbs(x, yt, yb) { const top = this.depth === 0; this.depth++; super.lbs(x, yt, yb); this.depth--; if (top) this._zone(x, (yt + yb) / 2, (yb - yt) / 2, "v", "lbs"); }
  fuseSwitch(x, yt, yb) { const top = this.depth === 0; this.depth++; super.fuseSwitch(x, yt, yb); this.depth--; if (top) this._zone(x, (yt + yb) / 2, (yb - yt) / 2, "v", "fuse-switch"); }
  vsd(x, y) { this.depth++; super.vsd(x, y); this.depth--; this._zone(x, y, 7, "v", "vsd"); }

  scene() { return { ops: this.ops, devices: this.devices, groups: this.groups }; }
}
