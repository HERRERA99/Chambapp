import { useEffect, useState } from 'react';
import { ask } from '../shared/messages';
import type { HeraSyncResult } from '../shared/messages';
import { HERA_ORIGIN, HERA_URL } from '../shared/hera';
import { originPattern } from '../shared/patterns';
import { Button, ErrorText, Notice } from '../shared/ui';
import { errorMessage } from '../shared/feedback';

const KIND = { entrada: 'Entrada', salida: 'Salida' } as const;

/** Adds the last clock-in/out shown in Hera as an attendance in Chambapp. */
export function FichajeView() {
  const [permission, setPermission] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<HeraSyncResult | null>(null);
  const origins = [originPattern(HERA_ORIGIN)];

  useEffect(() => {
    void chrome.permissions.contains({ origins: [originPattern(HERA_ORIGIN)] }).then(setPermission);
  }, []);

  async function grant() {
    setError('');
    try {
      setPermission(await chrome.permissions.request({ origins }));
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  async function sync() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(await ask<HeraSyncResult>({ type: 'hera-sync' }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <div>
        <p className="eyebrow">Fichaje</p>
        <h2>Añadir la hora fichada</h2>
        <p className="dim">
          Lee tu última acción en Hera ({new URL(HERA_URL).host}) y la registra en Chambapp: una
          entrada abre un fichaje y una salida cierra el que está abierto.
        </p>
      </div>
      {permission === false ? (
        <Notice title="Falta un permiso">
          <p className="dim">La extensión necesita poder leer Hera.</p>
          <Button onClick={() => void grant()}>Conceder permiso</Button>
        </Notice>
      ) : null}
      <Button
        variant="primary"
        block
        disabled={busy || permission !== true}
        onClick={() => void sync()}
      >
        {busy ? 'Leyendo Hera…' : 'Añadir mi último fichaje'}
      </Button>
      <ErrorText>{error}</ErrorText>
      {result ? (
        <div className="panel stack stack--tight" role="status">
          <p className="eyebrow">Hera</p>
          <p>
            <strong>{KIND[result.action.kind]}</strong>{' '}
            <span className="mono">
              {result.action.date.split('-').reverse().join('/')} {result.action.time}
            </span>
          </p>
          <p className={result.outcome === 'already' ? 'dim' : 'form-ok'}>{result.message}</p>
        </div>
      ) : null}
    </section>
  );
}
