// Browser smoke test of the extension in local mode (Plan 12), against a running local
// installation (tools/docker-smoke/smoke.mjs --keep leaves one on 127.0.0.1:47899).
//   npm i --no-save playwright-core
//   npm run ext:build
//   node tools/ext-smoke/run-local.mjs [ruta-del-navegador] [http://127.0.0.1:47899]
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.CHAMBAPP_ROOT ?? resolve(here, '../..');
const browserPath =
  process.argv[2] ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const LOCAL = process.argv[3] ?? 'http://127.0.0.1:47899';
const LOCAL_USER = '00000000-0000-4000-8000-000000000001';
const shots = mkdtempSync(join(tmpdir(), 'chambapp-ext-local-'));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// Same as run.mjs: 127.0.0.1 (any port) is granted up front, so the options page's
// permission request resolves without a browser prompt.
const extension = mkdtempSync(join(tmpdir(), 'chambapp-ext-'));
cpSync(join(root, 'extension/dist'), extension, { recursive: true });
const manifest = JSON.parse(readFileSync(join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('http://127.0.0.1/*');
writeFileSync(join(extension, 'manifest.json'), JSON.stringify(manifest, null, 2));

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
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
worker.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
const extensionId = new URL(worker.url()).host;
const state = (page) =>
  page.evaluate(() =>
    chrome.runtime
      .sendMessage({ channel: 'page', request: { type: 'state' } })
      .then((response) => response.data),
  );

try {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/index.html`);
  await options.waitForSelector('input[name="backend"]');
  check('opciones: modo nube por defecto', (await state(options)).settings.backend === 'nube');

  await options.check('input[name="backend"] >> nth=1');
  await options.fill('#local-origin', LOCAL);
  await options.click('form:has(#local-origin) button[type="submit"]');
  await options.waitForSelector('.form-ok, [role="alert"]', { timeout: 15_000 });
  const saved = (await options.textContent('.form-ok').catch(() => '')) ?? '';
  check(
    'opciones: conectada con Chambapp local',
    saved.includes('Conectada con Chambapp local'),
    saved,
  );
  await options.screenshot({ path: join(shots, 'opciones-local.png'), fullPage: true });

  const local = await state(options);
  check(
    'estado: usuario local sin inicio de sesión',
    local.user?.id === LOCAL_USER && local.localProblem === null,
    JSON.stringify({ user: local.user, problem: local.localProblem, vault: local.vault }),
  );

  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 580 });
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
  await popup.waitForSelector('.popup__tabs', { timeout: 10_000 });
  const account = (await popup.textContent('.popup__account')) ?? '';
  check('popup: pestañas sin pantalla de acceso', account.startsWith('Local ·'), account);
  await popup.screenshot({ path: join(shots, 'popup-local.png') });
  await popup.close();

  // The app of the local installation recognises the extension (bridge registered for that origin).
  const app = await context.newPage();
  await app.goto(`${LOCAL}/resumen`);
  // The bridge lives in the content script's isolated world: check its effect, the status chip.
  const connected = await app
    .waitForSelector('.ext-status--on', { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  const chipText = (await app.textContent('.ext-status').catch(() => '')) ?? '';
  check('app local: la extensión aparece conectada', connected, chipText.trim());
  await app.screenshot({ path: join(shots, 'app-local.png') });
  await app.close();

  // "Fichaje": Hera is served by a fake page (Playwright routing); entry, exit, repeat.
  let heraText = '';
  await context.route('https://netkia.heraempleados.es/**', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><meta charset="utf-8"><title>Hera</title><span id="ultima_accion_flexible">${heraText}</span>`,
    }),
  );
  // Recent times (Madrid), after any attendance already in the test installation.
  const madrid = (minutesAgo) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(new Date(Date.now() - minutesAgo * 60_000))
        .map((part) => [part.type, part.value]),
    );
    return {
      text: `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`,
      hm: `${parts.hour}:${parts.minute}`,
    };
  };
  const inAt = madrid(4);
  const outAt = madrid(2);
  const afterAt = madrid(1);
  // An open Hera tab (routed to the fake page) is what the extension reads first.
  const heraPage = await context.newPage();
  const hera = async (text) => {
    heraText = text;
    await heraPage.goto('https://netkia.heraempleados.es/');
    return options.evaluate(() =>
      chrome.runtime.sendMessage({ channel: 'page', request: { type: 'hera-sync' } }),
    );
  };
  const entry = await hera(`Última acción: ENTRADA ${inAt.text}`);
  check(
    'fichaje: entrada de Hera registrada',
    entry.ok && entry.data.outcome === 'created',
    JSON.stringify(entry),
  );
  const exit = await hera(`Última acción: SALIDA ${outAt.text}`);
  check(
    'fichaje: salida de Hera cierra la entrada',
    exit.ok && exit.data.outcome === 'closed',
    JSON.stringify(exit),
  );
  const again = await hera(`Última acción: SALIDA ${outAt.text}`);
  check(
    'fichaje: repetir no duplica',
    again.ok && again.data.outcome === 'already',
    JSON.stringify(again),
  );
  const orphan = await hera(`Última acción: SALIDA ${afterAt.text}`);
  check(
    'fichaje: salida sin entrada abierta se explica',
    !orphan.ok && /entrada abierta/.test(orphan.error),
    orphan.error,
  );
  const stored = await fetch(
    `${LOCAL}/rest/v1/fichajes?select=inicio_en,fin_en&eliminado_en=is.null&order=inicio_en.desc&limit=1`,
  ).then((r) => r.json());
  const last = stored[0];
  const minutes = last?.fin_en
    ? (Date.parse(last.fin_en) - Date.parse(last.inicio_en)) / 60_000
    : null;
  check('fichaje: guardado en la base local (2 min)', minutes === 2, JSON.stringify(last));
  const heraTabs = (await context.pages()).filter((page) => page.url().includes('heraempleados'));
  check('fichaje: no abre pestañas de más', heraTabs.length === 1, String(heraTabs.length));
  await heraPage.close();

  // An unreachable address: no login screen, a clear error.
  await options.fill('#local-origin', 'http://127.0.0.1:47898');
  await options.click('form:has(#local-origin) button[type="submit"]');
  await options.waitForSelector('[role="alert"], .form-error, .error', { timeout: 15_000 });
  const down = await state(options);
  check(
    'dirección sin servidor: error claro y sin usuario',
    down.user === null && /No se puede conectar con Chambapp local/.test(down.localProblem ?? ''),
    down.localProblem ?? '',
  );

  await options.check('input[name="backend"] >> nth=0');
  await options.click('form:has(input[name="backend"]) button[type="submit"]');
  await options.waitForSelector('.form-ok', { timeout: 15_000 });
  const cloud = await state(options);
  check(
    'vuelta a la nube: sin sesión local',
    cloud.settings.backend === 'nube' && cloud.user === null,
    JSON.stringify(cloud.user),
  );
  check('sin errores en el service worker', errors.length === 0, errors.join(' | '));
} finally {
  await context.close();
}
console.log(`\nCapturas: ${shots}`);
console.log(`${results.filter((r) => r.ok).length}/${results.length} comprobaciones correctas`);
process.exitCode = results.every((r) => r.ok) ? 0 : 1;
