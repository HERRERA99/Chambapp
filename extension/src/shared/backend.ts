// Where the extension's data lives (Plan 12): the cloud (Supabase, with an account) or
// a local Chambapp installation (Docker on this PC, no accounts). Pure helpers.
import { DEFAULT_LOCAL_ORIGIN } from '../../../src/lib/localUser.ts';

export type Backend = 'nube' | 'local';
export { DEFAULT_LOCAL_ORIGIN };

/** Origin (scheme://host[:port]) of a local installation typed by the user. */
export function normalizeLocalOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`Escribe la dirección completa, por ejemplo ${DEFAULT_LOCAL_ORIGIN}.`);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    !url.hostname ||
    (url.pathname !== '/' && url.pathname !== '') ||
    url.search ||
    url.hash
  )
    throw new Error(
      `La dirección debe ser solo http(s)://equipo:puerto, por ejemplo ${DEFAULT_LOCAL_ORIGIN}.`,
    );
  return url.origin;
}

/**
 * Identity of the account the extension works with. Every local installation has
 * the same user id, so a local account is the installation and its data generation
 * (a restore changes it): work queued for one never runs against another.
 */
export function accountKey(
  input:
    | { backend: 'nube'; userId: string }
    | { backend: 'local'; origin: string; installation: string; generation: string },
): string {
  return input.backend === 'nube'
    ? `nube:${input.userId}`
    : `local:${input.origin}|${input.installation}|${input.generation}`;
}

/** Items stored before Plan 12 have no account: they belong to the cloud account of their user. */
export const itemAccount = (item: { account?: string; request: { userId: string } }) =>
  item.account ?? `nube:${item.request.userId}`;

/**
 * Whether `expected` still names the current account. Cloud callers may pass the bare
 * user id (as before Plan 12); local ones must pass the full account key.
 */
export function sameAccount(expected: string, current: string) {
  return expected === current || current === `nube:${expected}`;
}
