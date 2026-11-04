import { createContext, useContext } from 'react';
import type { VaultRow } from '../../domain/models';

export type VaultStatus = 'loading' | 'error' | 'missing' | 'locked' | 'unlocked';

export type LegacyMigration = { total: number; done: number; failed: number; running: boolean };

export type VaultState = {
  status: VaultStatus;
  error: unknown;
  row: VaultRow | null;
  /** Data key; only set while unlocked. It cannot be exported. */
  key: CryptoKey | null;
  /** Vault generation the key belongs to. */
  generation: string | null;
  /** Encryption of notes saved before the vault existed. */
  migration: LegacyMigration;
  create: (password: string) => Promise<void>;
  unlock: (password: string) => Promise<void>;
  lock: () => void;
  changePassword: (current: string, next: string) => Promise<void>;
  reset: () => Promise<void>;
  reload: () => Promise<unknown>;
  /** Locks and reloads when another session reset or replaced the vault. */
  handleError: (cause: unknown) => void;
  /** Registers a callback run synchronously just before the vault locks. */
  registerFlush: (flush: () => void) => () => void;
  /** Tries again to encrypt notes that are still stored in plaintext. */
  retryMigration: () => void;
};

export const VaultContext = createContext<VaultState | null>(null);

export function useVault(): VaultState {
  const value = useContext(VaultContext);
  if (!value) throw new Error('useVault debe usarse dentro de VaultProvider.');
  return value;
}

export function isVaultChanged(cause: unknown): boolean {
  const text =
    cause && typeof cause === 'object'
      ? `${(cause as { code?: unknown }).code ?? ''} ${(cause as { rawMessage?: unknown }).rawMessage ?? ''} ${(cause as { message?: unknown }).message ?? ''}`
      : String(cause);
  return /BOVEDA_CAMBIADA|NOTA_DEBE_CIFRARSE/.test(text);
}
