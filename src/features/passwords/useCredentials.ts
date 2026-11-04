import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CredentialRow } from '../../domain/models';
import { credentialAad, decryptJson, encryptJson } from '../../lib/crypto/vault';
import { loadCredentials } from '../../lib/supabase/vault.repository';
import { useAuth } from '../auth/useAuth';
import { useVault } from '../vault/useVault';
import { parseCredential } from './credentials.model';
import type { CredentialSecret } from './credentials.model';

export type OpenCredential = { row: CredentialRow; secret: CredentialSecret | null };

export function encryptCredential(
  key: CryptoKey,
  userId: string,
  id: string,
  secret: CredentialSecret,
) {
  return encryptJson(key, credentialAad(userId, id), secret);
}

export async function openCredential(
  key: CryptoKey,
  userId: string,
  generation: string | null,
  row: CredentialRow,
): Promise<OpenCredential> {
  if (row.boveda_generacion !== generation) return { row, secret: null };
  try {
    return {
      row,
      secret: parseCredential(await decryptJson(key, credentialAad(userId, row.id), row.cifrado)),
    };
  } catch {
    return { row, secret: null };
  }
}

/** Credentials of live projects, decrypted with the unlocked vault. */
export function useCredentials() {
  const { user } = useAuth();
  const vault = useVault();
  const query = useQuery({
    queryKey: ['credenciales', user?.id],
    queryFn: ({ signal }) => loadCredentials(user!.id, signal),
    enabled: !!user && vault.status === 'unlocked',
    refetchOnMount: 'always',
  });
  const [opened, setOpened] = useState<{ rows: CredentialRow[]; items: OpenCredential[] } | null>(
    null,
  );
  const rows = query.data;
  const key = vault.key;
  const generation = vault.generation;
  useEffect(() => {
    if (!rows || !key || !user) return;
    let cancelled = false;
    void Promise.all(rows.map((row) => openCredential(key, user.id, generation, row))).then(
      (items) => {
        if (!cancelled) setOpened({ rows, items });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [rows, key, generation, user]);
  return {
    query,
    items: opened?.items ?? [],
    // After a refetch, the previous list stays visible until the new one is decrypted.
    ready: !!opened,
  };
}
