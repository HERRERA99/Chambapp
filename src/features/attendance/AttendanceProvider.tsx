import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { estimateServerTime } from '../../domain/attendance';
import { executeCommand } from '../../lib/supabase/workspace.repository';
import { DataError, readableError } from '../../lib/supabase/errors';
import { useAuth } from '../auth/useAuth';
import { useWorkspace } from '../workspace/useWorkspace';
import { AttendanceContext } from './useAttendance';
import {
  attendanceStorageKey,
  clearPendingAttendance,
  readPendingAttendance,
  savePendingAttendance,
  sameAttendanceIntent,
  withAttendanceLock,
} from './pendingAttendance';
import type { PendingAttendance } from './pendingAttendance';

function AttendanceSession({ children, userId }: { children: ReactNode; userId: string | null }) {
  const { data } = useWorkspace();
  const cache = useQueryClient();
  const [operation, setOperation] = useState(() => readPendingAttendance(userId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientNow, setClientNow] = useState(Date.now);
  const inFlight = useRef(false);
  const active = data?.fichajes.find((record) => !record.fin_en && !record.eliminado_en) ?? null;
  const now = data
    ? estimateServerTime(data.serverTime, data.receivedAt, clientNow)
    : new Date(clientNow).toISOString();

  useEffect(() => {
    const timer = setInterval(() => setClientNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    function sync(event: StorageEvent) {
      if (!userId || (event.key !== null && event.key !== attendanceStorageKey(userId))) return;
      setOperation(readPendingAttendance(userId));
      void cache.invalidateQueries({ queryKey: ['workspace', userId] });
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [userId, cache]);

  async function perform(intent: PendingAttendance, retry = false) {
    if (!userId) throw new Error('Inicia sesión para fichar.');
    if (inFlight.current) throw new Error('Espera a que termine el fichaje actual.');
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await withAttendanceLock(userId, async () => {
        const stored = readPendingAttendance(userId);
        if (!retry && stored)
          throw new Error('Reintenta el fichaje pendiente antes de guardar otro cambio.');
        if (retry && !sameAttendanceIntent(stored, intent)) return;
        try {
          savePendingAttendance(userId, intent);
        } catch {
          throw new Error(
            'Activa el almacenamiento local del navegador para conservar el fichaje hasta confirmar su resultado.',
          );
        }
        setOperation(intent);
        try {
          await executeCommand(intent.action, intent.payload, undefined, userId);
          clearPendingAttendance(userId, intent);
        } catch (cause) {
          if (cause instanceof DataError && !cause.retryable)
            clearPendingAttendance(userId, intent);
          throw cause;
        }
      });
    } catch (cause) {
      setError(readableError(cause));
      throw cause;
    } finally {
      await cache.invalidateQueries({ queryKey: ['workspace', userId] }).catch(() => undefined);
      setOperation(readPendingAttendance(userId));
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function stop() {
    if (!active) throw new Error('No hay una entrada sin salida.');
    await perform({ action: 'fichar_salida', payload: { id: active.id, version: active.version } });
  }
  async function retry() {
    const intent = readPendingAttendance(userId);
    if (intent) await perform(intent, true);
  }

  return (
    <AttendanceContext.Provider
      value={{
        active,
        now,
        elapsedSeconds: active
          ? Math.max(0, (Date.parse(now) - Date.parse(active.inicio_en)) / 1000)
          : 0,
        busy,
        pending: !!operation,
        error,
        operation,
        perform,
        start: () => perform({ action: 'fichar_entrada', payload: { id: crypto.randomUUID() } }),
        stop,
        retry,
      }}
    >
      {children}
    </AttendanceContext.Provider>
  );
}

export function AttendanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <AttendanceSession key={user?.id ?? 'signed-out'} userId={user?.id ?? null}>
      {children}
    </AttendanceSession>
  );
}
