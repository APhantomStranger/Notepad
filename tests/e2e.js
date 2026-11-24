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
  check('menu shows version 2.0.0', (await p.textContent('#menu .ver')).trim() === 'Notes v2.0.0');
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
