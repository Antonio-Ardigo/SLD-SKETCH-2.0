#!/usr/bin/env node
/* A short film of a survey being drawn: the palette, the table and the sheet,
 * with a spoken commentary.
 *
 *   node tools/demo-video.mjs [-o output/sld-demo.mp4]
 *
 * The page runs in the same headless Chromium the smoke test uses, and every
 * drop is a real `drop` event carrying a real DataTransfer — the same path a
 * hand takes, so the film cannot show behaviour the page does not have. A
 * pointer, a dragged ghost and a caption bar are drawn over the page so the
 * gesture is visible; nothing else about the page is touched.
 *
 * Each step is narrated first (espeak-ng), then played for exactly as long as
 * its narration lasts, so picture and voice stay together without a timeline.
 *
 * Needs ffmpeg and espeak-ng on PATH; they are the only things here that are
 * not already required to run the tests.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { openPage, sleep } from "./lib/headless.mjs";
import { ROOT } from "./lib/cases.mjs";

/* Tall on purpose: the page is one column — table, palette, then sheet — and
   the point of the film is to show a row and the symbol it makes at the same
   time. 1280x1160 is the smallest frame that holds all three legibly. */
const W = 1280, H = 1240, FPS = 10, SHEET_AT = 560;
const outArg = process.argv.indexOf("-o");
const OUT = path.resolve(outArg > 0 ? process.argv[outArg + 1] : path.join(ROOT, "output", "sld-demo.mp4"));
const TMP = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "sld-demo-"));
const FRAMES = path.join(TMP, "frames");
fs.mkdirSync(FRAMES, { recursive: true });

const need = t => { try { execFileSync("sh", ["-c", `command -v ${t}`], { stdio: "ignore" }); } catch { console.error(`demo-video needs ${t} on PATH`); process.exit(1); } };
need("ffmpeg"); need("ffprobe"); need("espeak-ng");

/* ---------------------------------------------------------------- narration */
const say = (text, file) => {
  execFileSync("espeak-ng", ["-v", "en-gb", "-s", "142", "-p", "42", "-g", "6", "-w", file, text]);
  return +execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).trim();
};

/* ---------------------------------------------------------------- the overlay
   A pointer, the chip being carried, a caption bar and a title card, drawn on
   top of the page. Nothing here can be reached by the page's own code. */
const OVERLAY = `(function(){
  const css=document.createElement("style");
  css.textContent=\`
    #dmo-cur{position:fixed;left:0;top:0;width:26px;height:34px;z-index:99999;pointer-events:none;
      filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));transition:none}
    #dmo-ghost{position:fixed;z-index:99998;pointer-events:none;background:#1c1c1c;color:#fff;
      font:600 13px/1.5 system-ui,sans-serif;padding:5px 10px;border-radius:6px;opacity:0;
      box-shadow:0 6px 18px rgba(0,0,0,.35);white-space:nowrap;transform:translate(14px,16px)}
    #dmo-cap{position:fixed;left:0;right:0;bottom:0;z-index:99997;pointer-events:none;
      background:linear-gradient(transparent,rgba(0,0,0,.82) 38%);color:#fff;
      font:500 21px/1.45 system-ui,sans-serif;padding:44px 60px 24px;text-align:center;
      text-shadow:0 2px 6px rgba(0,0,0,.9);min-height:34px}
    #dmo-title{position:fixed;inset:0;z-index:99996;pointer-events:none;background:#101215;color:#fff;
      display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
      font:600 46px/1.2 system-ui,sans-serif;opacity:0;transition:opacity .25s}
    #dmo-title small{font:400 21px/1.4 system-ui,sans-serif;opacity:.72}
    #dmo-ring{position:fixed;z-index:99995;pointer-events:none;border:3px solid #2f7ad4;border-radius:50%;
      width:0;height:0;opacity:0}\`;
  document.head.appendChild(css);
  const mk=(id,html)=>{ const d=document.createElement("div"); d.id=id; if(html) d.innerHTML=html; document.body.appendChild(d); return d; };
  const cur=mk("dmo-cur",'<svg viewBox="0 0 26 34"><path d="M2 1 L2 26 L8.5 20 L12.5 30 L17 28 L13 18.5 L21 18 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>');
  const ghost=mk("dmo-ghost"), cap=mk("dmo-cap"), title=mk("dmo-title"), ring=mk("dmo-ring");
  window.__dmo={
    at(x,y){ cur.style.transform=\`translate(\${x}px,\${y}px)\`; ghost.style.left=x+"px"; ghost.style.top=y+"px"; },
    carry(t){ ghost.textContent=t||""; ghost.style.opacity=t?"1":"0"; },
    cap(t){ cap.textContent=t||""; },
    title(a,b){ title.innerHTML=a?\`<div>\${a}</div><small>\${b||""}</small>\`:""; title.style.opacity=a?"1":"0"; },
    /* a soft ring where a click lands, so a click is visible at all */
    tap(x,y,k){ const s=10+k*46; ring.style.width=ring.style.height=s+"px"; ring.style.left=(x-s/2)+"px";
      ring.style.top=(y-s/2)+"px"; ring.style.opacity=String(Math.max(0,0.8-k)); },
    /* the centre of a palette chip, a symbol on the sheet, or a table cell */
    chip(label){ const b=[...document.querySelectorAll("#palette .chip")].find(c=>c.dataset.type===label);
      return b?box(b):null; },
    sym(id){ const g=document.querySelector('#sheet svg g[data-id="'+id+'"] rect.hit'); return g?box(g):null; },
    sheetPoint(fx,fy){ const r=document.querySelector("#viewport").getBoundingClientRect();
      return {x:r.left+r.width*fx, y:r.top+r.height*fy}; },
  };
  function box(el){ const r=el.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; }
})()`;

/* a real HTML5 drag of a palette chip: the page's own dragover/drop handlers */
const DRAG_EVENT = (kind, label, x, y) => `(function(){
  const vp=document.querySelector("#viewport");
  const dt=new DataTransfer(); dt.setData("text/sld-type", ${JSON.stringify(label)}); dt.setData("text/plain", ${JSON.stringify(label)});
  vp.dispatchEvent(new DragEvent(${JSON.stringify(kind)},{dataTransfer:dt,clientX:${x},clientY:${y},bubbles:true,cancelable:true}));
})()`;

/* ---------------------------------------------------------------- recording */
const pg = await openPage();
const { evaluate, send } = pg;
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await sleep(300);
await evaluate(OVERLAY);

let shot = 0;
const rec = async (n = 1) => {
  for (let i = 0; i < n; i++) {
    const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 88 });
    fs.writeFileSync(path.join(FRAMES, String(shot++).padStart(6, "0") + ".jpg"), Buffer.from(r.result.data, "base64"));
  }
};

const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/* Keep the sheet at a fixed height in frame. The table grows downwards as rows
   are added, which would otherwise walk the drawing off the bottom. */
const anchor = () => evaluate(
  `window.scrollTo(0, Math.max(0, document.querySelector("#viewport").getBoundingClientRect().top + scrollY - ${SHEET_AT}))`);

/** Carry a chip from the palette to a point, with the page seeing every move. */
async function dragChip(label, to, steps = 13) {
  const from = await evaluate(`JSON.stringify(__dmo.chip(${JSON.stringify(label)}))`).then(JSON.parse);
  const dst = typeof to === "string"
    ? await evaluate(`JSON.stringify(__dmo.sym(${JSON.stringify(to)}))`).then(JSON.parse)
    : await evaluate(`JSON.stringify(__dmo.sheetPoint(${to[0]},${to[1]}))`).then(JSON.parse);
  await evaluate(`__dmo.at(${from.x},${from.y}); __dmo.carry(${JSON.stringify(label)})`);
  await rec(2);
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps), x = Math.round(from.x + (dst.x - from.x) * t), y = Math.round(from.y + (dst.y - from.y) * t);
    await evaluate(`__dmo.at(${x},${y})`);
    await evaluate(DRAG_EVENT("dragover", label, x, y));
    await rec();
  }
  await evaluate(DRAG_EVENT("drop", label, Math.round(dst.x), Math.round(dst.y)));
  await evaluate(`__dmo.carry("")`);
  await sleep(120);
  await anchor();                       /* the new row grew the table: keep the sheet in frame */
  await rec(4);
}

/** Move the pointer somewhere with nothing in hand. */
async function moveTo(pt, steps = 8) {
  const from = await evaluate(`JSON.stringify(__dmo.last||{x:640,y:400})`).then(JSON.parse);
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps);
    await evaluate(`__dmo.at(${Math.round(from.x + (pt.x - from.x) * t)},${Math.round(from.y + (pt.y - from.y) * t)})`);
    await rec();
  }
  await evaluate(`__dmo.last={x:${Math.round(pt.x)},y:${Math.round(pt.y)}}`);
}

/** A visible click on a drawn symbol: the ring, then the page's own handler. */
async function clickSymbol(id) {
  const p = await evaluate(`JSON.stringify(__dmo.sym(${JSON.stringify(id)}))`).then(JSON.parse);
  await moveTo(p, 9);
  await evaluate(`(function(){ const vp=document.querySelector("#viewport");
    const ev=(t)=>vp.dispatchEvent(new PointerEvent(t,{pointerId:9,pointerType:"mouse",button:0,buttons:t==="pointerup"?0:1,clientX:${p.x},clientY:${p.y},bubbles:true}));
    ev("pointerdown"); ev("pointerup"); })()`);
  for (let k = 0; k <= 4; k++) { await evaluate(`__dmo.tap(${p.x},${p.y},${k / 4})`); await rec(); }
  await evaluate(`__dmo.tap(0,0,1)`);
  await rec(3);
}

/* ---------------------------------------------------------------- the film */
await evaluate(`replaceState({info:{site:"Milltown pumping station",date:"2026-09-05",by:"A. Ardigo",notes:""},rows:[]})`);
await anchor();
await evaluate(`__dmo.at(660,700)`);

/* the Feeds From cell of a row, for the pointer to rest on while it is named */
const cellOf = async (i, f) => JSON.parse(await evaluate(
  `(function(){const e=document.querySelector('tr[data-i="${i}"] [data-f="${f}"]');const r=e.getBoundingClientRect();
    return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)});})()`));

const steps = [
  { say: "S L D Sketch turns a survey table into a single line diagram. One row per item above, the drawing those rows make below. The table is the record: the drawing is always made from it, never the other way round.",
    async run() {
      await evaluate(`__dmo.title("SLD-Sketch","A substation, drawn by dragging symbols")`);
      await rec(22);
      await evaluate(`__dmo.title("")`);
      /* an establishing shot: the whole page, from the top down to the bench */
      const end = await evaluate(`Math.max(0, document.querySelector("#viewport").getBoundingClientRect().top + scrollY - ${SHEET_AT})`);
      await evaluate(`window.scrollTo(0,0)`);
      await rec(12);
      for (let i = 1; i <= 34; i++) {
        await evaluate(`window.scrollTo(0, ${Math.round(end)} * ${ease(i / 34).toFixed(4)})`);
        await rec();
      }
      await anchor();
      await rec(4);
    } },

  { say: "A survey starts where the power comes in. Drag the M V incomer from the palette onto the empty sheet.",
    async run() { await dragChip("MV Incomer", [0.34, 0.30], 16); } },

  { say: "A row appears, named M V one, with the engine's guesses tinted. An incomer is a source, so its Feeds From stays empty: its supply is off the drawing.",
    async run() { await rec(6); await moveTo(await cellOf(0, "from"), 9); await rec(12); } },

  { say: "Now the transformer, dropped straight onto the incomer.",
    async run() { await dragChip("Transformer", "MV1", 15); } },

  { say: "And Feeds From reads M V one, because that is the symbol it was dropped on. That one column is the only thing in the whole table that makes a connection.",
    async run() { await rec(4); await moveTo(await cellOf(1, "from"), 9); await rec(14); } },

  { say: "The low voltage board goes onto the transformer the same way.",
    async run() { await dragChip("LV Busbar", "TX1", 14); } },

  { say: "Then the ways out of it. Each feeder dropped on the bar becomes a way of that board, numbered as it goes.",
    async run() { await dragChip("Feeder", "BB1", 12); await dragChip("Feeder", "BB1", 10); } },

  { say: "A pump is dropped the same way, and is drawn as a motor rather than a plain way.",
    async run() { await dragChip("Pump", "BB1", 12); } },

  { say: "Click any symbol and its row is selected. The drawing and the table are two views of one thing.",
    async run() { await clickSymbol("TX1"); await rec(8); } },

  { say: "Six rows, and not one identifier typed by hand. From here the sheet leaves as a P D F, an S V G, or a D X F for the drawing office.",
    async run() { await moveTo({ x: 165, y: 466 }, 12); await rec(14); } },
];

console.log(`recording ${steps.length} steps at ${FPS} fps…`);
const audio = [];
for (const [i, s] of steps.entries()) {
  const wav = path.join(TMP, `say${i}.wav`);
  const dur = say(s.say, wav);
  await evaluate(`__dmo.cap(${JSON.stringify(s.say)})`);
  const start = shot;
  await s.run();
  const want = Math.ceil(dur * FPS) + 3;                 /* a beat of quiet after each line */
  if (shot - start < want) await rec(want - (shot - start));
  audio.push({ wav, frames: shot - start });
  console.log(`  ${String(i + 1).padStart(2)}. ${(shot - start) / FPS}s  ${s.say.slice(0, 58)}…`);
}
pg.close();

/* ---------------------------------------------------------------- assemble */
console.log(`assembling ${shot} frames…`);
const list = path.join(TMP, "audio.txt");
audio.forEach((a, i) => {
  const padded = path.join(TMP, `pad${i}.wav`);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", a.wav, "-af",
    `apad=whole_dur=${(a.frames / FPS).toFixed(3)}`, "-ar", "44100", "-ac", "1", padded]);
});
fs.writeFileSync(list, audio.map((_, i) => `file '${path.join(TMP, `pad${i}.wav`)}'`).join("\n") + "\n");
const track = path.join(TMP, "voice.wav");
execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", track]);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
execFileSync("ffmpeg", ["-v", "error", "-y",
  "-framerate", String(FPS), "-i", path.join(FRAMES, "%06d.jpg"),
  "-i", track,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "23",
  "-vf", `scale=${W}:${H}:flags=lanczos`, "-r", "25",
  "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", OUT]);

const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", OUT], { encoding: "utf8" }).trim();
console.log(`\nwrote ${path.relative(ROOT, OUT)} — ${(+dur).toFixed(1)}s, ${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB`);
fs.rmSync(TMP, { recursive: true, force: true });
