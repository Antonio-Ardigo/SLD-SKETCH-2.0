/* The page's quick-value lists, read from the page's own source.
 *
 * `QUICK`, `quickVolt` and `quickRating` live in src/ui/app.js beside the DOM
 * code, so they cannot be imported into Node. They are pure — an object
 * literal and two lookups on the row's canonical type — so this slices their
 * source text out of app.js and evaluates it against the real types module.
 * It is therefore never out of step with what the page offers, and needs no
 * browser to read.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as T from "../../src/core/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(here, "..", "..", "src", "ui", "app.js");

let cached = null;
/** { QUICK, quickVolt(type), quickRating(type), canonType, variantOf } */
export function loadQuick() {
  if (cached) return cached;
  const src = fs.readFileSync(APP, "utf8");
  const grab = (re, what) => { const m = re.exec(src); if (!m) throw new Error(`quick.mjs: ${what} not found in src/ui/app.js`); return m[0]; };
  const parts = [
    grab(/^const MV_TYPES=.*$/m, "MV_TYPES/LV_TYPES"),
    grab(/^const QUICK=\{[\s\S]*?^\};/m, "QUICK"),
    grab(/^function canonType\(type\)\{.*$/m, "canonType"),
    grab(/^function variantOf\(type\)\{.*$/m, "variantOf"),
    grab(/^function quickVolt\(type\)\{[\s\S]*?^\}/m, "quickVolt"),
    grab(/^function quickRating\(type\)\{[\s\S]*?^\}/m, "quickRating"),
  ];
  const ctx = vm.createContext({ ...T });
  cached = vm.runInContext(`${parts.join("\n")}\n;({ QUICK, quickVolt, quickRating, canonType, variantOf })`, ctx, { filename: "src/ui/app.js#quick" });
  return cached;
}
