import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import { useWorkspace } from '../workspace/useWorkspace';
import { executeCommand } from '../../lib/supabase/workspace.repository';
import { DataError, readableError } from '../../lib/supabase/errors';
import { TrackerContext } from './useTracker';
import {
  clearPending,
  readPending,
  readPaused,
  savePending,
  savePaused,
  trackerStorageKey,
} from './pendingOperation';
import type { PendingOperation } from './pendingOperation';
import { withTrackerLock } from './trackerLock';

function TrackerSession({ children, userId }: { children: ReactNode; userId: string | null }) {
  const { data } = useWorkspace();
  const queryClient = useQueryClient();
  const [queued, setQueued] = useState(() => readPending(userId));
  const [pausedTaskId, setPausedTaskId] = useState(() => readPaused(userId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const inFlight = useRef(false);
  const active = data?.entries.find((entry) => entry.fin_en === null) ?? null;

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (
        !userId ||
        (event.key !== null &&
          event.key !== trackerStorageKey(userId) &&
          event.key !== `${trackerStorageKey(userId)}:paused`)
      )
        return;
      setQueued(readPending(userId));
      setPausedTaskId(readPaused(userId));
      void queryClient.invalidateQueries({ queryKey: ['workspace', userId] });
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [userId, queryClient]);

  function paused(taskId: string | null) {
    if (userId) savePaused(userId, taskId);
    setPausedTaskId(taskId);
  }

  async function perform(operation: PendingOperation, retry = false) {
    if (!userId) throw new Error('Inicia sesión para registrar tiempo.');
    if (inFlight.current) throw new Error('Espera a que termine la operación actual.');
    setBusy(true);
    setError(null);
    inFlight.current = true;
    try {
      await withTrackerLock(userId, async () => {
        const stored = readPending(userId);
        if (!retry && stored)
          throw new Error('Confirma la operación pendiente antes de registrar más tiempo.');
        if (retry && (!stored || stored.payload.operacion_id !== operation.payload.operacion_id))
          return;
        try {
          savePending(userId, operation);
        } catch {
          throw new Error(
            'El navegador no permite guardar la operación pendiente. Activa el almacenamiento local para registrar tiempo con seguridad.',
          );
        }
        setQueued(operation);
        try {
          await executeCommand(operation.action, operation.payload, undefined, userId);
          clearPending(userId, String(operation.payload.operacion_id));
          paused(operation.after === 'pause' ? operation.taskId : null);
        } catch (cause) {
          if (cause instanceof DataError && !cause.retryable)
            clearPending(userId, String(operation.payload.operacion_id));
          throw cause;
        } finally {
          setQueued(readPending(userId));
        }
      });
    } catch (cause) {
      setError(readableError(cause));
      throw cause;
    } finally {
      // Refresh errors are exposed by WorkspaceContext; they do not change a
      // confirmed mutation result or leave controls permanently busy.
      await queryClient
        .invalidateQueries({ queryKey: ['workspace', userId] })
        .catch(() => undefined);
      setQueued(readPending(userId));
      inFlight.current = false;
      setBusy(false);
    }
  }

  async function start(taskId: string, startAt?: string) {
    await perform({
      action: 'iniciar',
      payload: {
        operacion_id: crypto.randomUUID(),
        tarea_id: taskId,
        ...(startAt ? { inicio_en: startAt } : {}),
      },
      after: 'start',
      taskId,
    });
  }

  async function end(after: 'stop' | 'pause') {
    if (!active) throw new Error('No hay un cronómetro en curso.');
    await perform({
      action: 'detener',
      payload: { operacion_id: crypto.randomUUID(), parte_id: active.id },
      after,
      taskId: active.tarea_id,
    });
  }

  async function retryPending() {
    const operation = readPending(userId);
    if (operation) await perform(operation, true);
  }

  const serverOffset = data ? Date.parse(data.serverTime) - data.receivedAt : 0;
  const elapsedSeconds = active
    ? Math.max(0, (now + serverOffset - Date.parse(active.inicio_en)) / 1000)
    : 0;
  return (
    <TrackerContext.Provider
      value={{
        active,
        elapsedSeconds,
        busy,
        pending: !!queued,
        error,
        pausedTaskId,
        start,
        stop: () => end('stop'),
        pause: () => end('pause'),
        resume: () =>
          pausedTaskId
            ? start(pausedTaskId)
            : Promise.reject(new Error('No hay ninguna tarea pausada.')),
        retryPending,
      }}
    >
      {children}
    </TrackerContext.Provider>
  );
}

export function TrackerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <TrackerSession key={user?.id ?? 'signed-out'} userId={user?.id ?? null}>
      {children}
    </TrackerSession>
  );
}
