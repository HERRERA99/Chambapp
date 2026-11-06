import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { loadWorkspace } from '../../lib/supabase/workspace.repository';
import { recombine, setLocalUser, subscribeLocal } from '../../lib/local/runtime';
import { useAuth } from '../auth/useAuth';
import { WorkspaceContext } from './useWorkspace';

function WorkspaceStateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const previousUserId = useRef(user?.id);
  useEffect(() => {
    if (previousUserId.current && previousUserId.current !== user?.id) {
      cache.removeQueries({ queryKey: ['workspace', previousUserId.current], exact: true });
    }
    previousUserId.current = user?.id;
    // The local data belongs to one account: another account never sees it.
    void setLocalUser(user?.id ?? null);
  }, [user?.id, cache]);
  // Local changes (this tab, another tab, unlock or lock) refresh the combined data.
  useEffect(
    () =>
      subscribeLocal(() => {
        if (!user) return;
        // Combine again with the cloud data already loaded: no network round trip.
        const combined = recombine(user.id);
        if (combined) cache.setQueryData(['workspace', user.id], combined);
        else void cache.invalidateQueries({ queryKey: ['workspace', user.id] });
      }),
    [user, cache],
  );
  const query = useQuery({
    queryKey: ['workspace', user?.id],
    queryFn: ({ signal }) => loadWorkspace(user!.id, signal),
    enabled: !!user,
    refetchInterval: user ? 30_000 : false,
  });
  return (
    <WorkspaceContext.Provider
      value={{
        data: query.data ?? null,
        isLoading: !!user && query.isPending,
        error: query.error,
        reload: query.refetch,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: true },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <WorkspaceStateProvider>{children}</WorkspaceStateProvider>
    </QueryClientProvider>
  );
}
