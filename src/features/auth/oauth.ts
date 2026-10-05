import type { Provider, SignInWithOAuthCredentials } from '@supabase/supabase-js';
import type { AuthSettings } from './authSettingsModel.ts';
import { safeReturnTo } from './returnTo.ts';
import { paths } from '../../app/paths.ts';

type BuiltInProvider = Exclude<Provider, `custom:${string}` | 'linkedin'>;
export type OAuthProviderDefinition = {
  id: BuiltInProvider;
  label: string;
  monogram: string;
  scopes?: string;
};

/** The installed Supabase SDK validates these identifiers. Prefer current OIDC/OAuth2 providers. */
export const oauthProviders: readonly OAuthProviderDefinition[] = [
  { id: 'google', label: 'Google', monogram: 'G' },
  { id: 'apple', label: 'Apple', monogram: 'A' },
  { id: 'azure', label: 'Microsoft', monogram: 'M', scopes: 'email' },
  { id: 'github', label: 'GitHub', monogram: 'GH' },
  { id: 'facebook', label: 'Facebook', monogram: 'f' },
  { id: 'x', label: 'X', monogram: 'X' },
  { id: 'linkedin_oidc', label: 'LinkedIn', monogram: 'in' },
  { id: 'discord', label: 'Discord', monogram: 'D' },
  { id: 'gitlab', label: 'GitLab', monogram: 'GL' },
  { id: 'bitbucket', label: 'Bitbucket', monogram: 'B' },
  { id: 'slack_oidc', label: 'Slack', monogram: 'S' },
  { id: 'notion', label: 'Notion', monogram: 'N' },
  { id: 'figma', label: 'Figma', monogram: 'F' },
  { id: 'spotify', label: 'Spotify', monogram: 'S' },
  { id: 'twitch', label: 'Twitch', monogram: 'T' },
  { id: 'zoom', label: 'Zoom', monogram: 'Z' },
  { id: 'kakao', label: 'Kakao', monogram: 'K' },
  { id: 'keycloak', label: 'Keycloak', monogram: 'KC' },
  { id: 'workos', label: 'WorkOS', monogram: 'W' },
  { id: 'fly', label: 'Fly.io', monogram: 'Fly' },
  { id: 'twitter', label: 'X / Twitter (clásico)', monogram: 'X' },
  { id: 'slack', label: 'Slack (clásico)', monogram: 'S' },
];

export function enabledOAuthProviders(settings: AuthSettings | undefined, register = false) {
  if (!settings || (register && settings.disableSignup)) return [];
  return oauthProviders.filter((provider) => settings.external[provider.id] === true);
}

/** Both sign-in and sign-up use Supabase's OAuth flow; it creates eligible new accounts. */
export function oauthCredentials(
  provider: BuiltInProvider,
  settings: AuthSettings | undefined,
  returnTo: string,
  origin: string,
  register = false,
): SignInWithOAuthCredentials {
  const definition = enabledOAuthProviders(settings, register).find((item) => item.id === provider);
  if (!definition) throw new Error('Este método de acceso no está disponible. Elige otro.');
  const callback = new URL(paths.authCallback, origin);
  callback.searchParams.set('returnTo', safeReturnTo(returnTo, callback.origin));
  return {
    provider,
    options: {
      redirectTo: callback.href,
      ...(definition.scopes ? { scopes: definition.scopes } : {}),
      ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}),
    },
  };
}
