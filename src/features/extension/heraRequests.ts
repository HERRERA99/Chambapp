export type HeraRequestClock = { kind: 'entrada' | 'salida'; time: string };

export type HeraChangeRequest = {
  date: string;
  original: HeraRequestClock | null;
  operation: string;
  change: HeraRequestClock | null;
  reason: string;
  status: 'concedida' | 'pendiente' | 'denegada' | 'desconocido';
  statusText: string;
};

export type HeraRequestsSnapshot = { readAt: number | null; items: HeraChangeRequest[] };

const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MAX_OPERATION = 80;
const MAX_REASON = 1000;
const MAX_STATUS = 120;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function isDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    new Date(`${value}T00:00:00Z`).toJSON()?.slice(0, 10) === value
  );
}

function cleanText(value: string, max: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, max).trimEnd();
}

/** undefined for a malformed clock, null for an absent clock. */
function parseClock(value: string): HeraRequestClock | null | undefined {
  if (value === '' || value === '-') return null;
  const match = /^([ES])\s*:\s*(\d{2}:\d{2})$/i.exec(value);
  if (!match || !timePattern.test(match[2]!)) return undefined;
  return { kind: match[1]!.toUpperCase() === 'E' ? 'entrada' : 'salida', time: match[2]! };
}

function requestStatus(text: string, classes: string): HeraChangeRequest['status'] {
  if (/\b(?:concedida|aceptada)\b/i.test(text)) return 'concedida';
  if (/\bpendiente\b/i.test(text)) return 'pendiente';
  if (/\b(?:denegada|rechazada)\b/i.test(text)) return 'denegada';
  const names = classes.split(/\s+/);
  if (names.some((name) => name === 'success' || name === 'label-new-success')) return 'concedida';
  if (names.some((name) => name === 'warning' || name === 'label-new-warning')) return 'pendiente';
  if (names.some((name) => name === 'danger' || name === 'label-new-danger')) return 'denegada';
  return 'desconocido';
}

/** Converts the text extracted from the table into requests; skips malformed rows. */
export function normalizeHeraRequests(value: unknown): HeraChangeRequest[] {
  if (!Array.isArray(value)) throw new Error('Hera ha devuelto solicitudes no válidas.');
  const items: HeraChangeRequest[] = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    const { date, originalText, changeText, reason, statusText, statusClasses } = row;
    if (
      !isDate(date) ||
      typeof originalText !== 'string' ||
      typeof changeText !== 'string' ||
      typeof reason !== 'string' ||
      typeof statusText !== 'string' ||
      typeof statusClasses !== 'string'
    )
      continue;
    const requested = /^\[([^\]]+)\]\s*([\s\S]*)$/.exec(changeText.trim());
    if (!requested) continue;
    const operation = cleanText(requested[1]!, MAX_OPERATION);
    const original = parseClock(originalText.trim());
    const change = parseClock(requested[2]!.trim());
    if (!operation || original === undefined || change === undefined || (!original && !change))
      continue;
    items.push({
      date,
      original,
      operation,
      change,
      reason: cleanText(reason, MAX_REASON),
      status: requestStatus(statusText, statusClasses),
      statusText: cleanText(statusText, MAX_STATUS),
    });
  }
  return items;
}

function isClock(value: unknown) {
  return (
    value === null ||
    (isRecord(value) &&
      (value.kind === 'entrada' || value.kind === 'salida') &&
      typeof value.time === 'string' &&
      timePattern.test(value.time))
  );
}

function isChangeRequest(value: unknown): value is HeraChangeRequest {
  return (
    isRecord(value) &&
    isDate(value.date) &&
    isClock(value.original) &&
    isClock(value.change) &&
    (value.original !== null || value.change !== null) &&
    typeof value.operation === 'string' &&
    value.operation.trim().length > 0 &&
    value.operation.length <= MAX_OPERATION &&
    typeof value.reason === 'string' &&
    value.reason.length <= MAX_REASON &&
    typeof value.statusText === 'string' &&
    value.statusText.length <= MAX_STATUS &&
    (value.status === 'concedida' ||
      value.status === 'pendiente' ||
      value.status === 'denegada' ||
      value.status === 'desconocido')
  );
}

export function isHeraRequestsSnapshot(value: unknown): value is HeraRequestsSnapshot {
  if (!isRecord(value) || !Array.isArray(value.items)) return false;
  return value.readAt === null
    ? value.items.length === 0
    : typeof value.readAt === 'number' &&
        Number.isSafeInteger(value.readAt) &&
        value.readAt > 0 &&
        value.readAt <= 8.64e15 &&
        value.items.every(isChangeRequest);
}
