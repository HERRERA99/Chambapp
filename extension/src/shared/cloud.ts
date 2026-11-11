// Whether this build of the extension can use the cloud (Supabase). Builds made without
// VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (for example the one packaged in the
// Chambapp local Docker image) only work with a local installation.
import { isPublicApiKey, isSupabaseUrl } from '../../../src/lib/supabase/clientConfig';

const configuredUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const configuredKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const cloudAvailable = isSupabaseUrl(configuredUrl) && isPublicApiKey(configuredKey);

/** Never contacted when the cloud is unavailable: every cloud path checks `cloudAvailable`. */
export const cloudUrl = cloudAvailable
  ? configuredUrl!.replace(/\/+$/, '')
  : 'https://nube-no-disponible.invalid';
export const cloudKey = cloudAvailable ? configuredKey! : 'sb_publishable_no_disponible';

/** Connection used until the user picks one: local in builds made for Chambapp local. */
export const defaultBackend: 'nube' | 'local' =
  !cloudAvailable || import.meta.env.VITE_EXTENSION_DEFAULT_BACKEND === 'local' ? 'local' : 'nube';
