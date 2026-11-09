import { useEffect, useRef, useState } from 'react';
import { ask } from '../shared/messages';
import type { ExtensionState } from '../shared/messages';
import { Button, ErrorText, Icon, IconButton } from '../shared/ui';
import { errorMessage } from '../shared/feedback';
import { LoginView } from './LoginView';
import { OdooView } from './OdooView';
import { PasswordsView } from './PasswordsView';
import { FichajeView } from './FichajeView';

type Tab = 'odoo' | 'passwords' | 'fichaje';

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

export function App() {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab | null>(null);
  const [browserTab, setBrowserTab] = useState<chrome.tabs.Tab | null>(null);
  const [menu, setMenu] = useState(false);
  /** Time of the last lock: older state answers must not reopen the vault view. */
  const lockedAt = useRef(0);

  useEffect(() => {
    ask<ExtensionState>({ type: 'state' }).then(setState, (cause: unknown) =>
      setError(errorMessage(cause)),
    );
    void activeTab().then(setBrowserTab);
    // A lock (manual, automatic or from another page) closes every view with secrets.
    const listener = (message: { channel?: string }) => {
      if (message?.channel !== 'vault-locked') return;
      // Hide every secret view now; the full state (slower, network) follows.
      lockedAt.current = Date.now();
      setState((current) =>
        current && current.vault === 'unlocked' ? { ...current, vault: 'locked' } : current,
      );
      const asked = Date.now();
      ask<ExtensionState>({ type: 'state' }).then(
        (next) => {
          if (asked >= lockedAt.current) setState(next);
        },
        () => undefined,
      );
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Opens on "Odoo" when the active tab is a detected Odoo task.
  useEffect(() => {
    if (tab || !state?.user || !browserTab) return;
    void chrome.action
      .getBadgeText({ tabId: browserTab.id })
      .then((text) => setTab(text === '+' ? 'odoo' : 'passwords'))
      .catch(() => setTab('passwords'));
  }, [state, browserTab, tab]);

  async function run(request: Parameters<typeof ask>[0]) {
    setMenu(false);
    if (request.type === 'vault-lock' || request.type === 'sign-out') {
      lockedAt.current = Date.now();
      setState((current) => (current ? { ...current, vault: 'locked' } : current));
    }
    try {
      setState(await ask<ExtensionState>(request));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="popup">
      <header className="popup__header">
        <span className="brand">
          <img src="/icons/icon-32.png" alt="" />
          Chambapp
        </span>
        <span className="popup__account dim truncate">{state?.user?.email ?? ''}</span>
        {state?.user ? (
          <IconButton
            icon="more"
            label="Menú"
            aria-expanded={menu}
            onClick={() => setMenu(!menu)}
          />
        ) : (
          <IconButton
            icon="settings"
            label="Ajustes"
            onClick={() => void chrome.runtime.openOptionsPage()}
          />
        )}
        {menu ? (
          <div className="menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => void chrome.runtime.openOptionsPage()}
            >
              <Icon name="settings" size={14} /> Ajustes
            </button>
            {state?.vault === 'unlocked' ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => void run({ type: 'vault-lock' })}
              >
                <Icon name="lock" size={14} /> Bloquear bóveda
              </button>
            ) : null}
            {state?.settings.backend === 'local' ? null : (
              <button type="button" role="menuitem" onClick={() => void run({ type: 'sign-out' })}>
                <Icon name="logout" size={14} /> Cerrar sesión
              </button>
            )}
          </div>
        ) : null}
      </header>
      {!state ? (
        <div className="popup__body">
          {error ? <ErrorText>{error}</ErrorText> : <p className="dim">Cargando…</p>}
        </div>
      ) : !state.user && state.settings.backend === 'local' ? (
        <div className="popup__body stack">
          <p className="dim">Modo local · {state.settings.localOrigin}</p>
          <ErrorText>{state.localProblem ?? 'No se puede conectar con Chambapp local.'}</ErrorText>
          <div className="row">
            <Button onClick={() => void run({ type: 'state' })}>Reintentar</Button>
            <Button onClick={() => void chrome.runtime.openOptionsPage()}>Ajustes</Button>
          </div>
        </div>
      ) : !state.user ? (
        <div className="popup__body">
          <LoginView onSignedIn={setState} />
        </div>
      ) : (
        <>
          <nav className="popup__tabs" aria-label="Secciones">
            <div className="segmented">
              <button type="button" aria-pressed={tab === 'odoo'} onClick={() => setTab('odoo')}>
                <Icon name="clock" size={14} /> Odoo
              </button>
              <button
                type="button"
                aria-pressed={tab === 'passwords'}
                onClick={() => setTab('passwords')}
              >
                <Icon name="key" size={14} /> Contraseñas
              </button>
              <button
                type="button"
                aria-pressed={tab === 'fichaje'}
                onClick={() => setTab('fichaje')}
              >
                <Icon name="timer" size={14} /> Fichaje
              </button>
            </div>
          </nav>
          <main className="popup__body">
            <ErrorText>{error}</ErrorText>
            {tab === 'odoo' ? <OdooView state={state} tab={browserTab} /> : null}
            {tab === 'fichaje' ? <FichajeView /> : null}
            {tab === 'passwords' ? (
              <PasswordsView state={state} tab={browserTab} onState={setState} />
            ) : null}
          </main>
        </>
      )}
    </div>
  );
}
