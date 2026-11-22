// End-to-end test of "Recuperar fichajes de la semana" and the Hera change requests,
// with the real extension, a running local installation and a fake Hera (Playwright
// routing). Headless: no window opens.
//   npm i --no-save playwright-core
//   node tools/docker-smoke/smoke.mjs --build --keep     (local installation on :47899)
//   node extension/build.mjs --allow-local-only
//   node tools/ext-smoke/run-hera-week.mjs [ruta-del-navegador] [http://127.0.0.1:47899]
// It writes attendance in that test installation only (never in Hera).
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';

const here = dirname(fileURLToPath(import.meta.url));
const root = process.env.CHAMBAPP_ROOT ?? resolve(here, '../..');
const browserPath =
  process.argv[2] ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const LOCAL = process.argv[3] ?? 'http://127.0.0.1:47899';
const HERA = 'https://netkia.heraempleados.es';
const ZONE = 'Europe/Madrid';
const shots = mkdtempSync(join(tmpdir(), 'chambapp-hera-week-'));
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ------------------------------------------------------------------ the week
// Same rule as heraWeekDates: Monday → yesterday; the previous week on Mondays.
const today = DateTime.now().setZone(ZONE).startOf('day');
const count = today.weekday === 1 ? 7 : today.weekday - 1;
const dates = Array.from({ length: count }, (_, i) => today.minus({ days: count - i }).toISODate());
if (dates.length < 5) {
  console.log(
    `La semana recuperable tiene ${dates.length} días; ejecuta la prueba de sábado a lunes.`,
  );
  process.exit(2);
}
const [mon, tue, wed, thu, fri, sat] = dates;
const iso = (date, time) => DateTime.fromISO(`${date}T${time}`, { zone: ZONE }).toUTC().toISO();
const e = (time) => ['e', time];
const s = (time) => ['s', time];
/** Accesses shown by the fake Hera per date; pending = acc_sol_existente blocks. */
const heraDays = {
  [mon]: { accesses: [e('10:14'), s('16:23')] },
  [tue]: { accesses: [e('08:17'), s('14:20'), e('16:01'), s('18:17')] },
  [wed]: { accesses: [e('08:17'), s('14:55'), e('15:52'), s('17:43')] },
  [thu]: { accesses: [e('08:16'), s('14:56')], pending: 1 },
  [fri]: { accesses: [] },
  ...(sat ? { [sat]: { accesses: [e('09:00')] } } : {}),
};

function dayHtml(date) {
  const day = heraDays[date];
  if (!day) return '<p>No hay ningún fichaje realizado en este día.</p>';
  const blocks = day.accesses.map(
    ([kind, time], i) => `
      <div class="col-md-6 acc_existente d-flex-wrap" data-id="${1000 + i}">
        <label>Acceso ${i + 1}:</label>
        <select class="slc form-control selector_tipo" name="selector_ex_${1000 + i}">
          <option value="e"${kind === 'e' ? ' selected' : ''}>Entrada</option>
          <option value="s"${kind === 's' ? ' selected' : ''}>Salida</option>
        </select>
        <input class="form-control horas_edit" name="horas_edit_ex_${1000 + i}" value="${time}">
      </div>`,
  );
  const pending = Array.from(
    { length: day.pending ?? 0 },
    () => '<div class="col-md-6 acc_sol_existente">Solicitud pendiente</div>',
  );
  const empty = day.accesses.length ? '' : '<p>No hay ningún fichaje realizado en este día.</p>';
  return `<input type="hidden" name="fecha_acceso">${empty}${blocks.join('')}${pending.join('')}`;
}

// 12 requests (more than the 10 rows DataTables shows): granted, pending, denied.
const requestRows = [
  ...Array.from({ length: 9 }, (_, i) => [
    `2026-0${(i % 8) + 1}-1${i}`,
    'S: 15:57',
    '[ Actualizar ] S: 14:20',
    `Olvido ${i}`,
    'label-new label-new-success',
    'Solicitud Concedida',
  ]),
  [
    tue,
    'S: 15:57',
    '[ Actualizar ] S: 14:20',
    'Olvido de fichaje',
    'label-new label-new-success',
    'Solicitud Concedida',
  ],
  [
    thu,
    '-',
    '[ Añadir ] S: 17:30',
    'Se me olvidó fichar',
    'label-new label-new-warning',
    'Solicitud Pendiente',
  ],
  [
    fri,
    'E: 09:00',
    '[ Actualizar ] E: 08:00',
    'Llegué antes',
    'label-new label-new-danger',
    'Solicitud Denegada',
  ],
];
const pageHtml = `<!doctype html><meta charset="utf-8"><title>Hera</title>
  <input type="hidden" id="info_mis_fichajes" name="info" value="aW5mbw==">
  <input id="select_fecha_cambiar" class="form-control" data-nif="00000000T"
    data-ini="${today.minus({ days: 21 }).toISODate()}" data-fin="${today.toISODate()}">
  <div id="contenedor_dias"></div>
  <table class="table mostrar_datos_solicitudes"><thead><tr>
    <th>Fecha</th><th>Fichaje</th><th>Cambio Solicitado</th><th>Motivo</th><th>Estado</th></tr></thead>
  <tbody>${requestRows
    .map(
      ([date, original, change, reason, cls, status]) =>
        `<tr><td><div class="none">${date}</div>${date.split('-').reverse().join('/')}</td>
         <td>${original.replace(/^([ES]):/, '<strong>$1:</strong>')}</td>
         <td>${change.replace(/([ES]):/, '<strong>$1:</strong>')}</td><td>${reason}</td>
         <td><span class="${cls}">${status}</span></td></tr>`,
    )
    .join('')}</tbody></table>`;

// ------------------------------------------------------------------ Chambapp before
let generation = null;
const db = createClient(LOCAL, 'chambapp-local', {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (generation) headers.set('X-Chambapp-Generacion', generation);
      return fetch(input, { ...init, headers });
    },
  },
});
generation = (await db.rpc('chambapp_copia_estado', {})).data?.generacion ?? null;
async function op(action, data) {
  const { data: result, error } = await db.rpc('chambapp_operar', {
    p_accion: action,
    p_datos: data,
  });
  if (error) throw new Error(`${action}: ${error.message}`);
  return result;
}
async function weekRows(untilToday = true) {
  let query = db
    .from('fichajes')
    .select('id,version,inicio_en,fin_en')
    .is('eliminado_en', null)
    .gte('inicio_en', iso(mon, '00:00'));
  if (untilToday) query = query.lt('inicio_en', iso(today.toISODate(), '00:00'));
  const { data, error } = await query.order('inicio_en');
  if (error) throw new Error(error.message);
  return data;
}
const hm = (value) =>
  value ? DateTime.fromISO(value, { zone: ZONE }).toFormat('HH:mm') : 'abierto';
const describe = (rows) =>
  rows.map(
    (row) =>
      `${DateTime.fromISO(row.inicio_en, { zone: ZONE }).toISODate()} ${hm(row.inicio_en)}-${hm(row.fin_en)}`,
  );

// A test installation only: clear the attendance since Monday left by earlier runs
// (today's too: the Wednesday left open below must be the latest one).
for (const row of await weekRows(false))
  await op('eliminar_fichaje', { id: row.id, version: row.version });
// Monday identical plus an evening only in Chambapp, Tuesday morning with the old exit,
// Wednesday left open (an open attendance must be the latest one).
await op('crear_fichaje', {
  id: crypto.randomUUID(),
  inicio_en: iso(mon, '10:14'),
  fin_en: iso(mon, '16:23'),
});
await op('crear_fichaje', {
  id: crypto.randomUUID(),
  inicio_en: iso(tue, '08:17'),
  fin_en: iso(tue, '15:57'),
});
await op('crear_fichaje', {
  id: crypto.randomUUID(),
  inicio_en: iso(mon, '19:00'),
  fin_en: iso(mon, '20:00'),
});
await op('crear_fichaje', { id: crypto.randomUUID(), inicio_en: iso(wed, '08:17'), fin_en: null });

// ------------------------------------------------------------------ browser
const extension = mkdtempSync(join(tmpdir(), 'chambapp-ext-'));
cpSync(join(root, 'extension/dist'), extension, { recursive: true });
const manifest = JSON.parse(readFileSync(join(extension, 'manifest.json'), 'utf8'));
manifest.host_permissions.push('http://127.0.0.1/*');
writeFileSync(join(extension, 'manifest.json'), JSON.stringify(manifest, null, 2));
const context = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), 'chambapp-profile-')),
  {
    executablePath: browserPath,
    headless: true,
    viewport: { width: 1280, height: 900 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  },
);
const heraCalls = [];
await context.route(`${HERA}/**`, async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  heraCalls.push(`${request.method()} ${url.pathname}`);
  if (request.method() === 'GET' && url.pathname === '/rrhh/solicitar-fichajes')
    return route.fulfill({ contentType: 'text/html; charset=utf-8', body: pageHtml });
  if (
    request.method() === 'POST' &&
    url.pathname === '/gestion/cambiar-fichajes/ajax/modificar_mis_accesos.php'
  ) {
    const body = new URLSearchParams(request.postData() ?? '');
    const date = body.get('fecha').split('/').reverse().join('-');
    const okParams = body.get('nif') === '00000000T' && body.get('info') === 'aW5mbw==';
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ info: okParams ? dayHtml(date) : '<p>error</p>' }),
    });
  }
  return route.fulfill({ status: 404, body: 'no' });
});
const errors = [];
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
worker.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
const extensionId = new URL(worker.url()).host;
const ask = (page, request) =>
  page.evaluate((request) => chrome.runtime.sendMessage({ channel: 'page', request }), request);

try {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options/index.html`);
  await options.waitForSelector('input[name="backend"]');
  await options.check('input[name="backend"] >> nth=1');
  await options.fill('#local-origin', LOCAL);
  await options.click('form:has(#local-origin) button[type="submit"]');
  await options.waitForSelector('.form-ok', { timeout: 15_000 });

  // Playwright routing does not reach tabs the extension opens itself, so the fake Hera
  // page is opened here first and the extension reuses it (never the real Hera).
  const heraPage = await context.newPage();
  await heraPage.goto(`${HERA}/rrhh/solicitar-fichajes`);

  // An open Chambapp tab must refresh on its own when the extension writes.
  const watcher = await context.newPage();
  await watcher.goto(`${LOCAL}/fichajes?fecha=${thu}`);
  await watcher.waitForSelector('.ext-status--on', { timeout: 15_000 }).catch(() => null);
  const thursdayBefore = ((await watcher.textContent('main')) ?? '').includes('08:16:00');

  // ---- popup: one click reads Hera and applies the changes on its own
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 900 });
  await popup.goto(`chrome-extension://${extensionId}/popup/index.html`);
  await popup.waitForSelector('.popup__tabs', { timeout: 10_000 });
  await popup.click('.popup__tabs >> text=Fichaje');
  await popup.click('button:has-text("Recuperar fichajes de la semana")');
  const done = await popup
    .waitForSelector('text=/creados?|actualizados?|coincide con Hera/', { timeout: 45_000 })
    .then(() => true)
    .catch(() => false);
  const resultText = ((await popup.textContent('body')) ?? '').replace(/s+/g, ' ');
  await popup.screenshot({ path: join(shots, 'popup-recuperado.png'), fullPage: true });
  if (!done)
    throw new Error(
      `El popup no termina: ${resultText.slice(0, 600)} · Hera: ${heraCalls.join(', ')}`,
    );
  check(
    'popup: se aplica solo (sin botón Aplicar)',
    !(await popup.$('button:has-text("Aplicar")')),
  );
  check(
    'popup: resumen 3 creados y 2 actualizados',
    /3 creados, 2 actualizados/.test(resultText),
    resultText.slice(0, 300),
  );
  check(
    'popup: muestra avisos de día incompleto y de solo en Chambapp',
    /sin salida|incomplet/i.test(resultText) && /Solo en Chambapp/.test(resultText),
  );
  check(
    'Hera: solo la página (GET) y la consulta de accesos (POST)',
    heraCalls.every(
      (call) =>
        call === 'GET /rrhh/solicitar-fichajes' ||
        call === 'POST /gestion/cambiar-fichajes/ajax/modificar_mis_accesos.php',
    ),
    [...new Set(heraCalls)].join(', '),
  );
  const heraTabsOpen = context.pages().filter((page) => page.url().startsWith(HERA)).length;
  check(
    'Hera: reutiliza la pestaña abierta (no abre otra)',
    heraTabsOpen === 1,
    String(heraTabsOpen),
  );
  const refreshed = await watcher
    .waitForFunction(
      () => document.querySelector('main')?.textContent?.includes('08:16:00'),
      null,
      {
        timeout: 15_000,
      },
    )
    .then(() => true)
    .catch(() => false);
  check('app abierta: se actualiza sola con los fichajes nuevos', !thursdayBefore && refreshed);

  const after = describe(await weekRows());
  const expected = [
    `${mon} 10:14-16:23`,
    `${mon} 19:00-20:00`,
    `${tue} 08:17-14:20`,
    `${tue} 16:01-18:17`,
    `${wed} 08:17-14:55`,
    `${wed} 15:52-17:43`,
    `${thu} 08:16-14:56`,
  ];
  check(
    'Chambapp: fichajes como en Hera, sin borrar nada',
    JSON.stringify(after) === JSON.stringify(expected),
    after.join(', '),
  );

  // ---- repeat: nothing left to do
  const again = await ask(options, { type: 'hera-week-preview' });
  const pendingChanges = again.ok
    ? again.data.days.reduce((n, day) => n + day.create.length + day.update.length, 0)
    : -1;
  check(
    'repetir: no quedan cambios',
    pendingChanges === 0,
    JSON.stringify(again.ok ? '' : again.error),
  );

  // ---- a stale preview is not applied
  const stale = await ask(options, { type: 'hera-week-preview' });
  await op('crear_fichaje', {
    id: crypto.randomUUID(),
    inicio_en: iso(fri, '21:00'),
    fin_en: iso(fri, '21:30'),
  });
  const refused = await ask(options, { type: 'hera-week-apply', previewId: stale.data.id });
  const appliedStale = refused.ok ? refused.data : null;
  check(
    'vista previa obsoleta: no escribe',
    !refused.ok || (appliedStale.created === 0 && appliedStale.updated === 0),
    JSON.stringify(refused).slice(0, 200),
  );

  // ---- requests reach the app
  const app = await context.newPage();
  await app.goto(`${LOCAL}/fichajes?fecha=${thu}`);
  await app.waitForSelector('.ext-status--on', { timeout: 15_000 }).catch(() => null);
  const pendingBadge = await app
    .waitForSelector('text=Solicitud pendiente', { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);
  const appText = ((await app.textContent('main')) ?? '').replace(/\s+/g, ' ');
  await app.screenshot({ path: join(shots, 'app-fichajes.png'), fullPage: true });
  check('app: etiqueta «Solicitud pendiente» en el jueves', pendingBadge);
  check(
    'app: detalle y aviso de horas',
    /Solicitudes en Hera/.test(appText) && /Mientras no la acepten cuentan/.test(appText),
    appText.match(/Solicitudes en Hera.{0,200}/)?.[0] ?? '',
  );
  check('app: denegada del viernes visible en la tabla', /Solicitud denegada/.test(appText));
  check('app: fecha de lectura', /Solicitudes leídas de Hera el/.test(appText));
  const stored = await ask(options, { type: 'hera-requests-refresh' });
  check(
    'solicitudes: se leen las 12 filas (más de las 10 visibles)',
    stored.ok && stored.data.count === 12,
    JSON.stringify(stored).slice(0, 160),
  );
  check('sin errores en el service worker', errors.length === 0, errors.join(' | '));
} finally {
  await context.close();
}
console.log(`\nCapturas: ${shots}`);
process.exit(failed ? 1 : 0);
