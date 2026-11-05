import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CredentialRow } from '../../domain/models';
import { loadCredentials } from '../../lib/supabase/vault.repository';
import { useAuth } from '../auth/useAuth';
import { useVault } from '../vault/useVault';
import { openCredential } from './credentials.model';
import type { OpenCredential } from './credentials.model';

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
