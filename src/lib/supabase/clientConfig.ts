/** Only publishable keys or legacy anon JWTs may be bundled into a public client. */
export function isPublicApiKey(key: string | undefined): boolean {
  if (!key || key.includes('your_key')) return false;
  if (key.startsWith('sb_publishable_')) return key.length > 'sb_publishable_'.length;
  try {
    const parts = key.split('.');
    if (parts.length !== 3 || !parts[1]) return false;
    const claims: unknown = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return !!claims && typeof claims === 'object' && 'role' in claims && claims.role === 'anon';
  } catch {
    return false;
  }
}

export function isSupabaseUrl(value: string | undefined): boolean {
  if (!value || value.includes('your-project')) return false;
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !!url.hostname &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}
