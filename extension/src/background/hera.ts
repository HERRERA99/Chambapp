// "Fichaje" section: reads the last clock-in/out shown in Hera and records it in
// Chambapp (cloud or local, whichever the extension is connected to).
import { DateTime } from 'luxon';
import {
  HERA_ELEMENT_ID,
  HERA_ORIGIN,
  HERA_URL,
  heraInstant,
  heraPlan,
  parseHeraAction,
} from '../shared/hera';
import type { AttendanceRow } from '../shared/hera';
import type { HeraSyncResult } from '../shared/messages';
import { originPattern } from '../shared/patterns';
import { command, fail, requireSession } from './supabase';

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

  const profile = await session.client
    .from('perfiles')
    .select('zona_horaria')
    .eq('id', session.user.id)
    .abortSignal(AbortSignal.timeout(20_000))
    .single();
  if (profile.error) fail(profile.error, profile.status);
  const zone = (profile.data as { zona_horaria: string }).zona_horaria;
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
