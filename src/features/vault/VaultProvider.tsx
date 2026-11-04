import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NoteRow, VaultRow } from '../../domain/models';
import { createVault, encryptNote, rewrapVault, unlockVault } from '../../lib/crypto/vault';
import { loadVault } from '../../lib/supabase/vault.repository';
import { executeCommand } from '../../lib/supabase/workspace.repository';
import { useAuth } from '../auth/useAuth';
import { useWorkspace } from '../workspace/useWorkspace';
import { VaultContext, isVaultChanged } from './useVault';
import type { LegacyMigration, VaultState, VaultStatus } from './useVault';

/** Locks the vault after this long without pointer or keyboard activity. */
export const VAULT_IDLE_MS = 15 * 60 * 1000;
const idleMigration: LegacyMigration = { total: 0, done: 0, failed: 0, running: false };

export function VaultProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const workspace = useWorkspace();
  const query = useQuery({
    queryKey: ['boveda', userId],
    queryFn: ({ signal }) => loadVault(userId!, signal),
    enabled: !!userId,
    staleTime: 60_000,
  });
  const [unlocked, setUnlocked] = useState<{ key: CryptoKey; row: VaultRow } | null>(null);
  const [migration, setMigration] = useState<LegacyMigration>(idleMigration);
  // One migration attempt per unlock (or explicit retry). Cleared on lock, which
  // also stops a running migration.
  const migratedWith = useRef<CryptoKey | null>(null);
  const [migrationAttempt, setMigrationAttempt] = useState(0);
  // Editors persist their latest draft before the key is dropped.
  const flushers = useRef(new Set<() => void>());
  const row = query.data ?? null;

  // A different vault (reset or recreated elsewhere) invalidates the key in memory.
  const current = unlocked && row && unlocked.row.generacion === row.generacion ? unlocked : null;
  if (unlocked && query.isSuccess && !current) setUnlocked(null);

  const status: VaultStatus = query.isPending
    ? 'loading'
    : query.isError && !query.data
      ? 'error'
      : !row
        ? 'missing'
        : current
          ? 'unlocked'
          : 'locked';

  const lock = useCallback(() => {
    for (const flush of flushers.current) flush();
    migratedWith.current = null;
    setUnlocked(null);
    setMigration(idleMigration);
  }, []);
  // The key can also disappear without lock() (vault replaced in another session).
  useEffect(() => {
    if (!current) migratedWith.current = null;
  }, [current]);

  const registerFlush = useCallback((flush: () => void) => {
    flushers.current.add(flush);
    return () => {
      flushers.current.delete(flush);
    };
  }, []);
  const retryMigration = useCallback(() => {
    migratedWith.current = null;
    setMigrationAttempt((attempt) => attempt + 1);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['boveda', userId] }),
      queryClient.invalidateQueries({ queryKey: ['workspace', userId] }),
      queryClient.invalidateQueries({ queryKey: ['credenciales', userId] }),
    ]).catch(() => undefined);
  }, [queryClient, userId]);

  const handleError = useCallback(
    (cause: unknown) => {
      if (!isVaultChanged(cause)) return;
      lock();
      void refresh();
    },
    [lock, refresh],
  );

  const create = useCallback(
    async (password: string) => {
      if (!userId) throw new Error('Inicia sesión para crear la clave maestra.');
      const prepared = await createVault(password, userId);
      const payload = {
        generacion: crypto.randomUUID(),
        sal: prepared.sal,
        iteraciones: prepared.iteraciones,
        clave_envuelta: prepared.clave_envuelta,
      };
      let saved: VaultRow;
      try {
        saved = await executeCommand<VaultRow>('crear_boveda', payload, undefined, userId);
      } catch (cause) {
        // The reply may be lost after the vault was stored: check before failing.
        const stored = await loadVault(userId).catch(() => null);
        if (
          !stored ||
          stored.generacion !== payload.generacion ||
          stored.clave_envuelta !== payload.clave_envuelta
        )
          throw cause;
        saved = stored;
      }
      queryClient.setQueryData(['boveda', userId], saved);
      setUnlocked({ key: prepared.key, row: saved });
    },
    [queryClient, userId],
  );

  const unlock = useCallback(
    async (password: string) => {
      if (!userId) throw new Error('Inicia sesión para desbloquear.');
      // Use the stored vault, not a cached copy that another session may have replaced.
      const fresh = await loadVault(userId);
      queryClient.setQueryData(['boveda', userId], fresh);
      if (!fresh) throw new Error('Todavía no has creado una clave maestra.');
      const key = await unlockVault(password, userId, fresh);
      setUnlocked({ key, row: fresh });
    },
    [queryClient, userId],
  );

  const changePassword = useCallback(
    async (currentPassword: string, next: string) => {
      if (!userId) throw new Error('Inicia sesión para cambiar la clave maestra.');
      const fresh = await loadVault(userId);
      if (!fresh) throw new Error('Todavía no has creado una clave maestra.');
      const wrapped = await rewrapVault(currentPassword, next, userId, fresh);
      const payload = { generacion: fresh.generacion, version: fresh.version, ...wrapped };
      try {
        const saved = await executeCommand<VaultRow>('cambiar_clave', payload, undefined, userId);
        queryClient.setQueryData(['boveda', userId], saved);
        // Keep the key only if it belongs to the vault that was re-wrapped; a vault
        // recreated in another session has a different data key.
        setUnlocked((previous) =>
          previous && previous.row.generacion === saved.generacion
            ? { ...previous, row: saved }
            : null,
        );
      } catch (cause) {
        handleError(cause);
        throw cause;
      } finally {
        await refresh();
      }
    },
    [handleError, queryClient, refresh, userId],
  );

  const reset = useCallback(async () => {
    if (!userId) throw new Error('Inicia sesión para restablecer el cifrado.');
    const fresh = await loadVault(userId);
    if (!fresh) return;
    try {
      await executeCommand(
        'restablecer_boveda',
        { generacion: fresh.generacion, confirmacion: 'BORRAR' },
        undefined,
        userId,
      );
    } finally {
      lock();
      await refresh();
    }
  }, [lock, refresh, userId]);

  // Auto-lock after inactivity.
  useEffect(() => {
    if (!current) return;
    let timer = window.setTimeout(lock, VAULT_IDLE_MS);
    const activity = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, VAULT_IDLE_MS);
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const name of events) window.addEventListener(name, activity, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, activity);
    };
  }, [current, lock]);

  // Encrypt notes saved before the vault existed, one by one.
  const legacy = useMemo(
    () => (workspace.data?.notes ?? []).filter((note) => note.cifrado === null),
    [workspace.data?.notes],
  );
  useEffect(() => {
    if (!current || !userId || !legacy.length || migratedWith.current === current.key) return;
    migratedWith.current = current.key;
    const { key, row: vault } = current;
    const pending: NoteRow[] = legacy;
    setMigration({ total: pending.length, done: 0, failed: 0, running: true });
    void (async () => {
      let done = 0;
      let failed = 0;
      for (const note of pending) {
        // Locked (or the vault changed) while migrating: stop using this key.
        if (migratedWith.current !== key) break;
        try {
          const cifrado = await encryptNote(key, userId, note.id, note);
          await executeCommand(
            'guardar_nota',
            {
              id: note.id,
              version: note.version,
              cifrado,
              boveda_generacion: vault.generacion,
              proyecto_ids: note.proyecto_ids,
              tarea_ids: note.tarea_ids,
            },
            undefined,
            userId,
          );
          done += 1;
        } catch (cause) {
          failed += 1;
          if (isVaultChanged(cause)) {
            handleError(cause);
            break;
          }
        }
        setMigration({ total: pending.length, done, failed, running: true });
      }
      setMigration({ total: pending.length, done, failed, running: false });
      await queryClient
        .invalidateQueries({ queryKey: ['workspace', userId] })
        .catch(() => undefined);
    })();
  }, [current, legacy, queryClient, userId, handleError, migrationAttempt]);

  const value = useMemo<VaultState>(
    () => ({
      status,
      error: query.error,
      row,
      key: current?.key ?? null,
      generation: current?.row.generacion ?? null,
      migration,
      create,
      unlock,
      lock,
      changePassword,
      reset,
      reload: () => query.refetch(),
      handleError,
      registerFlush,
      retryMigration,
    }),
    [
      status,
      query,
      row,
      current,
      migration,
      create,
      unlock,
      lock,
      changePassword,
      reset,
      handleError,
      registerFlush,
      retryMigration,
    ],
  );
  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}
