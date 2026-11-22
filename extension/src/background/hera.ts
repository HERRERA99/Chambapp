// "Fichaje" section: reads the last clock-in/out shown in Hera and records it in
// Chambapp (cloud or local, whichever the extension is connected to).
import { DateTime } from 'luxon';
import {
  isHeraRequestsSnapshot,
  normalizeHeraRequests,
} from '../../../src/features/extension/heraRequests';
import { EXTENSION_SOURCE } from '../../../src/features/extension/protocol';
import {
  HERA_ELEMENT_ID,
  HERA_ORIGIN,
  HERA_URL,
  HERA_WEEK_URL,
  heraInstant,
  heraPlan,
  heraWeekDates,
  heraWeekPlan,
  heraWeekPlanSignature,
  normalizeHeraWeek,
  parseHeraAction,
} from '../shared/hera';
import type { AttendanceRow } from '../shared/hera';
import type { HeraSyncResult, HeraWeekPreview, HeraWeekResult } from '../shared/messages';
import { originPattern } from '../shared/patterns';
import { toApp } from './appTabs';
import { command, fail, message, requireSession } from './supabase';
import type { ExtSession } from './supabase';

type HeraResult = HeraSyncResult;

const READ_TIMEOUT = 25_000;

function readElement(id: string) {
  return document.getElementById(id)?.textContent?.trim() ?? null;
}

async function readFromTab(tabId: number): Promise<string | null> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: readElement,
    args: [HERA_ELEMENT_ID],
  });
  return (result?.result as string | null | undefined) ?? null;
}

/** Text of the last action: from an open Hera tab, or a background tab opened for it. */
async function readHeraText(): Promise<string> {
  if (!(await chrome.permissions.contains({ origins: [originPattern(HERA_ORIGIN)] })))
    throw new Error('Falta el permiso para leer Hera: concédelo en la sección Fichaje.');
  const open = (await chrome.tabs.query({ url: originPattern(HERA_ORIGIN) })).filter(
    (tab) => tab.id !== undefined && tab.url && new URL(tab.url).origin === HERA_ORIGIN,
  );
  for (const tab of open) {
    const text = await readFromTab(tab.id!).catch(() => null);
    if (text) return text;
  }
  const tab = await chrome.tabs.create({ url: HERA_URL, active: false });
  try {
    const started = Date.now();
    while (Date.now() - started < READ_TIMEOUT) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const current = await chrome.tabs.get(tab.id!).catch(() => null);
      if (!current) throw new Error('Se cerró la pestaña de Hera.');
      if (current.url && new URL(current.url).origin !== HERA_ORIGIN) continue;
      const text = await readFromTab(tab.id!).catch(() => null);
      if (text) return text;
    }
    throw new Error(
      'No se encontró la última acción en Hera. Abre Hera, inicia sesión y vuelve a intentarlo.',
    );
  } finally {
    await chrome.tabs.remove(tab.id!).catch(() => undefined);
  }
}

/** Reads Hera and records its last action as a Chambapp attendance. */
export async function syncHera(): Promise<HeraResult> {
  // The account this operation belongs to: every write is refused if it changes.
  const session = await requireSession();
  const text = await readHeraText();
  const action = parseHeraAction(text);
  if (!action) throw new Error(`No se entiende la última acción de Hera: «${text.slice(0, 120)}».`);

  const zone = await readProfileZone(session);
  const at = heraInstant(action, zone);
  if (!at) throw new Error('La fecha de Hera no es válida en tu zona horaria.');

  // Live attendance around that moment (a day before and after is enough to decide).
  const from = DateTime.fromISO(at).minus({ days: 2 }).toISO()!;
  const rows = await session.client
    .from('fichajes')
    .select('id,version,inicio_en,fin_en')
    .eq('usuario_id', session.user.id)
    .is('eliminado_en', null)
    .or(`fin_en.is.null,fin_en.gte.${from}`)
    .order('inicio_en', { ascending: false })
    .limit(200)
    .abortSignal(AbortSignal.timeout(20_000));
  if (rows.error) fail(rows.error, rows.status);

  const label = (iso: string) => DateTime.fromISO(iso, { zone }).toFormat('HH:mm');
  const plan = heraPlan((rows.data ?? []) as AttendanceRow[], action, at, label);
  if (plan.kind === 'error') throw new Error(plan.message);
  if (plan.kind === 'already') return { text, action, outcome: 'already', message: plan.message };
  if (plan.kind === 'create') {
    await command(
      'crear_fichaje',
      { id: crypto.randomUUID(), inicio_en: plan.inicio_en },
      session.account,
    );
    return {
      text,
      action,
      outcome: 'created',
      message: `Entrada registrada a las ${action.time} del ${DateTime.fromISO(action.date).toFormat('dd/MM/yyyy')}.`,
    };
  }
  await command(
    'editar_fichaje',
    { id: plan.id, version: plan.version, fin_en: plan.fin_en },
    session.account,
  );
  return {
    text,
    action,
    outcome: 'closed',
    message: `Salida registrada a las ${action.time} (entrada de las ${label(plan.inicio_en)}).`,
  };
}

/** Runs in the Hera tab. Only the read endpoint below is called. */
async function readWeekInPage(dates: string[], pageUrl: string) {
  const page = new URL(pageUrl);
  const login = 'Inicia sesión en Hera y vuelve a intentarlo.';
  if (location.origin !== page.origin || location.pathname.replace(/\/$/, '') !== page.pathname)
    return { error: login };
  const selector = document.querySelector<HTMLInputElement>('input#select_fecha_cambiar');
  if (!selector) return { error: login };
  const { nif, ini, fin } = selector.dataset;
  const info = document.querySelector<HTMLInputElement>('input#info_mis_fichajes')?.value;
  const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
  if (
    !nif ||
    !ini ||
    !fin ||
    !dayPattern.test(ini) ||
    !dayPattern.test(fin) ||
    ini > fin ||
    info === undefined
  )
    return { error: 'No se han encontrado los datos de consulta en Hera.' };

  try {
    const signal = AbortSignal.timeout(20_000);
    const endpoint = new URL('/gestion/cambiar-fichajes/ajax/modificar_mis_accesos.php', page);
    const days = [];
    for (const date of dates) {
      if (date < ini || date > fin) {
        days.push({ date, accesses: [], pendingRequests: 0, outOfRange: true });
        continue;
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        redirect: 'error',
        signal,
        body: new URLSearchParams({
          fecha: date.split('-').reverse().join('/'),
          nif,
          ini,
          fin,
          info,
        }),
      });
      const payload = response.ok ? await response.json() : null;
      if (typeof payload?.info !== 'string') throw new Error('Respuesta de Hera no válida.');
      // A template keeps the returned markup inert, including embedded resources.
      const template = document.createElement('template');
      template.innerHTML = payload.info;
      const pendingRequests = template.content.querySelectorAll('div.acc_sol_existente').length;
      const accesses = Array.from(
        template.content.querySelectorAll('div.acc_existente[data-id]'),
        (access) => {
          if (access.closest('div.acc_sol_existente')) return [];
          const kind = access.querySelector<HTMLSelectElement>('select.selector_tipo')?.value;
          const time = access.querySelector<HTMLInputElement>('input.horas_edit')?.value;
          if ((kind !== 'e' && kind !== 's') || !time) throw new Error('Acceso de Hera no válido.');
          return [{ kind: kind === 'e' ? 'entrada' : 'salida', time }];
        },
      ).flat();
      if (
        !accesses.length &&
        !pendingRequests &&
        !template.content.textContent?.includes('No hay ningún fichaje realizado en este día')
      )
        throw new Error('Respuesta de Hera no válida.');
      days.push({ date, accesses, pendingRequests });
    }
    return { days };
  } catch {
    return {
      error: 'No se han podido leer los fichajes de la semana en Hera. Vuelve a intentarlo.',
    };
  }
}

/** Fetches the unpaginated table in the original HTML without touching the live page. */
async function readRequestsInPage(pageUrl: string) {
  const page = new URL(pageUrl);
  const login = 'Inicia sesión en Hera y vuelve a intentarlo.';
  if (
    location.origin !== page.origin ||
    location.pathname.replace(/\/$/, '') !== page.pathname ||
    !document.querySelector('input#select_fecha_cambiar')
  )
    return { error: login };

  try {
    const response = await fetch(location.href, {
      method: 'GET',
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error();
    const html = new DOMParser().parseFromString(await response.text(), 'text/html');
    if (!html.querySelector('input#select_fecha_cambiar')) return { error: login };
    const table = html.querySelector<HTMLTableElement>('table.mostrar_datos_solicitudes');
    if (!table) return { error: 'No se ha encontrado la tabla de solicitudes en Hera.' };
    const rows = Array.from(table.tBodies).flatMap((body) =>
      Array.from(body.rows, ({ cells }) => {
        if (cells.length !== 5) return null;
        const status = cells[4]?.querySelector('span') ?? cells[4];
        return {
          date: cells[0]?.querySelector('div.none')?.textContent?.trim(),
          originalText: cells[1]?.textContent,
          changeText: cells[2]?.textContent,
          reason: cells[3]?.textContent,
          statusText: status?.textContent,
          statusClasses: status?.className,
        };
      }),
    );
    return { rows };
  } catch {
    return { error: 'No se han podido leer las solicitudes en Hera. Vuelve a intentarlo.' };
  }
}

async function withHeraWeekTab<T>(read: (tabId: number) => Promise<T>): Promise<T> {
  const pattern = originPattern(HERA_ORIGIN);
  if (!(await chrome.permissions.contains({ origins: [pattern] })))
    throw new Error('Falta el permiso para leer Hera. Concédelo en la sección Fichaje.');

  const path = new URL(HERA_WEEK_URL).pathname;
  const open = (await chrome.tabs.query({ url: pattern })).find(
    (tab) =>
      tab.id !== undefined && tab.url && new URL(tab.url).pathname.replace(/\/$/, '') === path,
  );
  const tab = open ?? (await chrome.tabs.create({ url: HERA_WEEK_URL, active: false }));
  if (tab.id === undefined) throw new Error('No se ha podido abrir la pestaña de Hera.');
  const tabId = tab.id;
  try {
    const deadline = Date.now() + READ_TIMEOUT;
    while (Date.now() < deadline) {
      const current = await chrome.tabs.get(tabId).catch(() => null);
      if (!current) throw new Error('Se cerró la pestaña de Hera.');
      if (current.status === 'complete' && current.url) {
        if (new URL(current.url).origin !== HERA_ORIGIN)
          throw new Error('Inicia sesión en Hera y vuelve a intentarlo.');
        return await read(tabId);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Hera está tardando demasiado en cargar. Vuelve a intentarlo.');
  } finally {
    if (!open) await chrome.tabs.remove(tabId).catch(() => undefined);
  }
}

const requestsKey = (account: string) => `hera-requests:${account}`;

export async function cachedHeraRequests(account: string) {
  const key = requestsKey(account);
  const data = (await chrome.storage.local.get(key))[key];
  return isHeraRequestsSnapshot(data) ? data : { readAt: null, items: [] };
}

async function saveHeraRequests(tabId: number, account: string) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: readRequestsInPage,
    args: [HERA_WEEK_URL],
  });
  if (result?.result?.error) throw new Error(result.result.error);
  const items = normalizeHeraRequests(result?.result?.rows);
  await requireSession(account);
  const readAt = Date.now();
  await chrome.storage.local.set({ [requestsKey(account)]: { readAt, items } });
  // Tabs ask for their own account on receipt; the broadcast carries no requests.
  void toApp({ source: EXTENSION_SOURCE, type: 'hera-requests-changed' }).catch(() => undefined);
  return { count: items.length };
}

export async function refreshHeraRequests() {
  const session = await requireSession();
  return withHeraWeekTab((tabId) => saveHeraRequests(tabId, session.account));
}

async function readHeraWeek(dates: string[], account: string) {
  return withHeraWeekTab(async (tabId) => {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: readWeekInPage,
      args: [dates, HERA_WEEK_URL],
    });
    if (result?.result?.error) throw new Error(result.result.error);
    const days = normalizeHeraWeek(result?.result?.days, dates);
    const requestsError = await saveHeraRequests(tabId, account).then(
      () => undefined,
      (cause) => message(cause),
    );
    return { days, requestsError };
  });
}

async function readProfileZone(session: ExtSession): Promise<string> {
  const profile = await session.client
    .from('perfiles')
    .select('zona_horaria')
    .eq('id', session.user.id)
    .abortSignal(AbortSignal.timeout(20_000))
    .single();
  if (profile.error) fail(profile.error, profile.status);
  return profile.data.zona_horaria;
}

async function readWeekRows(session: ExtSession, dates: string[], zone: string) {
  const from = DateTime.fromISO(dates[0]!, { zone }).minus({ days: 1 }).toISO()!;
  const until = DateTime.fromISO(dates.at(-1)!, { zone }).plus({ days: 2 }).toISO()!;
  const rows: AttendanceRow[] = [];
  const pageSize = 200;
  const signal = AbortSignal.timeout(20_000);
  for (let offset = 0; ; offset += pageSize) {
    const page = await session.client
      .from('fichajes')
      .select('id,version,inicio_en,fin_en')
      .eq('usuario_id', session.user.id)
      .is('eliminado_en', null)
      .gte('inicio_en', from)
      .lt('inicio_en', until)
      .order('inicio_en')
      .order('id')
      .range(offset, offset + pageSize - 1)
      .abortSignal(signal);
    if (page.error) fail(page.error, page.status);
    rows.push(...page.data);
    if (page.data.length < pageSize) return rows;
  }
}

const WEEK_PREVIEW_KEY = 'hera-week-preview';
const REPEAT_PREVIEW = 'Vuelve a generar la vista previa antes de aplicar los cambios.';
const APPLYING_WEEK = 'Ya se están aplicando fichajes de Hera.';
let applyingWeek = false;
type StoredPreview = {
  id: string;
  account: string;
  zone: string;
  hera: ReturnType<typeof normalizeHeraWeek>;
  signature: string;
};

export async function previewHeraWeek(): Promise<HeraWeekPreview> {
  const session = await requireSession();
  const zone = await readProfileZone(session);
  const today = DateTime.now().setZone(zone);
  if (!today.isValid) throw new Error('La zona horaria de tu perfil no es válida.');
  const dates = heraWeekDates(today);
  const [{ days: hera, requestsError }, rows] = await Promise.all([
    readHeraWeek(dates, session.account),
    readWeekRows(session, dates, zone),
  ]);
  const plan = heraWeekPlan(hera, rows, zone);
  const id = crypto.randomUUID();
  const preview: StoredPreview = {
    id,
    account: session.account,
    zone,
    hera,
    signature: heraWeekPlanSignature(plan),
  };
  // Keep the latest preview available if the service worker goes idle.
  if (applyingWeek) throw new Error(APPLYING_WEEK);
  await chrome.storage.session.set({ [WEEK_PREVIEW_KEY]: preview });
  return { id, zone, days: plan.days, requestsError };
}

export async function applyHeraWeek(id: string): Promise<HeraWeekResult> {
  if (applyingWeek) throw new Error(APPLYING_WEEK);
  applyingWeek = true;
  try {
    const stored = await chrome.storage.session.get(WEEK_PREVIEW_KEY);
    const preview = stored[WEEK_PREVIEW_KEY] as StoredPreview | undefined;
    if (preview?.id !== id) throw new Error(REPEAT_PREVIEW);
    const session = await requireSession();
    if (session.account !== preview.account) throw new Error(REPEAT_PREVIEW);
    const zone = await readProfileZone(session);
    if (zone !== preview.zone) throw new Error(`Ha cambiado la zona del perfil. ${REPEAT_PREVIEW}`);
    const dates = heraWeekDates(DateTime.now().setZone(zone));
    if (
      dates.length !== preview.hera.length ||
      dates.some((date, index) => date !== preview.hera[index]?.date)
    )
      throw new Error(`Ha cambiado el periodo que se puede recuperar. ${REPEAT_PREVIEW}`);

    const plan = heraWeekPlan(preview.hera, await readWeekRows(session, dates, zone), zone);
    if (preview.signature !== heraWeekPlanSignature(plan))
      throw new Error(`Han cambiado los fichajes de Chambapp. ${REPEAT_PREVIEW}`);

    const latest = await chrome.storage.session.get(WEEK_PREVIEW_KEY);
    if ((latest[WEEK_PREVIEW_KEY] as StoredPreview | undefined)?.id !== id)
      throw new Error(REPEAT_PREVIEW);
    await chrome.storage.session.remove(WEEK_PREVIEW_KEY);
    const result: HeraWeekResult = {
      created: 0,
      updated: 0,
      remaining: plan.days.reduce((sum, day) => sum + day.create.length + day.update.length, 0),
    };
    for (const day of plan.days) {
      try {
        for (const { row, segment } of day.update) {
          await command(
            'editar_fichaje',
            { id: row.id, version: row.version, ...segment },
            session.account,
          );
          result.updated++;
          result.remaining--;
        }
        for (const segment of day.create) {
          await command('crear_fichaje', { id: crypto.randomUUID(), ...segment }, session.account);
          result.created++;
          result.remaining--;
        }
      } catch (cause) {
        const date = day.date.split('-').reverse().join('/');
        return {
          ...result,
          error: `Se detuvo la recuperación el ${date}. ${message(cause)} ${REPEAT_PREVIEW}`,
        };
      }
    }
    return result;
  } finally {
    applyingWeek = false;
  }
}
