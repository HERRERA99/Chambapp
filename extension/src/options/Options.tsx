import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { AUTO_LOCK_OPTIONS, ask } from '../shared/messages';
import { originPattern } from '../shared/patterns';
import type { AutoLock, ExtensionState } from '../shared/messages';
import type { DateFormat } from '../shared/automation';
import { Button, ErrorText, Icon } from '../shared/ui';
import { DEFAULT_LOCAL_ORIGIN, normalizeLocalOrigin } from '../shared/backend';
import type { Backend } from '../shared/backend';
import { errorMessage } from '../shared/feedback';

const lockLabel = (minutes: AutoLock) =>
  minutes === 0 ? 'Al cerrar el navegador' : `Tras ${minutes} min sin usarla`;

function origin(value: string) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('La dirección debe empezar por http:// o https:// y no llevar usuario.');
  return url.origin;
}

export function Options() {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [odoo, setOdoo] = useState('');
  const [backend, setBackendChoice] = useState<Backend>('nube');
  const [localOrigin, setLocalOrigin] = useState(DEFAULT_LOCAL_ORIGIN);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    ask<ExtensionState>({ type: 'state' }).then(
      (value) => {
        setState(value);
        setOdoo(value.settings.odooOrigin ?? '');
        setBackendChoice(value.settings.backend);
        setLocalOrigin(value.settings.localOrigin);
      },
      (cause) => setError(errorMessage(cause)),
    );
  }, []);

  async function saveOdoo(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaved('');
    setBusy(true);
    try {
      let value: string | null = null;
      if (odoo.trim()) {
        value = origin(odoo);
        // Only this origin: requested here because Chrome needs the click.
        const granted = await chrome.permissions.request({ origins: [originPattern(value)] });
        if (!granted)
          throw new Error('Sin el permiso la extensión no puede leer ni rellenar tu Odoo.');
      }
      const next = await ask<ExtensionState>({ type: 'odoo-origin-set', origin: value });
      setState(next);
      setOdoo(next.settings.odooOrigin ?? '');
      setSaved(
        value
          ? `Odoo configurado: ${value}. Recarga las pestañas de Odoo abiertas.`
          : 'Odoo desactivado.',
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function saveBackend(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaved('');
    setBusy(true);
    try {
      const address = normalizeLocalOrigin(localOrigin || DEFAULT_LOCAL_ORIGIN);
      if (backend === 'local') {
        // Only this address: requested here because the browser needs the click.
        const granted = await chrome.permissions.request({ origins: [originPattern(address)] });
        if (!granted)
          throw new Error('Sin el permiso la extensión no puede hablar con Chambapp local.');
      }
      const next = await ask<ExtensionState>({
        type: 'backend-set',
        backend,
        localOrigin: address,
      });
      setState(next);
      setLocalOrigin(next.settings.localOrigin);
      if (backend === 'nube') setSaved('Conectada con tu cuenta en la nube.');
      else if (next.localProblem) setError(`Guardado. ${next.localProblem}`);
      else
        setSaved(
          `Conectada con Chambapp local en ${address}. Recarga las pestañas de Chambapp abiertas.`,
        );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function setFormat(format: DateFormat) {
    setError('');
    try {
      setState(await ask<ExtensionState>({ type: 'date-format-set', format }));
      setSaved('Formato de fecha guardado.');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function setLock(minutes: AutoLock) {
    setError('');
    try {
      setState(await ask<ExtensionState>({ type: 'settings-set', autoLockMinutes: minutes }));
      setSaved('Bloqueo automático guardado.');
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <main className="options stack">
      <header className="row">
        <span className="brand">
          <img src="/icons/icon-32.png" alt="" /> Chambapp
        </span>
        <span className="spacer" />
        <span className="badge">v{state?.version ?? '…'}</span>
      </header>
      <ErrorText>{error}</ErrorText>
      {saved ? (
        <p className="form-ok" role="status">
          {saved}
        </p>
      ) : null}

      <section className="panel stack">
        <div>
          <p className="eyebrow">Conexión</p>
          <h2>¿Dónde están tus datos?</h2>
          <p className="muted">
            En la nube (tu cuenta de Chambapp) o en Chambapp local, la versión que corre en Docker
            en tu PC.
          </p>
        </div>
        <form className="stack" onSubmit={saveBackend}>
          <div className="stack stack--tight" role="radiogroup" aria-label="Conexión">
            <label className="row">
              <input
                type="radio"
                name="backend"
                checked={backend === 'nube'}
                disabled={busy}
                onChange={() => setBackendChoice('nube')}
              />
              Nube (cuenta de Chambapp)
            </label>
            <label className="row">
              <input
                type="radio"
                name="backend"
                checked={backend === 'local'}
                disabled={busy}
                onChange={() => setBackendChoice('local')}
              />
              Local (Docker en este PC)
            </label>
          </div>
          {backend === 'local' ? (
            <div className="field">
              <label htmlFor="local-origin">Dirección de Chambapp local</label>
              <input
                id="local-origin"
                type="url"
                placeholder={DEFAULT_LOCAL_ORIGIN}
                value={localOrigin}
                onChange={(event) => setLocalOrigin(event.target.value)}
                disabled={busy}
              />
              <span className="field__hint">
                La misma que abres en el navegador (por defecto {DEFAULT_LOCAL_ORIGIN}).
              </span>
            </div>
          ) : null}
          <p className="field__hint">
            Al cambiar se bloquea la bóveda y los envíos a Odoo de la otra conexión quedan apartados
            hasta que vuelvas a ella.
          </p>
          <div className="row">
            <Button type="submit" variant="primary" disabled={busy}>
              {backend === 'local' ? 'Guardar y probar conexión' : 'Guardar'}
            </Button>
          </div>
        </form>
      </section>

      <section className="panel stack">
        <div>
          <p className="eyebrow">Partes de horas</p>
          <h2>Tu Odoo</h2>
          <p className="muted">
            La extensión solo accede a esta dirección: detecta las tareas y crea las líneas de horas
            usando la propia web de Odoo (sin API).
          </p>
        </div>
        <form className="stack" onSubmit={saveOdoo}>
          <div className="field">
            <label htmlFor="odoo">Dirección de Odoo</label>
            <input
              id="odoo"
              type="url"
              placeholder="https://empresa.odoo.com"
              value={odoo}
              onChange={(event) => setOdoo(event.target.value)}
              disabled={busy}
            />
            <span className="field__hint">
              {state?.settings.odooOrigin
                ? state.odooPermission
                  ? `Permiso concedido para ${state.settings.odooOrigin}.`
                  : `Falta el permiso para ${state.settings.odooOrigin}: guarda de nuevo para concederlo.`
                : 'Déjalo vacío para desactivar las funciones de Odoo.'}
            </span>
          </div>
          <div className="row">
            <Button type="submit" variant="primary" disabled={busy}>
              Guardar y conceder permiso
            </Button>
          </div>
        </form>
        <div className="field">
          <label htmlFor="date-format">Formato de fecha en tu Odoo</label>
          <select
            id="date-format"
            value={state?.settings.odooDateFormat ?? 'dmy'}
            onChange={(event) => void setFormat(event.target.value as DateFormat)}
          >
            <option value="dmy">dd/mm/aaaa (español)</option>
            <option value="mdy">mm/dd/aaaa (inglés EE. UU.)</option>
            <option value="ymd">aaaa-mm-dd</option>
          </select>
          <span className="field__hint">
            Como se ven las fechas en los partes de horas de Odoo. Se usa para escribir la fecha y
            comprobar que la línea se guardó con ese día.
          </span>
        </div>
      </section>

      <section className="panel stack">
        <div>
          <p className="eyebrow">Contraseñas</p>
          <h2>Bloqueo automático</h2>
          <p className="muted">
            Mientras la bóveda está abierta, la clave vive solo en la memoria del navegador.
          </p>
        </div>
        <div className="stack stack--tight" role="radiogroup" aria-label="Bloqueo automático">
          {AUTO_LOCK_OPTIONS.map((minutes) => (
            <label key={minutes} className="row">
              <input
                type="radio"
                name="lock"
                checked={state?.settings.autoLockMinutes === minutes}
                onChange={() => void setLock(minutes)}
              />
              {lockLabel(minutes)}
            </label>
          ))}
        </div>
      </section>

      <section className="panel stack">
        <div>
          <p className="eyebrow">Cuenta</p>
          <h2>Chambapp</h2>
        </div>
        <p className="row">
          <Icon name="user" size={16} />
          {state?.user
            ? (state.user.email ?? state.user.id)
            : state?.settings.backend === 'local'
              ? (state.localProblem ?? 'Sin conexión con Chambapp local.')
              : 'Sin sesión: inicia sesión desde el icono de la extensión.'}
        </p>
        {state?.user && state.settings.backend !== 'local' ? (
          <div className="row">
            <Button
              icon="logout"
              onClick={() => void ask<ExtensionState>({ type: 'sign-out' }).then(setState)}
            >
              Cerrar sesión
            </Button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
