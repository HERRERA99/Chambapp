import type { Json } from '../../domain/models';

export type PendingOperation = {
  action: 'iniciar' | 'detener';
  payload: Record<string, Json | undefined>;
  after: 'start' | 'stop' | 'pause';
  taskId: string;
};

export const trackerStorageKey = (userId: string) => `chambapp:tracker:v1:${userId}`;
const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

export function isPendingOperation(value: unknown): value is PendingOperation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const op = value as Partial<PendingOperation>;
  if (
    !op.payload ||
    typeof op.payload !== 'object' ||
    Array.isArray(op.payload) ||
    typeof op.payload.operacion_id !== 'string' ||
    !uuid.test(op.payload.operacion_id) ||
    typeof op.taskId !== 'string' ||
    !uuid.test(op.taskId)
  )
    return false;
  if (op.action === 'iniciar') return op.after === 'start' && op.payload.tarea_id === op.taskId;
  return (
    op.action === 'detener' &&
    (op.after === 'stop' || op.after === 'pause') &&
    typeof op.payload.parte_id === 'string' &&
    uuid.test(op.payload.parte_id)
  );
}

export function readPending(userId: string | null): PendingOperation | null {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(trackerStorageKey(userId));
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    return isPendingOperation(value) ? value : null;
  } catch {
    return null;
  }
}

export function savePending(userId: string, operation: PendingOperation | null) {
  if (operation) {
    if (!isPendingOperation(operation)) throw new Error('La operación pendiente no es válida.');
    localStorage.setItem(trackerStorageKey(userId), JSON.stringify(operation));
  } else localStorage.removeItem(trackerStorageKey(userId));
}

/** Clear only the confirmed intent, never another tab's newer operation. */
export function clearPending(userId: string, operationId: string) {
  if (readPending(userId)?.payload.operacion_id === operationId) savePending(userId, null);
}

export function readPaused(userId: string | null) {
  try {
    const taskId = userId ? localStorage.getItem(`${trackerStorageKey(userId)}:paused`) : null;
    return taskId && uuid.test(taskId) ? taskId : null;
  } catch {
    return null;
  }
}

export function savePaused(userId: string, taskId: string | null) {
  try {
    if (taskId) localStorage.setItem(`${trackerStorageKey(userId)}:paused`, taskId);
    else localStorage.removeItem(`${trackerStorageKey(userId)}:paused`);
  } catch {
    /* This optional resume shortcut doesn't affect the stored time. */
  }
}
