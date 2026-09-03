#!/usr/bin/env node
/* Open sld_sketchpad.html in headless Chromium and exercise the table UI
 * through the DevTools protocol: presets, typing, import, undo, quick values.
 *
 *   node tools/smoke-page.mjs            # uses $CHROME, else the Playwright chromium under /opt/pw-browsers
 *
 * Exit 1 on any failed check or page error. Needs no npm packages. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/cases.mjs";

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cands = [];
  for (const base of ["/opt/pw-browsers", path.join(process.env.HOME || "", ".cache/ms-playwright")]) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base)) {
      for (const rel of ["chrome-linux/chrome", "chrome-linux64/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"])
        cands.push(path.join(base, d, rel));
    }
  }
  cands.push("google-chrome", "chromium", "chromium-browser");
  return cands.find(c => c.includes("/") ? fs.existsSync(c) : true);
}

const chrome = findChrome();
const page = "file://" + path.join(ROOT, "sld_sketchpad.html");
const proc = spawn(chrome, ["--headless=new", "--no-sandbox", "--disable-gpu", "--remote-debugging-port=0",
  "--user-data-dir=" + fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "sld-chrome-")), "about:blank"],
  { stdio: ["ignore", "ignore", "pipe"] });

const wsUrl = await new Promise((ok, fail) => {
  let buf = "";
  proc.stderr.on("data", d => { buf += d; const m = /DevTools listening on (ws:\S+)/.exec(buf); if (m) ok(m[1]); });
  proc.on("exit", c => fail(new Error("chrome exited " + c + "\n" + buf)));
  setTimeout(() => fail(new Error("chrome did not start\n" + buf)), 15000);
});

const targets = await (await fetch(wsUrl.replace(/^ws/, "http").replace(/\/devtools\/browser\/.*$/, "/json"))).json();
const pageWs = targets.find(t => t.type === "page").webSocketDebuggerUrl;
const ws = new WebSocket(pageWs);
await new Promise(ok => ws.addEventListener("open", ok));
let seq = 0; const pending = new Map(); const errors = [];
ws.addEventListener("message", ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
});
const send = (method, params = {}) => new Promise(ok => { const id = ++seq; pending.set(id, ok); ws.send(JSON.stringify({ id, method, params })); });
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "evaluate failed");
  return r.result.result.value;
};

await send("Runtime.enable");
await send("Page.enable");
/* the page links Google Fonts; offline that request would hold the script back until it times out */
await send("Network.enable");
await send("Network.setBlockedURLs", { urls: ["*fonts.googleapis.com*", "*fonts.gstatic.com*"] });
const loaded = new Promise(ok => ws.addEventListener("message", ev => { if (JSON.parse(ev.data).method === "Page.loadEventFired") ok(); }));
await send("Page.navigate", { url: page });
await Promise.race([loaded, new Promise(ok => setTimeout(ok, 10000))]);
await new Promise(ok => setTimeout(ok, 500));
if (process.env.DEBUG) console.log(await evaluate(`location.href + ' ' + document.readyState + ' rows=' + document.querySelectorAll('#eqbody tr').length`), errors);

let failed = 0;
const check = (name, cond, detail = "") => { console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? "  " + detail : ""}`); if (!cond) failed++; };
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
const csv = fs.readFileSync(path.join(ROOT, "testdata", "sites", "c1_wtw", "rows.csv"), "utf8");

try {
  check("page loaded with preset 1", await evaluate(`document.querySelectorAll('#eqbody tr').length`) === 8);
  check("drawing rendered", await evaluate(`!!document.querySelector('#sheet svg')`));
  check("Feeds from has the ID picker", await evaluate(`document.querySelector('[data-f="from"]').getAttribute('list')`) === "idlist");
  check("ID list holds the sheet's IDs", await evaluate(`document.querySelectorAll('#idlist option').length`) >= 7);

  /* quick values follow the row's type */
  await evaluate(`document.querySelector('tr[data-i="2"] [data-f="voltage"]').dispatchEvent(new FocusEvent('focusin',{bubbles:true})); document.querySelectorAll('#voltlist option').length`);
  check("transformer voltage list", await evaluate(`[...document.querySelectorAll('#voltlist option')].map(o=>o.value).includes('11/0.4 kV')`));
  await evaluate(`document.querySelector('tr[data-i="4"] [data-f="rating"]').dispatchEvent(new FocusEvent('focusin',{bubbles:true}))`);
  check("feeder rating list", await evaluate(`[...document.querySelectorAll('#ratinglist option')].map(o=>o.value).includes('250 A')`));

  /* Enter on the last row adds one; Type change offers a default protection */
  await evaluate(`(function(){ const el=document.querySelector('tr[data-i="7"] [data-f="desc"]'); el.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
     el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
  check("Enter on last row adds a row", await evaluate(`document.querySelectorAll('#eqbody tr').length`) === 9);
  await evaluate(`(function(){ const s=document.querySelector('tr[data-i="8"] [data-f="type"]'); s.value='Feeder';
     s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  check("type change fills default protection", await evaluate(`document.querySelector('tr[data-i="8"] [data-f="prot"]').value`) === "CB");

  /* a bad Feeds from highlights the row and lists a clickable problem */
  await evaluate(`(function(){ const el=document.querySelector('tr[data-i="8"] [data-f="id"]'); el.value='F9'; el.dispatchEvent(new Event('input',{bubbles:true}));
     const f=document.querySelector('tr[data-i="8"] [data-f="from"]'); f.value='NOPE'; f.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(400);
  check("unknown supply marks the row", await evaluate(`document.querySelector('tr[data-i="8"]').classList.contains('err')`));
  check("problem line points at the row", await evaluate(`document.querySelector('#problems div[data-row="8"]') !== null`));

  /* undo removes the typing and the row */
  const before = await evaluate(`document.querySelectorAll('#eqbody tr').length`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))`);
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))`);
  const after = await evaluate(`document.querySelectorAll('#eqbody tr').length`);
  check("undo walks back", after < before, `${before} → ${after}`);
  check("redo enabled", await evaluate(`!document.querySelector('#redo').disabled`));

  /* CSV import through the same path the file picker uses */
  await evaluate(`importFile(new File([${JSON.stringify(csv)}], 'c1_wtw.csv', {type:'text/csv'}))`);
  await sleep(500);
  check("CSV import loads 33 rows", await evaluate(`document.querySelectorAll('#eqbody tr').length`) === 33);
  check("CSV import draws", await evaluate(`document.querySelector('#sheet svg').getAttribute('width') > 1000`));

  /* xlsx import via the vendored SheetJS */
  const xlsx = fs.readFileSync(path.join(ROOT, "build", "xlsx", "examples", "config7_mcc_motors.xlsx"));
  await evaluate(`importFile(new File([Uint8Array.from(atob(${JSON.stringify(xlsx.toString("base64"))}), c=>c.charCodeAt(0))], 'config7.xlsx'))`);
  await sleep(1500);
  check("xlsx import loads 16 rows", await evaluate(`document.querySelectorAll('#eqbody tr').length`) === 16, await evaluate(`document.querySelector('#copystate').textContent`));
  check("xlsx import reads Info", await evaluate(`document.querySelector('#i-site').value`) === "Example Site G");

  /* saved state is versioned */
  check("saved state has a version", await evaluate(`JSON.parse(localStorage.getItem('sld-sketchpad')).v`) === 2);

  check("no page errors", errors.length === 0, errors.join(" || "));
} catch (e) {
  console.error("smoke test crashed:", e.message); failed++;
} finally {
  ws.close(); proc.kill();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
