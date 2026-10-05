import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { isPublicApiKey, isSupabaseUrl } from './clientConfig';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const validUrl = isSupabaseUrl(url);
const validKey = isPublicApiKey(key);

export const configurationError =
  validUrl && validKey
    ? null
    : 'Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local y reinicia la app.';

const client = configurationError
  ? null
  : createClient<Database>(url!, key!, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

export function getSupabase() {
  if (!client) throw new Error(configurationError ?? 'Supabase no está configurado.');
  return client;
}
