import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { isPublicApiKey, isSupabaseUrl } from './clientConfig';
import { isLocalEdition } from '../edition';
import { generationFetch } from '../localGeneration';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const validUrl = isSupabaseUrl(url);
const validKey = isPublicApiKey(key);

export const configurationError = isLocalEdition
  ? null
  : validUrl && validKey
    ? null
    : 'Configura VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY en .env.local y reinicia la app.';

// Local edition: the same origin serves the app and the API (nginx → PostgREST at
// /rest/v1), so changing the port needs no rebuild. There are no accounts: the key
// is a placeholder that nginx strips, and the client keeps no session.
const client = isLocalEdition
  ? createClient<Database>(window.location.origin, 'chambapp-local', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: generationFetch },
    })
  : configurationError
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
