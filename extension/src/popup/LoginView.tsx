import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { enabledOAuthProviders } from '../../../src/features/auth/oauth';
import type { OAuthProviderDefinition } from '../../../src/features/auth/oauth';
import { parseAuthSettings } from '../../../src/features/auth/authSettingsModel';
import { ask } from '../shared/messages';
import type { ExtensionState } from '../shared/messages';
import { Button, ErrorText } from '../shared/ui';
import { errorMessage } from '../shared/feedback';

async function loadProviders(): Promise<readonly OAuthProviderDefinition[]> {
  const url = String(import.meta.env.VITE_SUPABASE_URL).replace(/\/+$/, '');
  const response = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) },
  });
  if (!response.ok) return [];
  return enabledOAuthProviders(parseAuthSettings(await response.json()));
}

export function LoginView({ onSignedIn }: { onSignedIn: (state: ExtensionState) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [providers, setProviders] = useState<readonly OAuthProviderDefinition[]>([]);

  useEffect(() => {
    void loadProviders()
      .then(setProviders)
      .catch(() => setProviders([]));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onSignedIn(await ask<ExtensionState>({ type: 'sign-in-password', email, password }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function provider(id: string) {
    setBusy(true);
    setError('');
    try {
      onSignedIn(await ask<ExtensionState>({ type: 'sign-in-oauth', provider: id }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <p className="eyebrow">Extensión</p>
        <h1>Conecta tu cuenta</h1>
        <p className="muted">Usa la misma cuenta que en Chambapp.</p>
      </div>
      <form className="stack" onSubmit={submit}>
        <div className="field">
          <label htmlFor="email">Correo</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={busy}
          />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={busy}
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" variant="primary" block disabled={busy}>
          {busy ? 'Conectando…' : 'Iniciar sesión'}
        </Button>
      </form>
      {providers.length ? (
        <>
          <p className="divider">o continúa con</p>
          <div className="provider-grid">
            {providers.map((item) => (
              <Button key={item.id} disabled={busy} onClick={() => void provider(item.id)}>
                <span className="mono">{item.monogram}</span> {item.label}
              </Button>
            ))}
          </div>
          {busy ? (
            <p className="field__hint">
              Si se abre una ventana de acceso, complétala; después vuelve a abrir la extensión.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
