// Hera (the company's attendance site): the extension reads the last clock-in/out
// shown there and records it as a Chambapp attendance. Pure helpers.
import { DateTime } from 'luxon';

export const HERA_URL = 'https://netkia.heraempleados.es/';
export const HERA_ORIGIN = new URL(HERA_URL).origin;
/** Element that shows e.g. "Última acción: SALIDA 09/11/2026 16:04". */
export const HERA_ELEMENT_ID = 'ultima_accion_flexible';

export type HeraAction = {
  kind: 'entrada' | 'salida';
  /** yyyy-mm-dd */
  date: string;
  /** HH:mm */
  time: string;
};

/** Reads "Última acción: SALIDA 09/11/2026 16:04" (case and spacing tolerant). */
export function parseHeraAction(text: string | null | undefined): HeraAction | null {
  const match = /\b(ENTRADA|SALIDA)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\b/i.exec(
    text ?? '',
  );
  if (!match) return null;
  const [, kind, day, month, year, hour, minute] = match;
  const date = `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`;
  const time = `${hour!.padStart(2, '0')}:${minute}`;
  const check = DateTime.fromISO(`${date}T${time}`);
  if (!check.isValid || check.toFormat('yyyy-MM-dd HH:mm') !== `${date} ${time}`) return null;
  return { kind: kind!.toLowerCase() as HeraAction['kind'], date, time };
}

/** The instant of the action in the user's time zone, with its offset (ISO). */
export function heraInstant(action: HeraAction, zone: string): string | null {
  const value = DateTime.fromISO(`${action.date}T${action.time}`, { zone });
  return value.isValid ? value.toISO({ suppressMilliseconds: true }) : null;
}

export type AttendanceRow = {
  id: string;
  version: number;
  inicio_en: string;
  fin_en: string | null;
};

export type HeraPlan =
  | { kind: 'create'; inicio_en: string }
  | { kind: 'close'; id: string; version: number; inicio_en: string; fin_en: string }
  | { kind: 'already'; message: string }
  | { kind: 'error'; message: string };

const SAME_MS = 60_000;
const ms = (iso: string) => Date.parse(iso);

/**
 * What to record for the action: an ENTRADA opens an attendance at that time, a SALIDA
 * closes the open one. Never duplicates (same minute already recorded) and never
 * overlaps: those cases return a message instead.
 */
export function heraPlan(
  rows: readonly AttendanceRow[],
  action: HeraAction,
  at: string,
  label: (iso: string) => string,
): HeraPlan {
  const when = ms(at);
  const open = rows.find((row) => row.fin_en === null);
  if (action.kind === 'entrada') {
    if (rows.some((row) => Math.abs(ms(row.inicio_en) - when) < SAME_MS))
      return { kind: 'already', message: `La entrada de las ${action.time} ya está registrada.` };
    if (open)
      return {
        kind: 'error',
        message: `Ya tienes una entrada abierta desde las ${label(open.inicio_en)}. Registra antes su salida.`,
      };
    const inside = rows.find(
      (row) => row.fin_en !== null && ms(row.inicio_en) < when && when < ms(row.fin_en),
    );
    if (inside)
      return {
        kind: 'error',
        message: `Las ${action.time} caen dentro de otro fichaje (${label(inside.inicio_en)}–${label(inside.fin_en!)}).`,
      };
    // An open attendance runs until it is closed: nothing may start after it.
    const later = rows.find((row) => ms(row.inicio_en) > when);
    if (later)
      return {
        kind: 'error',
        message: `Ya hay fichajes posteriores a las ${action.time} (desde las ${label(later.inicio_en)}): la entrada de Hera no es la más reciente.`,
      };
    return { kind: 'create', inicio_en: at };
  }
  if (rows.some((row) => row.fin_en !== null && Math.abs(ms(row.fin_en) - when) < SAME_MS))
    return { kind: 'already', message: `La salida de las ${action.time} ya está registrada.` };
  if (!open)
    return {
      kind: 'error',
      message: 'No hay ninguna entrada abierta en Chambapp que cerrar con esta salida.',
    };
  if (ms(open.inicio_en) >= when)
    return {
      kind: 'error',
      message: `La salida de las ${action.time} es anterior a la entrada abierta (${label(open.inicio_en)}).`,
    };
  return {
    kind: 'close',
    id: open.id,
    version: open.version,
    inicio_en: open.inicio_en,
    fin_en: at,
  };
}
