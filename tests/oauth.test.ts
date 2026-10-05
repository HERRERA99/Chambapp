import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAuthSettings } from '../src/features/auth/authSettingsModel.ts';
import {
  enabledOAuthProviders,
  oauthCredentials,
  oauthProviders,
} from '../src/features/auth/oauth.ts';
import { oauthCallbackError } from '../src/features/auth/errors.ts';

const origin = 'https://chambapp.example';

test('only explicitly enabled known OAuth providers are available, in a stable priority order', () => {
  const settings = parseAuthSettings({
    external: {
      github: true,
      google: true,
      apple: false,
      azure: 'true',
      snapchat: true,
      phone: true,
      invented: true,
      linkedin: true,
      linkedin_oidc: true,
    },
  });
  assert.deepEqual(
    enabledOAuthProviders(settings).map((item) => item.id),
    ['google', 'github', 'linkedin_oidc'],
  );
  assert.deepEqual(enabledOAuthProviders(undefined), []);
  assert.deepEqual(enabledOAuthProviders(parseAuthSettings({ external: { email: true } })), []);
  assert.equal(new Set(oauthProviders.map((item) => item.id)).size, oauthProviders.length);
});

test('the current project can use email while every social method is disabled', () => {
  const settings = parseAuthSettings({
    external: { email: true, google: false, github: false },
    disable_signup: false,
    mailer_autoconfirm: false,
  });
  assert.equal(settings.external.email, true);
  assert.equal(settings.disableSignup, false);
  assert.equal(settings.emailConfirmationRequired, true);
  assert.deepEqual(enabledOAuthProviders(settings), []);
});

test('X OAuth2 and legacy Twitter are gated independently by the public flags', () => {
  assert.deepEqual(
    enabledOAuthProviders(parseAuthSettings({ external: { x: true, twitter: false } })).map(
      (item) => item.id,
    ),
    ['x'],
  );
  assert.deepEqual(
    enabledOAuthProviders(parseAuthSettings({ external: { twitter: true } })).map(
      (item) => item.id,
    ),
    ['twitter'],
  );
});

test('disabled signups hide OAuth signup while preserving sign-in for existing users', () => {
  const settings = parseAuthSettings({ external: { google: true }, disable_signup: true });
  assert.deepEqual(enabledOAuthProviders(settings, true), []);
  assert.equal(enabledOAuthProviders(settings, false).length, 1);
  assert.throws(
    () => oauthCredentials('google', settings, '/resumen', origin, true),
    /no está disponible/,
  );
  assert.equal(oauthCredentials('google', settings, '/resumen', origin).provider, 'google');
});

test('OAuth sign-in and sign-up preserve the requested destination using the same callback', () => {
  const settings = parseAuthSettings({ external: { google: true } });
  const destination = '/tareas?proyecto=a#detalle';
  const credentials = oauthCredentials('google', settings, destination, origin);
  const callback = new URL(credentials.options!.redirectTo!);
  assert.equal(callback.origin, origin);
  assert.equal(callback.pathname, '/auth/callback');
  assert.equal(callback.searchParams.get('returnTo'), destination);
  assert.deepEqual(oauthCredentials('google', settings, destination, origin, true), credentials);
});

test('provider requests cannot redirect to an external destination or start disabled methods', () => {
  const settings = parseAuthSettings({ external: { google: true } });
  for (const destination of [
    'https://attacker.example',
    '//attacker.example',
    '/\\attacker.example',
    '/login',
    '/unknown',
  ]) {
    const callback = new URL(
      oauthCredentials('google', settings, destination, origin).options!.redirectTo!,
    );
    assert.equal(callback.searchParams.get('returnTo'), '/resumen');
  }
  assert.throws(
    () => oauthCredentials('github', settings, '/resumen', origin),
    /no está disponible/,
  );
});

test('Microsoft Azure requests the email scope required by Supabase Auth', () => {
  const settings = parseAuthSettings({ external: { azure: true, google: true } });
  assert.equal(oauthCredentials('azure', settings, '/fichajes', origin).options?.scopes, 'email');
  assert.equal(oauthCredentials('google', settings, '/resumen', origin).options?.scopes, undefined);
});

test('malformed settings fail visibly and credentials are excluded from the parsed state', () => {
  for (const invalid of [
    null,
    [],
    {},
    { external: null },
    { external: [] },
    { external: 'google' },
  ])
    assert.throws(() => parseAuthSettings(invalid), /formato esperado/);
  const settings = parseAuthSettings({
    external: { email: true, google: true, google_secret: 'private' },
    client_secret: 'private',
    mailer_autoconfirm: true,
  });
  assert.equal(JSON.stringify(settings).includes('private'), false);
  assert.equal(settings.emailConfirmationRequired, false);
  assert.equal(settings.external.email, true);
});

test('OAuth callback cancellation and provider errors are visible for query and fragment flows', () => {
  assert.match(oauthCallbackError('?error=access_denied', '')!, /cancelado/);
  assert.match(oauthCallbackError('', '#error=access_denied')!, /cancelado/);
  assert.equal(
    oauthCallbackError('?error_description=Provider+not+enabled', ''),
    'Este proveedor de acceso todavía no está habilitado. Elige otro método disponible.',
  );
  assert.equal(oauthCallbackError('?returnTo=%2Ftareas', '#access_token=token'), null);
});

test('Google requests account selection and maps expired PKCE callbacks to a retryable sign-in message', () => {
  const settings = parseAuthSettings({ external: { google: true, github: true } });
  assert.deepEqual(oauthCredentials('google', settings, '/resumen', origin).options?.queryParams, {
    prompt: 'select_account',
  });
  assert.equal(
    oauthCredentials('github', settings, '/resumen', origin).options?.queryParams,
    undefined,
  );
  assert.match(
    oauthCallbackError('?error_description=PKCE+code+verifier+not+found', '')!,
    /este navegador/,
  );
});
