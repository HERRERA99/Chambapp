const odooIdPattern = /^T[0-9]+$/;
const httpUrlPattern = /^https?:\/\//i;
const unsafeUrlCharacters = /[\s\\]/;

export function isOdooId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 64 && odooIdPattern.test(value);
}

export function normalizeOdooId(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  if (!normalized) return null;
  if (!isOdooId(normalized))
    throw new Error('El ID de Odoo debe ser T seguido de números, por ejemplo T443212.');
  return normalized;
}

export function isOdooUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    !httpUrlPattern.test(value) ||
    unsafeUrlCharacters.test(value)
  )
    return false;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return false;
  }
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function normalizeOdooUrl(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!isOdooUrl(normalized))
    throw new Error(
      'Introduce un enlace completo de Odoo con http:// o https://, sin credenciales ni espacios.',
    );
  const canonical = new URL(normalized).href;
  if (canonical.length > 2048)
    throw new Error('El enlace de Odoo no puede superar los 2048 caracteres.');
  return canonical;
}
