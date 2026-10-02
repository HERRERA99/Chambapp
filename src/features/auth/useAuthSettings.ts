import { useQuery } from '@tanstack/react-query';
import { configurationError } from '../../lib/supabase/client';
import { loadAuthSettings } from './authSettings';

export function useAuthSettings() {
  return useQuery({
    queryKey: ['auth-settings', import.meta.env.VITE_SUPABASE_URL],
    queryFn: ({ signal }) => loadAuthSettings(signal),
    enabled: !configurationError,
    staleTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
  });
}
