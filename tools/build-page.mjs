#!/usr/bin/env node
/* Produce the distributable single-file page: dist/sld_sketchpad.html
 *
 * Today the page is already one file, so this only checks that its presets
 * block matches testdata/ and copies it. When the engine moves into ES
 * modules (plan phase 2) this script becomes the concatenation step that
 * keeps the offline file:// page working. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./lib/cases.mjs";

execFileSync(process.execPath, [path.join(ROOT, "tools", "gen-fixtures.mjs"), "--check"], { stdio: "inherit" });

const out = path.join(ROOT, "dist", "sld_sketchpad.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.copyFileSync(path.join(ROOT, "sld_sketchpad.html"), out);
console.log(`wrote ${path.relative(ROOT, out)}`);
