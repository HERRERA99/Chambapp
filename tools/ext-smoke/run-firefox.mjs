// Browser smoke test of the Firefox build in real Firefox (Selenium/Marionette).
// Firefox hides extension pages from WebDriver BiDi, so the test opens them from the
// browser's privileged context, which needs MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1.
//   npm i --no-save selenium-webdriver
//   npm run ext:build
//   npx vite tools/ui-smoke --config tools/ui-smoke/vite.config.ts   (another terminal)
//   MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1 node tools/ext-smoke/run-firefox.mjs [ruta-de-firefox.exe]
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// CHAMBAPP_ROOT lets a copy of this script run from a folder where selenium-webdriver is installed.
const root = process.env.CHAMBAPP_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const { listFiles, zipFiles } = await import(
  pathToFileURL(join(root, 'extension/scripts/zip.mjs')).href
);
const out = mkdtempSync(join(tmpdir(), 'chambapp-ff-shots-'));
const ID = 'extension@chambapp-tracker.vercel.app';
const UUID = '6b1f2c3d-0000-4000-8000-00000000c4a3';
const BASE = `moz-extension://${UUID}`;
const ORIGIN = 'http://127.0.0.1:5180';
const TASK = `${ORIGIN}/odoo/project/1/tasks/9`;
const SMOKE = 'http://127.0.0.1:5174';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fakeOdoo = readFileSync(join(root, 'tools/ext-smoke/odoo-task.html'));
const server = createServer((request, response) => {
  const url = new URL(request.url, ORIGIN);
  response.setHeader('content-type', 'text/html; charset=utf-8');
  if (url.pathname.startsWith('/odoo/')) return response.end(fakeOdoo);
  if (url.pathname === '/login')
    return response.end('<!doctype html><form><input type="email"><input type="password"></form>');
  response.statusCode = 404;
  response.end();
});
await new Promise((ready) => server.listen(5180, '127.0.0.1', ready));

// Test copy: fake Odoo and ui-smoke allowed like the real origins.
const ext = mkdtempSync(join(tmpdir(), 'chambapp-ff-'));
cpSync(join(root, 'extension/dist-firefox'), ext, { recursive: true });
const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
// http://127.0.0.1/* (no port, as Firefox needs) already covers the fake Odoo and ui-smoke.
writeFileSync(join(ext, 'manifest.json'), JSON.stringify(manifest));
const worker = readFileSync(join(ext, 'background.js'), 'utf8');
writeFileSync(join(ext, 'background.js'), worker.replaceAll('http://127.0.0.1:5173', SMOKE));
const xpi = join(mkdtempSync(join(tmpdir(), 'chambapp-xpi-')), 'test.xpi');
writeFileSync(xpi, zipFiles(listFiles(ext), ext));

const options = new firefox.Options()
  .setBinary(process.argv[2] ?? 'C:/Program Files/Mozilla Firefox/firefox.exe')
  .setPreference('extensions.webextensions.uuids', JSON.stringify({ [ID]: UUID }));
const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).build();
await driver.manage().window().setRect({ width: 1280, height: 860 });

async function openExtensionPage(path) {
  const before = await driver.getAllWindowHandles();
  await driver.setContext('chrome');
  await driver.executeScript(
    `const win = Services.wm.getMostRecentWindow('navigator:browser');
     win.gBrowser.selectedTab = win.gBrowser.addTab(arguments[0], {
       triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`,
    `${BASE}${path}`,
  );
  await driver.setContext('content');
  let handle;
  for (let i = 0; i < 30 && !handle; i += 1) {
    handle = (await driver.getAllWindowHandles()).find((h) => !before.includes(h));
    if (!handle) await sleep(200);
  }
  await driver.switchTo().window(handle);
  await sleep(800);
  return handle;
}
async function openPage(url) {
  await driver.switchTo().newWindow('tab');
  await driver.get(url);
  return driver.getWindowHandle();
}
const run = (code, ...args) =>
  driver
    .executeAsyncScript(
      `const done = arguments[arguments.length - 1];
     (async () => { ${code} })().then((value) => done(JSON.stringify(value ?? null)), (error) => done(JSON.stringify({ error: String(error) })));`,
      ...args,
    )
    .then((text) => JSON.parse(text));
const shot = async (name) =>
  writeFileSync(join(out, name), await driver.takeScreenshot(), 'base64');

try {
  const id = await driver.installAddon(xpi, true);
  check('instalada en Firefox 159 (temporal)', id === ID, id);

  // Options page: state, permissions, Odoo origin.
  const optionsTab = await openExtensionPage('/options/index.html');
  const state = await run(
    `return chrome.runtime.sendMessage({ channel: 'page', request: { type: 'state' } });`,
  );
  check('la página de fondo responde', state?.ok === true, JSON.stringify(state).slice(0, 120));
  const granted = await run(
    `return chrome.permissions.contains({ origins: ['http://127.0.0.1/*'] });`,
    ORIGIN,
  );
  const supabase = await run(
    `const hosts = chrome.runtime.getManifest().host_permissions; return chrome.permissions.contains({ origins: hosts });`,
  );
  check(
    'permisos de host concedidos al instalar (Chambapp, Supabase)',
    supabase === true && granted === true,
    `fake ${granted} · manifest ${supabase}`,
  );
  await driver.findElement(By.id('odoo')).sendKeys(ORIGIN);
  await driver.findElement(By.css('form:has(#odoo) button[type="submit"]')).click();
  const notice = await driver.wait(until.elementLocated(By.css('.form-ok, .form-error')), 15_000);
  const saved = await notice.getText();
  check('ajustes: Odoo configurado', saved.includes(ORIGIN), saved);
  await shot('ff-options.png');

  // Popup page.
  await openExtensionPage('/popup/index.html');
  await driver.manage().window().setRect({ width: 420, height: 700 });
  await sleep(1500);
  const title = await driver.findElement(By.css('h1')).getText();
  const providers = (await driver.findElements(By.css('.provider-grid button'))).length;
  check(
    'popup: acceso y proveedores',
    title === 'Conecta tu cuenta' && providers > 0,
    `${title} · ${providers}`,
  );
  await shot('ff-popup.png');
  await driver.manage().window().setRect({ width: 1280, height: 860 });

  // Detection (dynamic content script) and badge.
  await openPage(`${TASK}?run=ff-detect-${Date.now()}`);
  await sleep(2500);
  await driver.switchTo().window(optionsTab);
  const detection = await run(
    `const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/odoo/*' });
     const key = 'chambapp_detected_v1:' + tab.id;
     return { badge: await chrome.action.getBadgeText({ tabId: tab.id }), detected: (await chrome.storage.session.get(key))[key] ?? null };`,
    ORIGIN,
  );
  check(
    'detección de la tarea e insignia «+»',
    detection.badge === '+' &&
      detection.detected?.title === 'Migrar datos' &&
      detection.detected?.recordId === 9 &&
      detection.detected?.code === 'T9',
    JSON.stringify(detection),
  );
  const counted = await run(
    `const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/odoo/*' });
     await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content/odoo-timesheet.js'] });
     const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id },
       func: () => globalThis.__chambappOdoo.count(9, '2026-11-02', 'dmy', 'x', '01:00') });
     return result.result;`,
    ORIGIN,
  );
  check('scripting: recuento en la pestaña de Odoo', counted === 0, JSON.stringify(counted));

  // Autofill.
  const loginTab = await openPage(`${ORIGIN}/login`);
  await driver.switchTo().window(optionsTab);
  const fill = await run(
    `const [tab] = await chrome.tabs.query({ url: 'http://127.0.0.1/login' });
     await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['/content/autofill-page.js'] });
     const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id },
       func: () => globalThis.__chambappFill('ana@empresa.com', 'secreto-123') });
     return result.result;`,
    ORIGIN,
  );
  await driver.switchTo().window(loginTab);
  const values = await driver.executeScript(
    `return [...document.querySelectorAll('input')].map((i) => i.value);`,
  );
  check(
    'autocompletar',
    fill?.username &&
      fill?.password &&
      values[0] === 'ana@empresa.com' &&
      values[1] === 'secreto-123',
    JSON.stringify({ fill, values }),
  );

  // Odoo automation in Firefox's engine (page harness, as in the Chrome test).
  const script = readFileSync(join(ext, 'content/odoo-timesheet.js'), 'utf8');
  const harness = `
    window.__harness = { messages: [], done: null };
    window.chrome = window.chrome || {};
    window.chrome.runtime = { connect() {
      const listeners = [];
      return {
        postMessage(message) {
          __harness.messages.push(message.type);
          if (message.type === 'about-to-write')
            setTimeout(() => listeners.forEach((l) => l({ type: 'write-ack', attemptId: message.attemptId })), 50);
          if (message.type === 'form-saved' || message.type === 'failed') __harness.done = message;
        },
        onMessage: { addListener: (l) => listeners.push(l) },
        onDisconnect: { addListener() {} },
        disconnect() {},
      };
    } };`;
  const inject = (code) =>
    driver.executeScript(
      `const s = document.createElement('script'); s.textContent = arguments[0]; document.head.append(s);`,
      code,
    );
  const config = {
    attemptId: 'a1',
    recordId: 9,
    origin: ORIGIN,
    fecha: '2026-11-02',
    dateFormat: 'dmy',
    descripcion: 'Revisión del módulo',
    horasFormato: '01:15',
  };
  for (const mode of ['normal', 'paginated', 'rejected']) {
    await openPage(`${TASK}?run=ff-${mode}-${Date.now()}&mode=${mode}`);
    await inject(harness);
    await inject(script);
    await driver.executeScript(
      `globalThis.__chambappOdoo.start({ ...arguments[0], deadline: Date.now() + 60000 });`,
      config,
    );
    let done = null;
    for (let i = 0; i < 300 && !done; i += 1) {
      done = await driver.executeScript('return window.__harness.done;');
      if (!done) await sleep(200);
    }
    let after = null;
    if (done?.type === 'form-saved') {
      await driver.navigate().refresh();
      await sleep(500);
      await inject(script);
      after = await driver.executeAsyncScript(
        `const done = arguments[arguments.length - 1]; const c = arguments[0];
         globalThis.__chambappOdoo.count(c.recordId, c.fecha, c.dateFormat, c.descripcion, c.horasFormato).then(done);`,
        config,
      );
    }
    const ok =
      mode === 'rejected' ? done?.type === 'failed' : done?.type === 'form-saved' && after === 1;
    check(
      `automatización Odoo (${mode})`,
      ok,
      `${done?.type}${after !== null ? ` · después ${after}` : ''}${done?.error ? ` · ${done.error}` : ''}`,
    );
  }

  // Bridge with the web app: header chip turns green; Firefox tutorial.
  await openPage(`${SMOKE}/parte-semanal`);
  await driver.wait(until.elementLocated(By.css('.ext-status--on')), 15_000).catch(() => undefined);
  const chip = await driver.findElement(By.css('.ext-status'));
  check(
    'web: indicador verde con la extensión de Firefox',
    (await chip.getAttribute('class')).includes('ext-status--on'),
    await chip.getAttribute('title'),
  );
  await shot('ff-web-header.png');
  await chip.click();
  await driver.wait(until.elementLocated(By.css('.ext-tutorial')), 5000);
  await sleep(800);
  const chosen = await driver
    .findElement(By.css('.ext-browser button[aria-pressed="true"]'))
    .getText();
  const steps = await driver.executeScript(
    `return [...document.querySelectorAll('.ext-steps__label')].map((n) => n.textContent);`,
  );
  check(
    'tutorial: Firefox detectado con sus pasos',
    chosen === 'Mozilla Firefox' && steps.length === 5,
    `${chosen} · ${steps.join(', ')}`,
  );
  await shot('ff-tutorial-1.png');
  await driver.findElement(By.css('.ext-tutorial__footer .button--primary')).click();
  await sleep(500);
  await shot('ff-tutorial-2.png');
} finally {
  await driver.quit();
  server.close();
}
console.log(`Capturas: ${out}`);
console.log(`${results.filter(Boolean).length}/${results.length} correctas`);
process.exit(results.every(Boolean) ? 0 : 1);
