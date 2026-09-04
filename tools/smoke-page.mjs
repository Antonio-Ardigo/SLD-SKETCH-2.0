#!/usr/bin/env node
/* Open sld_sketchpad.html in headless Chromium and exercise the table UI
 * through the DevTools protocol: presets, typing, import, undo, quick values.
 *
 *   node tools/smoke-page.mjs            # uses $CHROME, else the Playwright chromium under /opt/pw-browsers
 *
 * Exit 1 on any failed check or page error. Needs no npm packages. */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./lib/cases.mjs";
import { openPage } from "./lib/headless.mjs";

const { evaluate, errors, close } = await openPage();
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
  /* the picker orders the sheet's IDs by what can feed the row: F1 is a feeder,
     so its LV board leads and the MV incomer that cannot feed it is last */
  await evaluate(`document.querySelector('tr[data-i="4"] [data-f="from"]').dispatchEvent(new FocusEvent('focusin',{bubbles:true}))`);
  const idlist = await evaluate(`JSON.stringify([...document.querySelectorAll('#idlist option')].map(o=>o.value+'|'+o.label))`);
  check("the ID list is ordered by what can feed the row", /^\["BB1\|LV Busbar · Main LV board".*"MV1\|MV Incomer · Utility supply — cannot feed a Feeder"\]$/.test(idlist), idlist);
  check("the row's own ID is not offered", !JSON.parse(idlist).some(o => o.startsWith("F1|")), idlist);

  /* quick values follow the row's type */
  await evaluate(`document.querySelector('tr[data-i="2"] [data-f="voltage"]').dispatchEvent(new FocusEvent('focusin',{bubbles:true})); document.querySelectorAll('#voltlist option').length`);
  check("transformer voltage list", await evaluate(`[...document.querySelectorAll('#voltlist option')].map(o=>o.value).includes('11/0.4 kV')`));
  await evaluate(`document.querySelector('tr[data-i="4"] [data-f="rating"]').dispatchEvent(new FocusEvent('focusin',{bubbles:true}))`);
  check("feeder rating list", await evaluate(`[...document.querySelectorAll('#ratinglist option')].map(o=>o.value).includes('250 A')`));

  /* the quick values follow what a row is, not how its Type is spelled, and a
     Type the sheet wrote its own way is kept rather than shown as an empty cell */
  await evaluate(`(function(){ state.rows.push(R("CAPX","PFC","Power factor correction","","400 V","BB1","","CB")); rebuildTable(); redraw(); })()`);
  await sleep(300);
  await evaluate(`(function(){ const i=state.rows.length-1; document.querySelector('tr[data-i="'+i+'"] [data-f="rating"]').dispatchEvent(new FocusEvent('focusin',{bubbles:true})); })()`);
  check("an aliased capacitor bank is offered kvar",
    await evaluate(`[...document.querySelectorAll('#ratinglist option')].every(o=>o.value.endsWith(' kvar'))`),
    await evaluate(`[...document.querySelectorAll('#ratinglist option')].map(o=>o.value).join(', ')`));
  check("the sheet's own Type label is kept",
    await evaluate(`document.querySelector('tr[data-i="'+(state.rows.length-1)+'"] [data-f="type"]').value`) === "PFC");
  await evaluate(`(function(){ state.rows.pop(); rebuildTable(); redraw(); })()`);
  await sleep(300);

  /* Enter on the last row adds one; Type change offers a default protection */
  await evaluate(`(function(){ const el=document.querySelector('tr[data-i="7"] [data-f="desc"]'); el.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
     el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
  check("Enter on last row adds a row", await evaluate(`document.querySelectorAll('#eqbody tr').length`) === 9);
  /* Enter repeats the row above: F4 is a feeder on BB1, so the new row is a feeder on BB1, whole */
  const again = await evaluate(`JSON.stringify(state.rows[8])`);
  check("Enter repeats the row above — same Type, same supply, the rest proposed",
    /"id":"F5".*"type":"Feeder".*"voltage":"400 V".*"from":"BB1".*"prot":"CB"/.test(again) && /"_p":\["from","id","prot","voltage"\]/.test(again), again);
  await evaluate(`(function(){ const s=document.querySelector('tr[data-i="8"] [data-f="type"]'); s.value='Feeder';
     s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  check("type change fills default protection", await evaluate(`document.querySelector('tr[data-i="8"] [data-f="prot"]').value`) === "CB");

  /* a bad Feeds from highlights the row and lists a clickable problem */
  await evaluate(`(function(){ const el=document.querySelector('tr[data-i="8"] [data-f="id"]'); el.value='F9'; el.dispatchEvent(new Event('input',{bubbles:true}));
     const f=document.querySelector('tr[data-i="8"] [data-f="from"]'); f.value='NOPE'; f.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(400);
  check("unknown supply marks the row", await evaluate(`document.querySelector('tr[data-i="8"]').classList.contains('err')`));
  check("problem line points at the row", await evaluate(`document.querySelector('#problems div[data-row="8"]') !== null`));
  /* the drawing is not withheld by the error: the row is on the sheet, floating, and exports still work */
  check("the sheet still draws with an unknown supply", await evaluate(`!!document.querySelector('#sheet svg g[data-id="F9"]')`));
  check("exports are not blocked by the error", await evaluate(`currentSheet()!==null`));
  check("nothing near NOPE: no suggestion offered", await evaluate(`document.querySelectorAll('#problems button.fix').length`) === 0);
  /* a near miss is named, and one click puts it right */
  await evaluate(`(function(){ const f=document.querySelector('tr[data-i="8"] [data-f="from"]'); f.value='bb1'; f.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(400);
  check("a near miss offers the ID it meant", (await evaluate(`(document.querySelector('#problems button.fix')||{}).textContent`)) === "use BB1");
  await evaluate(`document.querySelector('#problems button.fix').click()`);
  await sleep(400);
  check("one click writes the fix into the cell", await evaluate(`state.rows[8].from`) === "BB1" && await evaluate(`document.querySelector('tr[data-i="8"] [data-f="from"]').value`) === "BB1");
  check("and the error is gone", await evaluate(`document.querySelectorAll('#problems .err').length`) === 0);
  await evaluate(`(function(){ const f=document.querySelector('tr[data-i="8"] [data-f="from"]'); f.value='NOPE'; f.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(400);

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

  /* symbols carry their row id; clicking one selects the row */
  check("symbols carry data-id", await evaluate(`document.querySelectorAll('#sheet svg g[data-id]').length`) >= 10);
  check("hit areas added", await evaluate(`document.querySelectorAll('#sheet svg g[data-id] rect.hit').length`) >= 10);
  await evaluate(`(function(){ const g=document.querySelector('#sheet svg g[data-id="TX1"]'); g.scrollIntoView({block:'center'}); const r=g.getBoundingClientRect();
     const vp=document.querySelector('#viewport'); const x=r.left+r.width/2, y=r.top+r.height/2;
     vp.dispatchEvent(new PointerEvent('pointerdown',{clientX:x,clientY:y,button:0,pointerId:7,bubbles:true}));
     vp.dispatchEvent(new PointerEvent('pointerup',{clientX:x,clientY:y,button:0,pointerId:7,bubbles:true})); })()`);
  check("click on TX1 selects its row", await evaluate(`document.activeElement.closest('tr') && state.rows[+document.activeElement.closest('tr').dataset.i].id`) === "TX1");
  check("selected symbol highlighted", await evaluate(`document.querySelector('#sheet svg g[data-id="TX1"]').classList.contains('sel')`));

  /* the palette: dropping a Feeder on the LV board adds a row fed from it */
  check("palette has a chip per type", await evaluate(`document.querySelectorAll('#palette .chip').length`) === 17);
  const rowsBefore = await evaluate(`state.rows.length`);
  await evaluate(`(function(){ const g=document.querySelector('#sheet svg g[data-id="MSB"]'); g.scrollIntoView({block:'center'}); const r=g.getBoundingClientRect();
     const vp=document.querySelector('#viewport'); const dt=new DataTransfer(); dt.setData('text/sld-type','Feeder');
     const ev=new DragEvent('drop',{clientX:r.left+r.width/2,clientY:r.top+r.height/2,dataTransfer:dt,bubbles:true,cancelable:true});
     vp.dispatchEvent(ev); })()`);
  await sleep(400);
  check("drop adds a row", await evaluate(`state.rows.length`) === rowsBefore + 1);
  const dropped = await evaluate(`JSON.stringify(state.rows.find(r=>r.type==='Feeder'&&!r.desc&&!r.rating)||null)`);
  check("new row is a Feeder fed from MSB with an auto ID and CB", /"id":"F\d+".*"from":"MSB".*"prot":"CB"/.test(dropped), dropped);
  check("new row is drawn", await evaluate(`(function(){ const r=state.rows.find(r=>r.type==='Feeder'&&!r.desc&&!r.rating); return !!r && !!document.querySelector('#sheet svg g[data-id="'+r.id+'"]'); })()`));
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}))`);
  check("undo removes the dropped row", await evaluate(`state.rows.length`) === rowsBefore);

  /* the engine proposes the new row's values at addition, tinted until edited */
  await evaluate(`(function(){ const p=document.querySelector('#preset'); p.value='7'; p.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await sleep(400);
  await evaluate(`addRowFor('Feeder','MSB')`);
  await sleep(400);
  const proposedFeeder = await evaluate(`JSON.stringify(state.rows.find(r=>r.type==='Feeder'&&r.from==='MSB'&&!r.desc)||null)`);
  check("dropped feeder is proposed whole", /"id":"F\d+".*"voltage":"400 V".*"from":"MSB".*"prot":"CB"/.test(proposedFeeder), proposedFeeder);
  check("proposed cells are tinted", await evaluate(`(function(){ const r=state.rows.findIndex(r=>r.type==='Feeder'&&r.from==='MSB'&&!r.desc);
     return [...document.querySelectorAll('tr[data-i="'+r+'"] input.proposed')].map(e=>e.dataset.f).sort().join(','); })()`) === "from,id,prot,voltage");
  check("a proposed cell says so", (await evaluate(`document.querySelector('input.proposed').title`)).includes("proposed by the engine"));
  /* typing in a proposed cell confirms it */
  await evaluate(`(function(){ const r=state.rows.findIndex(r=>r.type==='Feeder'&&r.from==='MSB'&&!r.desc);
     const el=document.querySelector('tr[data-i="'+r+'"] [data-f="voltage"]'); el.value='690 V'; el.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  await sleep(400);
  check("typing clears that cell's tint", await evaluate(`(function(){ const r=state.rows.findIndex(r=>r.type==='Feeder'&&r.voltage==='690 V');
     const tr=document.querySelector('tr[data-i="'+r+'"]');
     return !tr.querySelector('[data-f="voltage"]').classList.contains('proposed') && tr.querySelector('[data-f="prot"]').classList.contains('proposed'); })()`));

  /* renaming a board: every way that named it follows, in one edit */
  const refs = id => evaluate(`state.rows.filter(r=>r.from.split(',').map(s=>s.trim()).includes(${JSON.stringify(id)})).length`);
  const waysOfMSB = await refs("MSB");
  await sleep(900);   /* a pause, as a person makes before a new edit: the rename is its own undo step */
  await evaluate(`(function(){ const i=rowIndexOf('MSB'); const el=document.querySelector('tr[data-i="'+i+'"] [data-f="id"]');
     el.dispatchEvent(new FocusEvent('focusin',{bubbles:true})); el.value='MSB1'; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await sleep(400);
  check("renaming an ID renames every reference to it", waysOfMSB >= 5 && await refs("MSB1") === waysOfMSB && await refs("MSB") === 0,
    await evaluate(`JSON.stringify(state.rows.map(r=>r.id+'<'+r.from))`));
  check("the renamed sheet has no errors", await evaluate(`document.querySelectorAll('#problems .err').length`) === 0);
  check("the cells on screen show the new name", await evaluate(`[...document.querySelectorAll('[data-f="from"]')].filter(e=>e.value.split(',').map(s=>s.trim()).includes('MSB1')).length`) === waysOfMSB);
  await evaluate(`undo()`);
  await sleep(400);
  check("one undo brings back the old name and its references together", await evaluate(`rowIndexOf('MSB')>=0`) && await refs("MSB") === waysOfMSB && await refs("MSB1") === 0,
    await evaluate(`JSON.stringify(state.rows.map(r=>r.id+'<'+r.from))`));
  /* a rename onto an ID another row already has: nothing follows, and the reader says so */
  const refsF1 = await refs("F1");
  await sleep(900);
  await evaluate(`(function(){ const i=rowIndexOf('F1'); const el=document.querySelector('tr[data-i="'+i+'"] [data-f="id"]');
     el.dispatchEvent(new FocusEvent('focusin',{bubbles:true})); el.value='F2'; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await sleep(400);
  check("a rename onto an existing ID is reported, not followed", (await evaluate(`document.querySelector('#problems').textContent`)).includes('Duplicate ID "F2"') && await refs("F1") === refsF1);
  await evaluate(`undo()`);
  await sleep(400);
  check("and undone", await evaluate(`state.rows.filter(r=>r.id==='F1').length`) === 1);

  /* a source is added with no supply: the drop names where the row goes, not
     what feeds it, and the board it was dropped on is left alone */
  const msbBefore = await evaluate(`(state.rows.find(r=>r.id==='MSB')||{}).from`);
  await evaluate(`addRowFor('Generator','MSB')`);
  await sleep(400);
  const gen = await evaluate(`JSON.stringify(state.rows.find(r=>r.type==='Generator')||null)`);
  check("a dropped generator has no supply", /"from":""/.test(gen) && /"id":"G\d+"/.test(gen), gen);
  check("its voltage still follows the board it was dropped on", /"voltage":"400 V"/.test(gen), gen);
  check("the board it was dropped on is untouched", await evaluate(`(state.rows.find(r=>r.id==='MSB')||{}).from`) === msbBefore);
  check("the generator says it feeds nothing", (await evaluate(`document.querySelector('#problems').textContent`)).includes("feeds nothing"));
  await evaluate(`undo()`);
  await sleep(400);

  /* + Add row proposes the supply of the row above; choosing a Type fills the rest */
  await evaluate(`document.querySelector('#addrow').click()`);
  await sleep(400);
  check("added row takes the supply above", await evaluate(`state.rows[state.rows.length-1].from`) === "MSB");
  await evaluate(`(function(){ const i=state.rows.length-1; const s=document.querySelector('tr[data-i="'+i+'"] [data-f="type"]');
     s.value='Transformer'; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await sleep(400);
  const typed = await evaluate(`JSON.stringify(state.rows[state.rows.length-1])`);
  /* the Type moves the row to where it belongs: a transformer sits on the MV
     gear, not on the LV board the row above happened to name */
  /* and choosing a source on a row that already carries a proposed supply clears it */
  await evaluate(`(function(){ const i=state.rows.length-1; const s=document.querySelector('tr[data-i="'+i+'"] [data-f="type"]');
     s.value='Generator'; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await sleep(400);
  const asGen = await evaluate(`JSON.stringify(state.rows[state.rows.length-1])`);
  const g = JSON.parse(asGen);
  check("choosing Generator clears the transformer's proposed supply, device and ratio",
    g.type === "Generator" && g.from === "" && g.prot === "" && g.voltage === "" && /^G\d+$/.test(g.id), asGen);
  check("the cleared cells are cleared on screen too",
    await evaluate(`['from','prot','voltage'].every(f=>document.querySelector('tr[data-i="'+(state.rows.length-1)+'"] [data-f="'+f+'"]').value==="")`));
  await evaluate(`(function(){ const i=state.rows.length-1; const s=document.querySelector('tr[data-i="'+i+'"] [data-f="type"]');
     s.value='Transformer'; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await sleep(400);
  check("choosing a Type proposes the supply, ID, protection and voltage",
    /"id":"TX\d+".*"voltage":"11\/0.4 kV".*"from":"RMU1".*"prot":"Fuse-switch"/.test(typed), typed);
  check("the proposal never leaves the page", !(await evaluate(`rowsToCsv(state.rows)`)).includes("_p"));
  await evaluate(`(function(){ const p=document.querySelector('#preset'); p.value='1'; p.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await sleep(400);

  /* view options change the picture, not the table */
  const w0 = await evaluate(`+document.querySelector('#sheet svg').getAttribute('width')`);
  const rowsJson = await evaluate(`JSON.stringify(state.rows)`);
  await evaluate(`(function(){ const s=document.querySelector('#v-spacing'); s.value='wide'; s.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  check("wide spacing widens the sheet", await evaluate(`+document.querySelector('#sheet svg').getAttribute('width')`) > w0,
    await evaluate(`'w0='+${w0}+' now='+document.querySelector('#sheet svg').getAttribute('width')+' FEEDER_SPACING='+FEEDER_SPACING+' view_='+JSON.stringify(view_)+' rows='+state.rows.length+' problems='+document.querySelector('#problems').textContent.slice(0,120)`));
  check("the table is untouched by the view", await evaluate(`JSON.stringify(state.rows)`) === rowsJson);
  await evaluate(`(function(){ const c=document.querySelector('#v-legend'); c.checked=false; c.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  check("legend off removes the legend", await evaluate(`!document.querySelector('#sheet svg').innerHTML.includes('>LEGEND<')`));
  check("view is saved beside the table", await evaluate(`JSON.parse(localStorage.getItem('sld-sketchpad')).view.spacing`) === "wide");
  await evaluate(`document.querySelector('#focus').click()`);
  check("focus mode hides the table", await evaluate(`document.body.classList.contains('focus') && getComputedStyle(document.querySelector('.panel')).display==='none'`));
  await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  check("Escape leaves focus mode", await evaluate(`!document.body.classList.contains('focus')`));
  await evaluate(`(function(){ const s=document.querySelector('#v-spacing'); s.value='normal'; s.dispatchEvent(new Event('change',{bubbles:true})); const c=document.querySelector('#v-legend'); c.checked=true; c.dispatchEvent(new Event('change',{bubbles:true})); })()`);

  /* the three drawing exports: catch the Blob each button hands the browser */
  await evaluate(`(function(){ window.__saved=[];
    const real=URL.createObjectURL.bind(URL);
    URL.createObjectURL=b=>{ const i=window.__saved.length; window.__saved.push({type:b.type,size:b.size,blob:b}); return real(b); };
    HTMLAnchorElement.prototype.click=function(){ if(this.download) window.__saved[window.__saved.length-1].name=this.download; }; })()`);
  for (const [id, ext, mime] of [["pdf", ".pdf", "application/pdf"], ["svg", ".svg", "image/svg+xml"], ["dxf", ".dxf", "application/dxf"]]) {
    await evaluate(`document.querySelector('#${id}').click()`);
    await sleep(300);
    const saved = await evaluate(`JSON.stringify(window.__saved[window.__saved.length-1]||null)`);
    for (let i = 0; i < 20 && !(await evaluate(`document.querySelector('#copystate').textContent`)).includes(ext); i++) await sleep(100);
    const got = JSON.parse(saved) || {};
    check(`Download ${id.toUpperCase()} saves a file`, got.type === mime && (got.name || "").endsWith(ext) && got.size > 500, saved);
    check(`Download ${id.toUpperCase()} says so`, (await evaluate(`document.querySelector('#copystate').textContent`)).includes(ext), saved);
  }
  const head = await evaluate(`window.__saved[0].blob.text().then(t=>t.slice(0,9)+'|'+t.trimEnd().slice(-5))`);
  check("the PDF is a PDF", head === "%PDF-1.4\n|%%EOF", head);
  const svgHead = await evaluate(`window.__saved[1].blob.text().then(t=>t.slice(0,5)+' hit='+/class="hit"|rect class/.test(t))`);
  check("the SVG is the drawing, not the screen", svgHead === "<svg  hit=false", svgHead);
  check("the exports never reach the buttons that are gone", await evaluate(`!document.querySelector('#copysvg') && !document.querySelector('#copydxf')`));

  /* saved state is versioned */
  check("saved state has a version", await evaluate(`JSON.parse(localStorage.getItem('sld-sketchpad')).v`) === 3);

  check("no page errors", errors.length === 0, errors.join(" || "));
} catch (e) {
  console.error("smoke test crashed:", e.message); failed++;
} finally {
  close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
