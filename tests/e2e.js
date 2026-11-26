// Notes — browser test suite (headless Chromium via playwright-core).
//
//   npm i playwright-core
//   CHROME=/path/to/chrome node tests/e2e.js
//
// Serves the repo under /Notepad/ to mimic GitHub Pages, on a phone-sized viewport.
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { chromium } = require(process.env.PW_CORE || 'playwright-core');

const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const ROOT = path.resolve(__dirname, '..');
const PORT = 8771;
const URL = 'http://localhost:' + PORT + '/Notepad/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
}

(async () => {
  // GitHub Pages simulation: <tmp>/Notepad -> repo root
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'pagesim-'));
  fs.symlinkSync(ROOT, path.join(site, 'Notepad'));
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', site], { stdio: 'ignore' });
  await sleep(800);
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-prof-'));
  const launch = () => chromium.launchPersistentContext(prof, {
    executablePath: EXE, args: ['--no-sandbox'],
    viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true,
    permissions: ['clipboard-read', 'clipboard-write']
  });
  let ctx = await launch();
  let p = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  const watch = pg => pg.on('pageerror', e => errors.push(e.message));
  watch(p);

  const stored = id => p.evaluate(i => localStorage.getItem('notes.sheet.' + i), id);
  const meta = () => p.evaluate(() => JSON.parse(localStorage.getItem('notes.meta')));
  const activeArea = 'textarea.sheet.on';
  const tabs = () => p.$$eval('.tab', b => b.map(x => x.textContent));
  const css = (sel, prop) => p.$eval(sel, (e, pr) => getComputedStyle(e)[pr], prop);
  const menuPick = async (item, option) => {
    await p.click('#btnMenu'); await p.click(item);
    if (option) await p.click('.opt:has-text("' + option + '")');
  };

  console.log('Boot');
  await p.goto(URL); await p.waitForSelector(activeArea);
  check('one sheet on first launch', (await tabs()).length === 1, await tabs());
  check('first tab reads Untitled', (await tabs())[0] === 'Untitled');
  check('default font is Medium (18px)', (await css(activeArea, 'fontSize')) === '18px');
  check('default sheet is white with black text',
    (await css(activeArea, 'backgroundColor')) === 'rgb(255, 255, 255)' && (await css(activeArea, 'color')) === 'rgb(0, 0, 0)');
  check('header + button and menu button present', !!(await p.$('#btnAdd')) && !!(await p.$('#btnMenu')));
  const ids = await p.$$eval('[id]', els => els.map(e => e.id));
  const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const refs = [...src.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);
  const missing = refs.filter(r => !ids.includes(r));
  check('every getElementById target exists', missing.length === 0, missing);

  console.log('Auto-save');
  const id1 = (await meta()).active;
  await p.click(activeArea);
  await p.keyboard.type('Shop');
  check('saved after 4 keystrokes, no blur', (await stored(id1)) === 'Shop', await stored(id1));
  await p.keyboard.type('ping list');
  await p.keyboard.press('Enter');
  await p.keyboard.type('milk, eggs');
  check('saved every keystroke incl. newline', (await stored(id1)) === 'Shopping list\nmilk, eggs', await stored(id1));
  check('tab title follows first line', (await tabs())[0] === 'Shopping list', await tabs());

  console.log('Survives the app being killed');
  const anchor = await ctx.newPage();                 // keeps the browser alive while the app's tab dies
  await p.bringToFront();
  await p.click(activeArea); await p.keyboard.press('End');
  await p.keyboard.type(' bread');                    // no blur, no pause
  // SIGKILL every renderer process of this browser profile, mid-edit
  const { execSync } = require('child_process');
  const killed = execSync('for b in $(pgrep -f "user-data-dir=' + prof + '" -d " "); do ' +
    'for c in $(pgrep -P $b); do tr "\\0" " " < /proc/$c/cmdline | grep -q "type=renderer" && kill -9 $c && echo $c; done; done; true')
    .toString().trim().split(/\s+/).filter(Boolean);
  check('renderer processes killed', killed.length > 0, killed);
  await sleep(800);
  for (const pg of ctx.pages()) await pg.close().catch(() => {});
  p = await ctx.newPage(); watch(p);
  await p.goto(URL); await p.waitForSelector(activeArea);
  check('text intact after renderer kill', (await p.inputValue(activeArea)) === 'Shopping list\nmilk, eggs bread',
    await p.inputValue(activeArea));
  await p.click(activeArea); await p.keyboard.press('End'); await p.keyboard.type('!');
  await sleep(2500);                                   // browser commits storage to disk
  await ctx.close();                                   // whole browser gone
  ctx = await launch(); p = ctx.pages()[0] || await ctx.newPage(); watch(p);
  await p.goto(URL); await p.waitForSelector(activeArea);
  check('text intact after full browser restart', (await p.inputValue(activeArea)) === 'Shopping list\nmilk, eggs bread!',
    await p.inputValue(activeArea));

  console.log('Tabs');
  await p.click('#btnAdd');
  check('+ adds a second tab', (await tabs()).length === 2, await tabs());
  const id2 = (await meta()).active;
  check('new sheet is active and empty', id2 !== id1 && (await p.inputValue(activeArea)) === '');
  check('new sheet has keyboard focus', await p.evaluate(() => document.activeElement.classList.contains('on')));
  await p.keyboard.type('Ideas');
  check('second sheet saved separately', (await stored(id2)) === 'Ideas' && (await stored(id1)).startsWith('Shopping'));
  await p.click('.tab >> nth=0');
  check('switching back shows first sheet', (await p.inputValue(activeArea)).startsWith('Shopping list'));
  await p.reload(); await p.waitForSelector(activeArea);
  check('active tab remembered across reload', (await p.inputValue(activeArea)).startsWith('Shopping list') && (await tabs()).length === 2);

  console.log('Copy and paste');
  await p.click(activeArea);
  await p.keyboard.press('Control+A'); await p.keyboard.press('Control+C');
  await p.click('.tab >> nth=1');
  await p.click(activeArea); await p.keyboard.press('End'); await p.keyboard.press('Enter');
  await p.keyboard.press('Control+V');
  check('pasted text lands in the sheet', (await p.inputValue(activeArea)) === 'Ideas\nShopping list\nmilk, eggs bread!',
    await p.inputValue(activeArea));
  check('pasted text is saved', (await stored(id2)) === 'Ideas\nShopping list\nmilk, eggs bread!');
  check('copied text is readable by other apps', (await p.evaluate(() => navigator.clipboard.readText())) === 'Shopping list\nmilk, eggs bread!');

  console.log('Menu');
  const visibleItems = () => p.$$eval('#menu button', b => b.filter(x => x.offsetParent !== null).map(x => x.textContent));
  // a local file can't be installed, so the browser never offers it: exactly three options
  const fp = await ctx.newPage(); watch(fp);
  await fp.goto('file://' + path.join(ROOT, 'index.html'));
  await fp.click('#btnMenu');
  const fileItems = await fp.$$eval('#menu button', b => b.filter(x => x.offsetParent !== null).map(x => x.textContent));
  check('menu shows exactly the three options when install isn’t available',
    JSON.stringify(fileItems) === JSON.stringify(['Change font size', 'Delete sheet', 'Change color of sheet']), fileItems);
  await fp.close();
  // served over http(s) with manifest + service worker, Chrome offers install
  await p.bringToFront();
  await p.evaluate(() => {                      // in case the real event already fired and was consumed
    const e = new Event('beforeinstallprompt');
    e.prompt = () => {}; e.userChoice = Promise.resolve({ outcome: 'dismissed' });
    window.dispatchEvent(e);
  });
  await p.click('#btnMenu');
  const items = await visibleItems();
  check('served app: three options then Install app',
    JSON.stringify(items) === JSON.stringify(['Change font size', 'Delete sheet', 'Change color of sheet', 'Install app']), items);
  await p.click('#mInstall');
  await sleep(100);
  check('Install app hides again after the prompt', !(await p.isVisible('#mInstall')));
  await p.click('#btnMenu');
  check('menu shows version 2.1.0', (await p.textContent('#menu .ver')).trim() === 'Notes v2.1.0');
  await p.click('main', { position: { x: 200, y: 600 } });
  check('tapping outside closes the menu', await p.$eval('#menu', m => m.hidden));

  await menuPick('#mFont', 'Large');
  check('font size Large = 22px', (await css(activeArea, 'fontSize')) === '22px');
  await menuPick('#mFont', 'Small');
  check('font size Small = 14px', (await css(activeArea, 'fontSize')) === '14px');
  await menuPick('#mFont', 'Extra large');
  check('font size Extra large = 28px', (await css(activeArea, 'fontSize')) === '28px');

  await menuPick('#mColor', 'Black');
  check('black sheet, white text', (await css(activeArea, 'backgroundColor')) === 'rgb(18, 18, 18)' && (await css(activeArea, 'color')) === 'rgb(255, 255, 255)');
  await menuPick('#mColor', 'Lime pastel green');
  check('lime sheet, black text', (await css(activeArea, 'backgroundColor')) === 'rgb(221, 243, 184)' && (await css(activeArea, 'color')) === 'rgb(0, 0, 0)');
  await p.reload(); await p.waitForSelector(activeArea);
  check('font + color remembered after reload', (await css(activeArea, 'fontSize')) === '28px' && (await css(activeArea, 'backgroundColor')) === 'rgb(221, 243, 184)');
  await menuPick('#mColor', 'White');
  check('back to white', (await css(activeArea, 'backgroundColor')) === 'rgb(255, 255, 255)');
  await menuPick('#mFont', 'Medium');

  console.log('Delete sheet');
  await p.click('.tab >> nth=1');
  await menuPick('#mDelete');
  check('delete asks for confirmation', await p.isVisible('#confirmDelete'));
  await p.click('.actions button:has-text("Cancel")');
  check('cancel keeps the sheet', (await tabs()).length === 2);
  await menuPick('#mDelete'); await p.click('#confirmDelete');
  check('confirm removes only the open sheet', (await tabs()).length === 1 && (await p.inputValue(activeArea)).startsWith('Shopping'));
  check('deleted sheet removed from storage', (await stored(id2)) === null);
  await menuPick('#mDelete'); await p.click('#confirmDelete');
  check('deleting the last sheet leaves one fresh empty sheet', (await tabs()).length === 1 && (await p.inputValue(activeArea)) === '' && (await tabs())[0] === 'Untitled');
  check('old text gone from storage', (await stored(id1)) === null);

  console.log('Drawing sheets');
  const D = '.drawing.on';
  const frame = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const dstate = () => p.$eval(D, d => ({ scroll: +(d.dataset.scroll || 0), strokes: +(d.dataset.strokes || 0), h: d.clientHeight, id: d.dataset.id }));
  const idbCount = sid => p.evaluate(sid => new Promise((res, rej) => {
    const r = indexedDB.open('notes-db', 1);
    r.onsuccess = () => {
      const q = r.result.transaction('strokes').objectStore('strokes').count(IDBKeyRange.bound([sid, -Infinity], [sid, Infinity]));
      q.onsuccess = () => { res(q.result); r.result.close(); };
    };
    r.onerror = () => rej(r.error);
  }), sid);
  const canvasBox = async () => (await p.$(D + ' canvas')).boundingBox();
  const pixel = (x, y) => p.$eval(D + ' canvas', (c, [x, y]) => {
    const k = c.width / c.clientWidth, d = c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
    return 'rgb(' + d[0] + ', ' + d[1] + ', ' + d[2] + ')';
  }, [x, y]);
  // css-px thickness of ink crossing a vertical scan line at x, between y0 and y1
  const thickness = (x, y0, y1) => p.$eval(D + ' canvas', (c, [x, y0, y1]) => {
    const k = c.width / c.clientWidth, g = c.getContext('2d');
    const bg = g.getImageData(1, Math.round(y0 * k), 1, 1).data;
    const col = g.getImageData(Math.round(x * k), Math.round(y0 * k), 1, Math.round((y1 - y0) * k)).data;
    let ink = 0;
    for (let i = 0; i < col.length; i += 4) ink += (Math.abs(col[i] - bg[0]) + Math.abs(col[i + 1] - bg[1]) + Math.abs(col[i + 2] - bg[2])) / 765;
    return ink / k;
  }, [x, y0, y1]);
  const mouseLine = async (x0, y0, x1, y1) => {
    const b = await canvasBox();
    await p.mouse.move(b.x + x0, b.y + y0); await p.mouse.down();
    await p.mouse.move(b.x + x1, b.y + y1, { steps: 20 }); await p.mouse.up();
    await frame();
  };
  // synthetic pointers (pen / touch) on the open drawing's canvas
  const ptr = (type, o) => p.$eval(D + ' canvas', (c, [type, o]) => {
    const r = c.getBoundingClientRect();
    c.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, isPrimary: !!o.primary,
      pointerId: o.id, pointerType: o.type, pressure: o.pressure == null ? (type === 'pointerup' ? 0 : 0.5) : o.pressure,
      button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: r.left + o.x, clientY: r.top + o.y }));
  }, [type, o]);
  const ptrLine = async (type, id, x0, y0, x1, y1, pressure) => {
    await ptr('pointerdown', { id, type, x: x0, y: y0, pressure, primary: true });
    for (let i = 1; i <= 20; i++) await ptr('pointermove', { id, type, x: x0 + (x1 - x0) * i / 20, y: y0 + (y1 - y0) * i / 20, pressure });
    await ptr('pointerup', { id, type, x: x1, y: y1 });
    await frame();
  };

  const textTabs = (await tabs()).length;
  await p.click('#btnDraw');
  await p.waitForSelector(D + '[data-loaded="1"]');
  let ds = await dstate();
  const drawId = ds.id;
  check('pen button opens a new drawing tab', (await tabs()).length === textTabs + 1 && (await tabs())[textTabs] === '✎ Drawing 1', await tabs());
  check('drawing page shows instead of a text box', !(await p.isVisible(activeArea)) && await p.isVisible(D + ' canvas'));
  check('no keyboard focus on a drawing', await p.evaluate(() => !document.activeElement || document.activeElement.tagName !== 'TEXTAREA'));
  check('toolbar: super fine, regular, wide, invert',
    JSON.stringify(await p.$$eval(D + ' .dbar button', b => b.map(x => x.getAttribute('aria-label')))) === JSON.stringify(['Super fine pen', 'Regular pen', 'Wide pen', 'Invert colors']));
  check('regular pen selected by default', await p.$eval(D + ' .dbar button[data-pen="regular"]', b => b.classList.contains('on')));
  check('blank page is white', (await pixel(200, 300)) === 'rgb(255, 255, 255)');

  // three pen sizes, drawn as horizontal lines, measured across
  for (const [pen, y] of [['fine', 100], ['regular', 160], ['wide', 220]]) {
    await p.click(D + ' .dbar button[data-pen="' + pen + '"]');
    await mouseLine(60, y, 340, y);
  }
  const tFine = await thickness(200, 80, 120), tReg = await thickness(200, 140, 180), tWide = await thickness(200, 195, 245);
  check('super fine ink is thin (~1.5px)', tFine > 0.8 && tFine < 2.3, tFine);
  check('regular ink is ~3px', tReg > 2.4 && tReg < 3.8, tReg);
  check('wide ink is ~8px', tWide > 6.8 && tWide < 9.2, tWide);
  check('ink is black on white', (await pixel(200, 220)) === 'rgb(0, 0, 0)', await pixel(200, 220));
  check('each stroke saved', (await dstate()).strokes === 3 && (await idbCount(drawId)) === 3, [await dstate(), await idbCount(drawId)]);
  await p.click(D + ' .dbar button[data-pen="regular"]');

  // finger input before any stylus has been seen: one finger draws, two fingers scroll
  check('no stylus seen yet', await p.evaluate(() => localStorage.getItem('notes.penSeen')) === null);
  await ptrLine('touch', 11, 60, 300, 300, 300);
  check('one finger draws (no stylus yet)', (await dstate()).strokes === 4 && (await pixel(180, 300)) === 'rgb(0, 0, 0)');
  let before = await dstate();
  await ptr('pointerdown', { id: 21, type: 'touch', x: 150, y: 600, primary: true });
  await ptr('pointermove', { id: 21, type: 'touch', x: 150, y: 590 });
  await ptr('pointerdown', { id: 22, type: 'touch', x: 250, y: 600 });
  for (let i = 1; i <= 10; i++) {
    await ptr('pointermove', { id: 21, type: 'touch', x: 150, y: 590 - i * 20 });
    await ptr('pointermove', { id: 22, type: 'touch', x: 250, y: 600 - i * 20 });
  }
  await ptr('pointerup', { id: 21, type: 'touch', x: 150, y: 390 });
  await ptr('pointerup', { id: 22, type: 'touch', x: 250, y: 400 });
  await sleep(400); await frame();
  ds = await dstate();
  check('two fingers scroll the page', ds.scroll > before.scroll + 100, [before.scroll, ds.scroll]);
  check('two-finger scroll leaves no ink', ds.strokes === before.strokes, [before.strokes, ds.strokes]);
  await p.mouse.wheel(0, -5000); await sleep(100); await frame();
  check('mouse wheel scrolls back to the top', (await dstate()).scroll === 0);

  // a real stylus: draws with pressure, and from then on a finger scrolls
  await ptrLine('pen', 31, 60, 400, 300, 400, 0.9);
  check('stylus draws', (await dstate()).strokes === 5 && (await pixel(180, 400)) === 'rgb(0, 0, 0)');
  check('stylus is remembered', await p.evaluate(() => localStorage.getItem('notes.penSeen')) === '1');
  const tPress = await thickness(180, 385, 415);
  check('pressing harder draws thicker (regular, pressure .9)', tPress > 3.6 && tPress < 4.9, tPress);
  before = await dstate();
  await ptrLine('touch', 41, 200, 700, 200, 500);
  await sleep(400);
  ds = await dstate();
  check('after a stylus, one finger scrolls instead of drawing', ds.strokes === before.strokes && ds.scroll > 100, ds);
  await p.mouse.wheel(0, -5000); await sleep(100); await frame();
  // palm resting while the stylus writes
  await ptr('pointerdown', { id: 51, type: 'pen', x: 60, y: 460, pressure: 0.5, primary: true });
  await ptr('pointerdown', { id: 52, type: 'touch', x: 300, y: 800 });
  for (let i = 1; i <= 10; i++) {
    await ptr('pointermove', { id: 51, type: 'pen', x: 60 + i * 20, y: 460, pressure: 0.5 });
    await ptr('pointermove', { id: 52, type: 'touch', x: 300, y: 800 - i * 15 });
  }
  await ptr('pointerup', { id: 51, type: 'pen', x: 260, y: 460 });
  await ptr('pointerup', { id: 52, type: 'touch', x: 300, y: 650 });
  await sleep(300); await frame();
  ds = await dstate();
  check('palm on the screen is ignored while the stylus writes', ds.strokes === 6 && ds.scroll === 0, ds);

  // endless page: scroll to the end, write there, and the end moves further down
  const h = ds.h;
  let lastMax = 0, grew = 0;
  for (let i = 0; i < 4; i++) {
    await p.mouse.wheel(0, 100000); await sleep(80); await frame();
    const m = (await dstate()).scroll;
    if (m > lastMax) grew++;
    lastMax = m;
    await mouseLine(80, h - 120, 320, h - 120);          // write near the bottom of the screen
  }
  await p.mouse.wheel(0, 100000); await sleep(80); await frame();
  ds = await dstate();
  check('page keeps growing as you write further down', grew === 4 && ds.scroll > lastMax, [grew, lastMax, ds.scroll]);
  check('scrolled well past several screens', ds.scroll > 6 * h, [ds.scroll, h]);
  const deep = ds.strokes;
  await p.mouse.wheel(0, -1000000); await sleep(80); await frame();
  check('ink at the top is still there after scrolling back', (await pixel(200, 160)) === 'rgb(0, 0, 0)');

  // invert: white ink on black, and back
  await p.click(D + ' .dbar button[data-invert]'); await frame();
  check('invert: black page', (await pixel(10, 600)) === 'rgb(18, 18, 18)', await pixel(10, 600));
  check('invert: white ink', (await pixel(200, 220)) === 'rgb(255, 255, 255)', await pixel(200, 220));
  check('invert button shows as on', await p.$eval(D + ' .dbar button[data-invert]', b => b.classList.contains('on')));
  await p.click(D + ' .dbar button[data-invert]'); await frame();
  check('flip back: white page, black ink', (await pixel(10, 600)) === 'rgb(255, 255, 255)' && (await pixel(200, 220)) === 'rgb(0, 0, 0)');
  await p.click(D + ' .dbar button[data-invert]'); await frame();

  // the rest of the menu works the same on a drawing
  await p.click('#btnMenu');
  const dItems = await p.$$eval('#menu button', b => b.filter(x => x.offsetParent !== null).map(x => x.textContent));
  check('menu on a drawing: delete + color (no font size)', dItems.includes('Delete sheet') && dItems.includes('Change color of sheet') && !dItems.includes('Change font size'), dItems);
  await p.click('#mColor'); await p.click('.opt:has-text("Lime pastel green")'); await frame();
  check('sheet color applies to the drawing (inverted lime: dark page, lime ink)', (await pixel(10, 600)) === 'rgb(18, 18, 18)' && (await pixel(200, 220)) === 'rgb(221, 243, 184)', [await pixel(10, 600), await pixel(200, 220)]);
  await p.click(D + ' .dbar button[data-invert]'); await frame();
  check('lime page with black ink', (await pixel(10, 600)) === 'rgb(221, 243, 184)' && (await pixel(200, 220)) === 'rgb(0, 0, 0)');
  await menuPick('#mColor', 'White'); await frame();
  await p.click(D + ' .dbar button[data-invert]'); await frame();   // leave it inverted to test it's remembered

  // saving: reload, killed app, full restart
  await p.reload(); await p.waitForSelector(D + '[data-loaded="1"]'); await frame();
  ds = await dstate();
  check('drawing reopens after reload with all ink', ds.strokes === deep && (await idbCount(drawId)) === deep, [ds.strokes, deep]);
  check('invert remembered after reload', (await pixel(10, 600)) === 'rgb(18, 18, 18)' && (await pixel(200, 220)) === 'rgb(255, 255, 255)');
  check('pen choice remembered', await p.$eval(D + ' .dbar button[data-pen="regular"]', b => b.classList.contains('on')));
  await mouseLine(60, 520, 340, 520);
  await sleep(300);
  {
    const anchor2 = await ctx.newPage(); await p.bringToFront();
    const { execSync } = require('child_process');
    execSync('for b in $(pgrep -f "user-data-dir=' + prof + '" -d " "); do for c in $(pgrep -P $b); do tr "\\0" " " < /proc/$c/cmdline | grep -q "type=renderer" && kill -9 $c; done; done; true');
    await sleep(800);
    for (const pg of ctx.pages()) await pg.close().catch(() => {});
  }
  p = await ctx.newPage(); watch(p);
  await p.goto(URL); await p.waitForSelector(D + '[data-loaded="1"]'); await frame();
  check('last stroke survives the app being killed', (await dstate()).strokes === deep + 1 && (await pixel(200, 520)) === 'rgb(255, 255, 255)');
  await sleep(1500); await ctx.close();
  ctx = await launch(); p = ctx.pages()[0] || await ctx.newPage(); watch(p);
  await p.goto(URL); await p.waitForSelector(D + '[data-loaded="1"]'); await frame();
  check('ink intact after a full browser restart', (await dstate()).strokes === deep + 1);

  // tabs and delete
  await p.click('#btnDraw'); await p.waitForSelector(D + '[data-loaded="1"]');
  const draw2 = (await dstate()).id;
  check('second drawing is "Drawing 2" and starts blank', (await tabs()).slice(-1)[0] === '✎ Drawing 2' && (await dstate()).strokes === 0 && (await pixel(200, 220)) === 'rgb(255, 255, 255)');
  await mouseLine(60, 100, 300, 100);
  await p.click('.tab >> nth=' + textTabs);
  await p.waitForSelector(D + '[data-id="' + drawId + '"]'); await frame();
  check('switching tabs shows the right drawing', (await dstate()).id === drawId && (await pixel(200, 220)) === 'rgb(255, 255, 255)');
  await p.click('.tab >> nth=0');
  check('text sheet unaffected', await p.isVisible(activeArea) && !(await p.isVisible(D)));
  await p.click('.tab >> nth=' + textTabs); await frame();
  await menuPick('#mDelete');
  check('delete names the drawing', (await p.textContent('#dialog p')).includes('✎ Drawing 1'));
  await p.click('#confirmDelete'); await frame();
  check('deleting a drawing removes its tab and ink', !(await tabs()).includes('✎ Drawing 2') && (await tabs()).includes('✎ Drawing 1') && (await idbCount(drawId)) === 0, await tabs());
  check('other drawing keeps its ink', (await idbCount(draw2)) === 1);
  await menuPick('#mDelete'); await p.click('#confirmDelete');
  check('back to text sheets only', !(await tabs()).some(t => t.startsWith('✎')) && (await idbCount(draw2)) === 0, await tabs());
  await p.click('.tab >> nth=0');

  console.log('Install + offline');
  await p.evaluate(() => navigator.serviceWorker.ready);
  await p.reload(); await p.waitForSelector(activeArea);
  const c2 = await ctx.newCDPSession(p);
  const man = await c2.send('Page.getAppManifest');
  const inst = await c2.send('Page.getInstallabilityErrors');
  check('manifest parses with no errors', man.errors.length === 0, man.errors);
  check('installable (no installability errors)', inst.installabilityErrors.length === 0, inst.installabilityErrors);
  check('service worker controls the page', await p.evaluate(() => !!navigator.serviceWorker.controller));
  await p.click(activeArea); await p.keyboard.type('offline test');
  await ctx.setOffline(true);
  await p.reload(); await p.waitForSelector(activeArea);
  check('app loads offline with notes', (await p.inputValue(activeArea)) === 'offline test');
  await ctx.setOffline(false);

  check('no page errors', errors.length === 0, errors);

  await ctx.close(); srv.kill();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
