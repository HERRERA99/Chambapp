import { assertVault } from '../../../src/lib/supabase/rowValidation';
import {
  exportRawKey,
  importRawKey,
  unlockVaultExtractable,
  WrongMasterPasswordError,
} from '../../../src/lib/crypto/vault';
import type { VaultRow } from '../../../src/domain/models';
import { fail, requireUser, supabase } from './supabase';
import { getSettings } from './settings';

/** In-memory only (chrome.storage.session): gone when the browser closes. */
const SESSION_KEY = 'chambapp_vault_v1';
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 30_000;

type Unlocked = { raw: string; generation: string; userId: string; expiresAt: number | null };

let cached: { key: CryptoKey; state: Unlocked } | null = null;
/**
 * Bumped by every lock. An operation that started before a lock must not write
 * the key back, publish decrypted entries or return secrets afterwards.
 */
let epoch = 0;
export const vaultEpoch = () => epoch;
export const VAULT_LOCKED = 'La bóveda está bloqueada.';

/** Throws when a lock happened since `since` (the epoch read at the start of an operation). */
export function assertSameEpoch(since: number) {
  if (since !== epoch) throw new Error(VAULT_LOCKED);
}
let failures = 0;
let blockedUntil = 0;

async function readSession(): Promise<Unlocked | null> {
  const value = (await chrome.storage.session.get(SESSION_KEY))[SESSION_KEY] as
    Unlocked | undefined;
  return value && typeof value.raw === 'string' ? value : null;
}

async function expiry() {
  const { autoLockMinutes } = await getSettings();
  return autoLockMinutes === 0 ? null : Date.now() + autoLockMinutes * 60_000;
}

export async function loadVaultRow(userId: string): Promise<VaultRow | null> {
  const { data, error, status } = await supabase
    .from('bovedas')
    .select('*')
    .eq('usuario_id', userId)
    .abortSignal(AbortSignal.timeout(20_000))
    .maybeSingle();
  if (error) fail(error, status);
  if (!data) return null;
  assertVault(data);
  return data;
}

const lockListeners = new Set<() => void>();
/** Runs on every lock (manual, automatic, sign-out, account change, vault reset). */
export const onLock = (listener: () => void) => lockListeners.add(listener);

export async function lock() {
  epoch += 1;
  cached = null;
  await chrome.storage.session.remove(SESSION_KEY);
  lockListeners.forEach((listener) => listener());
}

/** A new auto-lock choice applies at once to an open vault (never keeps a longer expiry). */
export async function applyAutoLock() {
  const since = epoch;
  const state = await readSession();
  if (!state) return;
  const next = { ...state, expiresAt: await expiry() };
  if (since !== epoch) return;
  await chrome.storage.session.set({ [SESSION_KEY]: next });
  if (cached) cached.state = next;
}

export async function unlock(password: string) {
  const user = await requireUser();
  if (Date.now() < blockedUntil)
    throw new Error(
      `Demasiados intentos. Espera ${Math.ceil((blockedUntil - Date.now()) / 1000)} s.`,
    );
  const row = await loadVaultRow(user.id);
  if (!row) throw new Error('Todavía no tienes clave maestra: créala en Chambapp → Contraseñas.');
  let key: CryptoKey;
  try {
    key = await unlockVaultExtractable(password, user.id, row);
  } catch (cause) {
    if (cause instanceof WrongMasterPasswordError) {
      failures += 1;
      if (failures >= MAX_ATTEMPTS) {
        failures = 0;
        blockedUntil = Date.now() + COOLDOWN_MS;
      }
    }
    throw cause;
  }
  failures = 0;
  const state: Unlocked = {
    raw: await exportRawKey(key),
    generation: row.generacion,
    userId: user.id,
    expiresAt: await expiry(),
  };
  await chrome.storage.session.set({ [SESSION_KEY]: state });
  cached = { key: await importRawKey(state.raw), state };
  epoch += 1;
}

/** Unlocked key for the signed-in user, renewing the inactivity timer; null when locked. */
export async function unlockedKey(userId: string, touch = true) {
  const since = epoch;
  const state = await readSession();
  if (!state) {
    cached = null;
    return null;
  }
  if (state.userId !== userId || (state.expiresAt !== null && Date.now() >= state.expiresAt)) {
    await lock();
    return null;
  }
  const key = cached && cached.state.raw === state.raw ? cached.key : await importRawKey(state.raw);
  let current = state;
  if (touch) current = { ...state, expiresAt: await expiry() };
  // A lock while we awaited wins: never write the key back or hand it out.
  if (since !== epoch) return null;
  if (touch) await chrome.storage.session.set({ [SESSION_KEY]: current });
  if (since !== epoch) {
    await chrome.storage.session.remove(SESSION_KEY);
    return null;
  }
  cached = { key, state: current };
  return { key, generation: state.generation, epoch: since };
}

/** Locks when the inactivity time has passed (checked by the periodic alarm). */
export async function lockIfExpired() {
  const state = await readSession();
  if (state && state.expiresAt !== null && Date.now() >= state.expiresAt) await lock();
}

/**
 * Locks when the vault was reset or recreated elsewhere (missing row or new
 * generation). Called before every disclosure of a secret.
 */
export async function assertCurrentGeneration(userId: string, generation: string) {
  const row = await loadVaultRow(userId);
  if (!row || row.generacion !== generation) {
    await lock();
    throw new Error('La bóveda se ha restablecido o cambiado en Chambapp. Vuelve a desbloquearla.');
  }
}

/** Status for the popup; locks if the vault was reset in the app (new generation). */
export async function vaultStatus(userId: string): Promise<'none' | 'locked' | 'unlocked'> {
  const unlocked = await unlockedKey(userId, false);
  const row = await loadVaultRow(userId).catch(() => undefined);
  if (row === null) {
    await lock();
    return 'none';
  }
  if (!unlocked) return 'locked';
  if (row && row.generacion !== unlocked.generation) {
    await lock();
    return 'locked';
  }
  return 'unlocked';
}
