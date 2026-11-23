// Hera (the company's attendance site): the extension reads the last clock-in/out
// shown there and records it as a Chambapp attendance. Pure helpers.
import { DateTime } from 'luxon';

export const HERA_URL = 'https://netkia.heraempleados.es/';
export const HERA_ORIGIN = new URL(HERA_URL).origin;
export const HERA_WEEK_URL = new URL('/rrhh/solicitar-fichajes', HERA_URL).href;
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

type HeraAccess = Pick<HeraAction, 'kind' | 'time'>;
type HeraDay = {
  date: string;
  accesses: HeraAccess[];
  pendingRequests: number;
  outOfRange?: true;
};
/** A segment still open (fin_en null) is only possible today: Hera shows no exit yet. */
type HeraSegment = { inicio_en: string; fin_en: string | null };
type HeraMatch = { row: AttendanceRow; segment: HeraSegment };

export type HeraDayPlan = {
  date: string;
  status: 'ok' | 'incomplete' | 'conflict' | 'empty' | 'out-of-range';
  segments: HeraSegment[];
  pendingRequests: number;
  create: HeraSegment[];
  update: HeraMatch[];
  same: HeraMatch[];
  onlyChambapp: AttendanceRow[];
  message?: string;
};

/**
 * Dates in the user's zone, ending today. On Mondays, the whole previous week and today;
 * on other days, from this week's Monday to today.
 */
export function heraWeekDates(today: DateTime): string[] {
  const day = today.startOf('day');
  const count = day.weekday === 1 ? 7 : day.weekday - 1;
  return Array.from({ length: count + 1 }, (_, index) =>
    day.minus({ days: count - index }).toISODate()!,
  );
}

function record(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>;
  throw new Error('Hera ha devuelto datos de fichaje no válidos.');
}

/** Validate dates, order and every access before any of the page data enters a plan. */
export function normalizeHeraWeek(value: unknown, dates: readonly string[]): HeraDay[] {
  const invalid = 'Hera ha devuelto datos de fichaje no válidos.';
  if (!Array.isArray(value) || value.length !== dates.length) throw new Error(invalid);
  return dates.map((date, index) => {
    const { date: received, accesses, pendingRequests, outOfRange } = record(value[index]);
    if (
      received !== date ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !DateTime.fromISO(date, { zone: 'utc' }).isValid ||
      !Array.isArray(accesses) ||
      typeof pendingRequests !== 'number' ||
      !Number.isSafeInteger(pendingRequests) ||
      pendingRequests < 0 ||
      (outOfRange !== undefined && outOfRange !== true) ||
      (outOfRange && (accesses.length > 0 || pendingRequests > 0))
    )
      throw new Error(invalid);
    const normalized: HeraDay = {
      date,
      accesses: Array.from(accesses, (value): HeraAccess => {
        const { kind, time } = record(value);
        if (
          (kind !== 'entrada' && kind !== 'salida') ||
          typeof time !== 'string' ||
          !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time.trim())
        )
          throw new Error(invalid);
        return { kind, time: time.trim() };
      }),
      pendingRequests,
    };
    return outOfRange ? { ...normalized, outOfRange } : normalized;
  });
}

/** With allowOpen (today), a last entry without exit is an open segment, not an error. */
export function pairHeraAccesses(
  { date, accesses }: HeraDay,
  zone: string,
  allowOpen = false,
): { segments: HeraSegment[]; message?: string } {
  const segments: HeraSegment[] = [];
  let start: string | null = null;
  for (const access of accesses) {
    const instant = heraInstant({ ...access, date }, zone);
    if (!instant || DateTime.fromISO(instant, { zone }).toFormat('HH:mm') !== access.time)
      return { segments, message: `La hora ${access.time} no es válida en tu zona horaria.` };
    if (access.kind === 'entrada') {
      if (start) return { segments, message: 'Hay dos entradas seguidas.' };
      const previous = segments.at(-1);
      if (previous && ms(instant) < ms(previous.fin_en!))
        return { segments, message: 'Los accesos de Hera están fuera de orden.' };
      start = instant;
    } else {
      if (!start) return { segments, message: 'Hay una salida sin entrada.' };
      if (ms(instant) <= ms(start))
        return { segments, message: 'La salida debe ser posterior a la entrada.' };
      segments.push({ inicio_en: start, fin_en: instant });
      start = null;
    }
  }
  if (start && allowOpen) segments.push({ inicio_en: start, fin_en: null });
  else if (start) return { segments, message: 'La última entrada no tiene salida.' };
  return { segments };
}

function overlaps(row: AttendanceRow, segment: HeraSegment): boolean {
  return (
    (segment.fin_en === null || ms(row.inicio_en) < ms(segment.fin_en)) &&
    (row.fin_en === null || ms(segment.inicio_en) < ms(row.fin_en))
  );
}

/**
 * An attendance left open on a past day stands for the first Hera segment it reaches
 * (the one it should have been closed with), not for every later one: the rest of
 * the day's segments are then created.
 */
function matchesSegment(
  row: AttendanceRow,
  segment: HeraSegment,
  segments: readonly HeraSegment[],
): boolean {
  if (row.fin_en !== null) return overlaps(row, segment);
  return segments.find((candidate) => overlaps(row, candidate)) === segment;
}

function planHeraDay(
  day: HeraDay,
  rows: readonly AttendanceRow[],
  zone: string,
  allowOpen: boolean,
): HeraDayPlan {
  const plan: HeraDayPlan = {
    date: day.date,
    status: 'ok',
    segments: [],
    pendingRequests: day.pendingRequests,
    create: [],
    update: [],
    same: [],
    onlyChambapp: [],
  };
  if (day.outOfRange)
    return {
      ...plan,
      status: 'out-of-range',
      message: 'Fecha fuera del rango consultable en Hera.',
    };
  const { segments, message } = pairHeraAccesses(day, zone, allowOpen);
  plan.segments = segments;
  if (message) return { ...plan, status: 'incomplete', message };

  const matches = segments.map((segment) =>
    rows.filter((row) => matchesSegment(row, segment, segments)),
  );
  plan.onlyChambapp = rows.filter((row) => !segments.some((segment) => overlaps(row, segment)));
  if (segments.length === 0) return { ...plan, status: 'empty', message: 'Sin fichajes en Hera.' };
  const matched = matches.flat();
  if (matches.some((rows) => rows.length > 1) || new Set(matched).size !== matched.length)
    return {
      ...plan,
      status: 'conflict',
      message: 'Hay fichajes solapados sin una correspondencia única entre Hera y Chambapp.',
    };

  segments.forEach((segment, index) => {
    const row = matches[index]?.[0];
    if (!row) plan.create.push(segment);
    else if (
      Math.abs(ms(row.inicio_en) - ms(segment.inicio_en)) < SAME_MS &&
      (row.fin_en === null || segment.fin_en === null
        ? row.fin_en === segment.fin_en
        : Math.abs(ms(row.fin_en) - ms(segment.fin_en)) < SAME_MS)
    )
      plan.same.push({ row, segment });
    else plan.update.push({ row, segment });
  });
  return plan;
}

/** today (yyyy-mm-dd): the only day whose last entry may still be open in Hera. */
export function heraWeekPlan(
  days: readonly HeraDay[],
  rows: readonly AttendanceRow[],
  zone: string,
  today?: string,
) {
  const byDate = new Map(days.map(({ date }) => [date, [] as AttendanceRow[]]));
  for (const { id, version, inicio_en, fin_en } of rows)
    byDate.get(DateTime.fromISO(inicio_en, { zone }).toISODate()!)?.push({
      id,
      version,
      inicio_en,
      fin_en,
    });
  const dayRows = days.map(({ date }) =>
    byDate.get(date)!.sort((a, b) => ms(a.inicio_en) - ms(b.inicio_en) || a.id.localeCompare(b.id)),
  );
  return {
    days: days.map((day, index) => planHeraDay(day, dayRows[index]!, zone, day.date === today)),
    // Include rows on skipped days so apply also detects changes to those days.
    rows: dayRows.flat(),
  };
}

export function heraWeekPlanSignature(plan: ReturnType<typeof heraWeekPlan>): string {
  return JSON.stringify(plan);
}
