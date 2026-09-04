/* The page under headless Chromium, driven over the DevTools protocol.
 *
 * Shared by the smoke test and the usage baseline: find a Chromium (the
 * Playwright one under /opt/pw-browsers, or $CHROME), open sld_sketchpad.html
 * from a file:// URL with every network request blocked (the page must work
 * offline), and hand back `evaluate` for expressions in the page. Needs no npm
 * packages.
 *
 *   const pg = await openPage();
 *   const n = await pg.evaluate(`document.querySelectorAll('#eqbody tr').length`);
 *   pg.close();
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./cases.mjs";

export function findChrome() {
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

export const sleep = ms => new Promise(ok => setTimeout(ok, ms));

/** Launch Chromium on the built page. `errors` collects page exceptions and console.error calls. */
export async function openPage({ file = path.join(ROOT, "sld_sketchpad.html") } = {}) {
  const chrome = findChrome();
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
  const ws = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
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
  /* the page must work offline: nothing may be fetched */
  await send("Network.enable");
  await send("Network.setBlockedURLs", { urls: ["http://*", "https://*"] });
  const loaded = new Promise(ok => ws.addEventListener("message", ev => { if (JSON.parse(ev.data).method === "Page.loadEventFired") ok(); }));
  await send("Page.navigate", { url: "file://" + file });
  await Promise.race([loaded, sleep(10000)]);
  await sleep(500);

  return { evaluate, send, sleep, errors, close() { try { ws.close(); } catch {} proc.kill(); } };
}
