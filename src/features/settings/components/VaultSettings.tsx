import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from '../../../shared/ui/Button';
import { InputField } from '../../../shared/ui/FormField';
import { Panel, Notice } from '../../../shared/ui/Panel';
import { Modal } from '../../../shared/ui/Modal';
import { readableError } from '../../../lib/supabase/errors';
import { MIN_MASTER_PASSWORD_LENGTH } from '../../../lib/crypto/vault';
import { useFeedback } from '../../../shared/feedback/FeedbackContext';
import { useVault } from '../../vault/useVault';
import { useWorkspace } from '../../workspace/useWorkspace';
import { downloadBackup } from '../../local/localData';

/** Master password: change it (the data key is re-wrapped) or reset all encrypted data. */
export function VaultSettings({ disabled = false }: { disabled?: boolean }) {
  const vault = useVault();
  const notify = useFeedback();
  const { data } = useWorkspace();
  // Local projects, tasks and entries are encrypted with this vault's key.
  const localState = data?.local?.estado;
  const hasLocalData =
    localState === 'bloqueado' || (localState === 'abierto' && (data?.local?.proyectos ?? 0) > 0);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const [resetError, setResetError] = useState('');
  // Typed master passwords do not outlive the unlocked session (lock, auto-lock or
  // a vault replaced elsewhere).
  const [seenKey, setSeenKey] = useState(vault.key);
  if (seenKey !== vault.key) {
    setSeenKey(vault.key);
    if (!vault.key) {
      setCurrent('');
      setNext('');
      setConfirmation('');
      setResetText('');
    }
  }

  // Settings is already one <form>: these groups submit themselves with Enter.
  function onEnter(action: () => void) {
    return (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
      event.preventDefault();
      action();
    };
  }

  async function change() {
    if (busy || disabled) return;
    setError('');
    if ([...next].length < MIN_MASTER_PASSWORD_LENGTH) {
      setError(`La nueva clave debe tener al menos ${MIN_MASTER_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (next !== confirmation) {
      setError('Las dos claves nuevas no coinciden.');
      return;
    }
    setBusy(true);
    try {
      await vault.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirmation('');
      notify('Clave maestra actualizada.');
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (resetText !== 'BORRAR' || busy) return;
    setBusy(true);
    setResetError('');
    try {
      await vault.reset();
      setResetOpen(false);
      setResetText('');
      notify('Cifrado restablecido. Crea una nueva clave maestra.');
    } catch (cause) {
      setResetError(readableError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel id="cifrado" title="Clave maestra" eyebrow="Notas y contraseñas cifradas" icon="key">
      {vault.status === 'missing' ? (
        <p className="section-intro muted">
          Todavía no has creado una clave maestra. Se crea la primera vez que abres Notas o
          Contraseñas.
        </p>
      ) : vault.status === 'loading' || vault.status === 'error' ? (
        <p className="section-intro muted">Comprobando el cifrado…</p>
      ) : (
        <>
          <p className="section-intro muted">
            Tus notas y contraseñas se cifran en este navegador con tu clave maestra. Cambiarla no
            vuelve a cifrar los datos: solo protege la llave con la nueva clave.
          </p>
          <div
            className="vault-settings__form"
            role="group"
            aria-label="Cambiar clave maestra"
            onKeyDown={onEnter(() => void change())}
          >
            <InputField
              label="Clave maestra actual"
              type="password"
              autoComplete="current-password"
              value={current}
              required
              disabled={busy || disabled}
              onChange={(event) => setCurrent(event.target.value)}
            />
            <InputField
              label="Nueva clave maestra"
              type="password"
              autoComplete="new-password"
              value={next}
              minLength={MIN_MASTER_PASSWORD_LENGTH}
              required
              disabled={busy || disabled}
              hint={`Mínimo ${MIN_MASTER_PASSWORD_LENGTH} caracteres.`}
              onChange={(event) => setNext(event.target.value)}
            />
            <InputField
              label="Repite la nueva clave"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              required
              disabled={busy || disabled}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="actions">
              <Button icon="key" disabled={busy || disabled} onClick={() => void change()}>
                {busy ? 'Guardando…' : 'Cambiar clave maestra'}
              </Button>
            </div>
          </div>
          <Notice title="¿Has olvidado la clave maestra?" icon="info">
            <p>
              No se puede recuperar. Puedes restablecer el cifrado: se borrarán todas tus notas
              cifradas y todas tus contraseñas guardadas, y podrás crear una clave nueva.
            </p>
            <Button
              variant="danger"
              icon="trash"
              disabled={busy || disabled}
              onClick={() => setResetOpen(true)}
            >
              Restablecer cifrado
            </Button>
          </Notice>
        </>
      )}
      <Modal
        open={resetOpen}
        onClose={() => {
          if (!busy) setResetOpen(false);
        }}
        title="Restablecer cifrado"
        description="Se eliminarán de forma permanente todas tus notas cifradas y todas tus contraseñas. Esta acción no se puede deshacer."
      >
        <div className="vault-settings__form" onKeyDown={onEnter(() => void reset())}>
          {hasLocalData ? (
            <Notice title="También dejarás de poder leer tus datos locales">
              Los proyectos, tareas y partes guardados en este navegador están cifrados con esta
              clave. Después solo podrás recuperarlos importando una copia de seguridad.{' '}
              {localState === 'abierto' ? (
                <Button
                  variant="ghost"
                  icon="download"
                  disabled={busy}
                  onClick={() =>
                    void downloadBackup().then(
                      () => notify('Copia de seguridad descargada.'),
                      (cause) => setResetError(readableError(cause)),
                    )
                  }
                >
                  Descargar copia antes
                </Button>
              ) : (
                'Desbloquea antes la bóveda si quieres descargar una copia.'
              )}
            </Notice>
          ) : null}
          <InputField
            label="Escribe BORRAR para confirmar"
            value={resetText}
            autoComplete="off"
            disabled={busy}
            onChange={(event) => setResetText(event.target.value)}
          />
          {resetError ? (
            <p className="form-error" role="alert">
              {resetError}
            </p>
          ) : null}
          <div className="actions">
            <Button disabled={busy} onClick={() => setResetOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              disabled={busy || resetText !== 'BORRAR'}
              onClick={() => void reset()}
            >
              {busy ? 'Borrando…' : 'Borrar datos cifrados'}
            </Button>
          </div>
        </div>
      </Modal>
    </Panel>
  );
}
