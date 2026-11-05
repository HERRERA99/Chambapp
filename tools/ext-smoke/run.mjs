// Browser smoke test of the extension against a fake Odoo (tools/ext-smoke/odoo-task.html).
// Needs playwright-core (not a project dependency) and a Chromium browser that still
// accepts --load-extension (Microsoft Edge does):
//   npm i --no-save playwright-core
//   npm run ext:build
//   node tools/ext-smoke/run.mjs [ruta-del-navegador]
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
// CHAMBAPP_ROOT lets a copy of this script run from a folder where playwright-core is installed.
const root = process.env.CHAMBAPP_ROOT ?? resolve(here, '../..');
const browserPath =
  process.argv[2] ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 5180;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const TASK = `${ORIGIN}/odoo/project/1/tasks/9`;
const shots = mkdtempSync(join(tmpdir(), 'chambapp-ext-shots-'));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---------------------------------------------------------------- fake Odoo server
const fakeOdoo = readFileSync(join(root, 'tools/ext-smoke/odoo-task.html'));
const login = `<!doctype html><form><input type="email" autocomplete="username"><input type="password"><button>Entrar</button></form>`;
const server = createServer((request, response) => {
  const url = new URL(request.url, ORIGIN);
  response.setHeader('content-type', 'text/html; charset=utf-8');
  if (url.pathname.startsWith('/odoo/')) return response.end(fakeOdoo);
  if (url.pathname === '/login') return response.end(login);
  response.statusCode = 404;
  response.end('no');
});
await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));

// ---------------------------------------------------------------- extension copy for the test
// Same build; the fake Odoo origin is added as a host permission so no prompt is needed.
const extension = mkdtempSync(join(tmpdir(), 'chambapp-ext-'));
cpSync(join(root, 'extension/dist'), extension, { recursive: true });
const manifest = JSON.parse(readFileSync(join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('http://127.0.0.1/*');
writeFileSync(join(extension, 'manifest.json'), JSON.stringify(manifest, null, 2));
const timesheetScript = readFileSync(join(extension, 'content/odoo-timesheet.js'), 'utf8');
const exampleScript = readFileSync(join(root, 'Extension_App/manifest.json'), 'utf8'); // misnamed content script

const context = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), 'chambapp-profile-')),
  {
    executablePath: browserPath,
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  },
);
const errors = [];
let worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
worker.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
const extensionId = new URL(worker.url()).host;
check('service worker cargado', !!extensionId, extensionId);

// ---------------------------------------------------------------- 1. page-world harness
// Runs the built content script in the page with a fake port that plays the worker's role.
const harness = `
  window.__harness = { messages: [], ack: true, done: null };
  window.chrome = window.chrome || {};
  window.chrome.runtime = { connect() {
    const listeners = [];
    return {
      postMessage(message) {
        __harness.messages.push(message.type === 'counted' ? 'counted:' + message.count : message.type);
        if (message.type === 'about-to-write' && __harness.ack)
          setTimeout(() => listeners.forEach((listener) => listener({ type: 'write-ack', attemptId: message.attemptId })), 50);
        if (message.type === 'form-saved' || message.type === 'failed') __harness.done = message;
      },
      onMessage: { addListener: (listener) => listeners.push(listener) },
      onDisconnect: { addListener() {} },
      disconnect() {},
    };
  } };`;

async function attempt(mode, { ack = true, run = `${mode}-${Date.now()}` } = {}) {
  const page = await context.newPage();
  await page.addInitScript(harness);
  await page.goto(`${TASK}?run=${run}&mode=${mode}`);
  await page.evaluate((value) => (window.__harness.ack = value), ack);
  await page.addScriptTag({ content: timesheetScript });
  const config = {
    attemptId: 'a1',
    deadline: Date.now() + 60_000,
    origin: ORIGIN,
    recordId: 9,
    fecha: '2026-11-02',
    dateFormat: 'dmy',
    descripcion: 'Revisión del módulo',
    horasFormato: '01:15',
  };
  await page.evaluate((value) => globalThis.__chambappOdoo.start(value), config);
  await page.waitForFunction(() => window.__harness.done, null, { timeout: 70_000 });
  const outcome = await page.evaluate(() => ({ ...window.__harness, log: window.__fakeOdooLog }));
  let after = null;
  let swapped = null;
  if (outcome.done.type === 'form-saved') {
    await page.reload();
    await page.addScriptTag({ content: timesheetScript });
    after = await page.evaluate(
      ({ recordId, fecha, dateFormat, descripcion, horasFormato }) =>
        globalThis.__chambappOdoo.count(recordId, fecha, dateFormat, descripcion, horasFormato),
      config,
    );
    // The same line read with day and month swapped must not count (02/11 vs 11/02).
    swapped = await page.evaluate(
      ({ recordId, fecha, descripcion, horasFormato }) =>
        globalThis.__chambappOdoo.count(recordId, fecha, 'mdy', descripcion, horasFormato),
      config,
    );
  }
  await page.screenshot({ path: join(shots, `odoo-${mode}${ack ? '' : '-noack'}.png`) });
  await page.close();
  const before = Number(
    outcome.messages.find((item) => item.startsWith('counted:'))?.split(':')[1],
  );
  return { ...outcome, before, after, swapped };
}

const normal = await attempt('normal');
check(
  'normal: guarda y verifica exactamente una línea nueva',
  normal.done.type === 'form-saved' && normal.after === normal.before + 1,
  `${normal.messages.join(' → ')} · antes ${normal.before}, después ${normal.after}`,
);
check('fecha con día y mes cambiados no cuenta', normal.swapped === 0, String(normal.swapped));
check(
  'normal: la frontera de escritura se pide antes del primer guardado',
  normal.messages.indexOf('about-to-write') < normal.messages.indexOf('form-saved') &&
    normal.log.indexOf('line-save') > -1,
);
const slow = await attempt('slow');
check(
  'lento (3 s con aspecto estable): no hay éxito antes de tiempo',
  slow.done.type === 'form-saved' && slow.after === slow.before + 1,
  `${slow.messages.join(' → ')}`,
);
const rejected = await attempt('rejected');
check(
  'rechazado (notificación de error con «guardado»): falla, no da éxito',
  rejected.done.type === 'failed',
  rejected.done.error,
);
const invalid = await attempt('invalid');
check('campo inválido: falla', invalid.done.type === 'failed', invalid.done.error);
const noAck = await attempt('normal', { ack: false });
check(
  'sin confirmación del worker: no pulsa guardar',
  noAck.done.type === 'failed' && !noAck.log.includes('line-save'),
  noAck.done.error,
);
{
  // An attempt for another task (id 10) must not start on task 9.
  const page = await context.newPage();
  await page.addInitScript(harness);
  await page.goto(`${TASK}?run=other-${Date.now()}`);
  await page.addScriptTag({ content: timesheetScript });
  const started = await page.evaluate(
    (origin) =>
      globalThis.__chambappOdoo.start({
        attemptId: 'a2',
        deadline: Date.now() + 60_000,
        origin,
        recordId: 10,
        fecha: '2026-11-02',
        dateFormat: 'dmy',
        descripcion: 'x',
        horasFormato: '01:00',
      }),
    ORIGIN,
  );
  const counted = await page.evaluate(() =>
    globalThis.__chambappOdoo.count(10, '2026-11-02', 'dmy', 'x', '01:00'),
  );
  await page.close();
  check('otra tarea: no empieza ni cuenta', started === false && counted === null);
}
const paginated = await attempt('paginated');
check(
  'paginado (45 antiguas, la nueva en la página 2): verificada',
  paginated.done.type === 'form-saved' && paginated.after === paginated.before + 1,
  `antes ${paginated.before}, después ${paginated.after}`,
);

// ---------------------------------------------------------------- 2. parity with Extension_App
{
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.chrome = window.chrome || {};
    window.chrome.runtime = {
      sendMessage() {},
      onMessage: { addListener() {} },
      lastError: undefined,
    };
  });
  await page.goto(`${TASK}?run=example-${Date.now()}&mode=normal`);
  await page.addScriptTag({ content: exampleScript });
  const example = await page.evaluate(async () => {
    try {
      await procesarParteOdoo({
        fecha: '2026-11-02',
        descripcion: 'Revisión del módulo',
        horasFormato: '01:15',
        url: location.href,
      });
      return { ok: true, log: window.__fakeOdooLog };
    } catch (error) {
      return { ok: false, error: String(error), log: window.__fakeOdooLog };
    }
  });
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('.o_data_row')].map((row) => row.textContent),
  );
  await page.close();
  const ours = normal.log.filter((step) => !step.startsWith('tab:Desc') && step !== 'pager-next');
  check(
    'mismos clics que el ejemplo en modo normal',
    example.ok && JSON.stringify(example.log) === JSON.stringify(ours),
    `ejemplo ${example.log.join(',')} · nuevo ${ours.join(',')}`,
  );
  check(
    'mismos valores guardados que el ejemplo',
    rows.some(
      (text) =>
        text.includes('02/11/2026') &&
        text.includes('Revisión del módulo') &&
        text.includes('01:15'),
    ),
  );
}

// ---------------------------------------------------------------- 3. real extension
{
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/index.html`);
  await options.fill('#odoo', ORIGIN);
  await options.click('button[type="submit"]');
  await options.waitForSelector('.form-ok', { timeout: 10_000 });
  check('ajustes: Odoo configurado', (await options.textContent('.form-ok')).includes(ORIGIN));
  await options.screenshot({ path: join(shots, 'options.png'), fullPage: true });

  const odoo = await context.newPage();
  await odoo.goto(`${TASK}?run=detect-${Date.now()}`);
  await odoo.waitForTimeout(1500);
  const detection = await worker.evaluate(async (origin) => {
    const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
    const badge = await chrome.action.getBadgeText({ tabId: tab.id });
    const key = `chambapp_detected_v1:${tab.id}`;
    const detected = (await chrome.storage.session.get(key))[key];
    return { badge, detected: detected ?? null };
  }, ORIGIN);
  check(
    'detección de la tarea: insignia «+» y datos leídos',
    detection.badge === '+' &&
      detection.detected?.title === 'Migrar datos' &&
      detection.detected?.projectName === 'Formación' &&
      detection.detected?.code === 'T9' &&
      detection.detected?.recordId === 9,
    JSON.stringify(detection),
  );
  const counted = await worker.evaluate(async (origin) => {
    const [tab] = await chrome.tabs.query({ url: `${origin}/*` });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/odoo-timesheet.js'],
    });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => globalThis.__chambappOdoo.count(9, '2026-11-02', 'dmy', 'x', '01:00'),
    });
    return result.result;
  }, ORIGIN);
  check('recuento desde la extensión (mundo aislado)', counted === 0, String(counted));
  await odoo.close();

  const loginPage = await context.newPage();
  await loginPage.goto(`${ORIGIN}/login`);
  const fill = await worker.evaluate(async (origin) => {
    const [tab] = await chrome.tabs.query({ url: `${origin}/login` });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/autofill-page.js'],
    });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => globalThis.__chambappFill('ana@empresa.com', 'secreto-123'),
    });
    return result.result;
  }, ORIGIN);
  const values = await loginPage.evaluate(() =>
    [...document.querySelectorAll('input')].map((input) => input.value),
  );
  check(
    'autocompletar rellena usuario y contraseña',
    fill.username &&
      fill.password &&
      values[0] === 'ana@empresa.com' &&
      values[1] === 'secreto-123',
    JSON.stringify({ fill, values }),
  );
  await loginPage.close();

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 580 });
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
  await popup.waitForSelector('h1', { timeout: 10_000 });
  check(
    'popup sin sesión: pantalla de acceso',
    (await popup.textContent('h1')) === 'Conecta tu cuenta',
  );
  await popup.screenshot({ path: join(shots, 'popup-login.png') });
  await popup.close();
}

check('sin errores en el service worker', errors.length === 0, errors.join(' | '));
await context.close();
server.close();
console.log(`\nCapturas: ${shots}`);
const failed = results.filter((item) => !item.ok).length;
console.log(`${results.length - failed}/${results.length} comprobaciones correctas`);
process.exit(failed ? 1 : 0);
