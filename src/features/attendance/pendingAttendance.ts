import type { Json } from '../../domain/models.ts';

export type AttendanceAction =
  'fichar_entrada' | 'fichar_salida' | 'crear_fichaje' | 'editar_fichaje' | 'eliminar_fichaje';

export type PendingAttendance = {
  action: AttendanceAction;
  payload: Record<string, Json | undefined>;
};

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export const attendanceStorageKey = (userId: string) => `chambapp:attendance:v1:${userId}`;
const actions: readonly string[] = [
  'fichar_entrada',
  'fichar_salida',
  'crear_fichaje',
  'editar_fichaje',
  'eliminar_fichaje',
];

export function isPendingAttendance(value: unknown): value is PendingAttendance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const operation = value as Partial<PendingAttendance>;
  if (!operation.action || !actions.includes(operation.action)) return false;
  const payload = operation.payload;
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    typeof payload.id !== 'string' ||
    !uuid.test(payload.id)
  )
    return false;
  if (
    operation.action !== 'fichar_entrada' &&
    operation.action !== 'crear_fichaje' &&
    (!Number.isInteger(payload.version) || Number(payload.version) < 1)
  )
    return false;
  if (operation.action === 'crear_fichaje' || operation.action === 'editar_fichaje') {
    if (typeof payload.inicio_en !== 'string' || !Number.isFinite(Date.parse(payload.inicio_en)))
      return false;
    if (
      payload.fin_en !== null &&
      (typeof payload.fin_en !== 'string' || !Number.isFinite(Date.parse(payload.fin_en)))
    )
      return false;
  }
  return true;
}

export function readPendingAttendance(userId: string | null): PendingAttendance | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(attendanceStorageKey(userId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isPendingAttendance(value) ? value : null;
  } catch {
    return null;
  }
}

export function savePendingAttendance(userId: string, operation: PendingAttendance) {
  if (!isPendingAttendance(operation)) throw new Error('El fichaje pendiente no es válido.');
  localStorage.setItem(attendanceStorageKey(userId), JSON.stringify(operation));
}

export function sameAttendanceIntent(a: PendingAttendance | null, b: PendingAttendance) {
  return a?.action === b.action && JSON.stringify(a.payload) === JSON.stringify(b.payload);
}

export function clearPendingAttendance(userId: string, operation: PendingAttendance) {
  if (sameAttendanceIntent(readPendingAttendance(userId), operation))
    localStorage.removeItem(attendanceStorageKey(userId));
}

export async function withAttendanceLock<T>(
  userId: string,
  work: () => Promise<T>,
  manager = globalThis.navigator?.locks,
): Promise<T> {
  if (!manager)
    throw new Error('Usa un navegador actualizado para coordinar los fichajes entre pestañas.');
  return manager.request(`chambapp:attendance:${userId}`, { ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error('Otra pestaña está guardando un fichaje. Espera a que termine.');
    return work();
  });
}
