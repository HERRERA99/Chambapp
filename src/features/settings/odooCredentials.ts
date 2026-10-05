import { getSupabase } from '../../lib/supabase/client';

export async function configureOdoo(apiKey?: string, save = false): Promise<boolean> {
  const { data, error } = await getSupabase()
    .rpc('chambapp_configurar_odoo', {
      ...(apiKey !== undefined ? { p_api_key: apiKey.trim() } : {}),
      p_guardar: save,
    })
    .abortSignal(AbortSignal.timeout(20_000));
  // Do not expose database diagnostics that could contain credentials.
  if (error || typeof data !== 'boolean')
    throw new Error('No se pudo confirmar la configuración de Odoo. Vuelve a intentarlo.');
  return data;
}
