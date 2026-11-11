import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Profile, WorkspaceData } from '../../domain/models';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Modal } from '../../shared/ui/Modal';
import { readableError } from '../../lib/supabase/errors';
import { askPersistence } from '../../lib/local/runtime';
import { LOCAL_EDITION_DOCS } from '../../lib/project';
import { useCommand } from '../workspace/useCommand';
import { useVault } from '../vault/useVault';
import { VaultUnlockCard } from '../vault/VaultGate';
import './local.css';

type Step = 'intro' | 'key' | 'saving' | 'done';

/**
 * "Guardar en este navegador" in one place: what it means, the master key (created or
 * unlocked here, only if needed) and the preference saved at once, plus the request
 * for persistent storage. No separate "Guardar" afterwards. Mount it only while open
 * (its steps start again each time).
 */
export function LocalModeDialog({
  open,
  data,
  onClose,
  onSaved,
}: {
  open: boolean;
  data: WorkspaceData;
  onClose: () => void;
  /** The profile was saved with almacenamiento = 'local'. */
  onSaved?: (profile: Profile) => void;
}) {
  const vault = useVault();
  const { run } = useCommand();
  const [step, setStep] = useState<Step>('intro');
  const [error, setError] = useState('');
  const started = useRef(false);
  const localOpen = data.local?.estado === 'abierto' || data.local?.estado === 'sin-datos';

  // As soon as the key is in this tab (and the local store opened with it), save.
  useEffect(() => {
    if (!open || step !== 'key' || vault.status !== 'unlocked' || !localOpen) return;
    void activate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, vault.status, localOpen]);

  async function activate() {
    if (started.current) return;
    started.current = true;
    setStep('saving');
    setError('');
    try {
      const profile = await run<Profile>('editar_perfil', {
        version: data.profile.version,
        preferencias: { ...data.profile.preferencias, almacenamiento: 'local' },
      });
      // Ask the browser not to evict the data; Chromium decides silently.
      void askPersistence().catch(() => null);
      onSaved?.(profile);
      setStep('done');
    } catch (cause) {
      started.current = false;
      setError(readableError(cause));
      setStep('intro');
    }
  }

  function next() {
    if (vault.status === 'unlocked' && localOpen) void activate();
    else setStep('key');
  }

  if (!open) return null;
  return createPortal(
    // Rendered outside any page form: its submit events must not reach it.
    <div onSubmit={(event) => event.stopPropagation()}>
      <Modal open title="Guardar en este navegador" onClose={onClose}>
        {step === 'intro' ? (
          <div className="page-stack local-mode">
            <p>
              Tus <strong>proyectos, tareas y partes nuevos</strong> se guardarán solo en este
              navegador, cifrados. Tu perfil, jornada, fichajes, notas y contraseñas siguen en tu
              cuenta.
            </p>
            <ul className="local-mode__list">
              <li>
                <Icon name="shield" size={15} />
                {vault.status === 'missing'
                  ? 'Crearás una clave maestra (una sola vez). Sin ella nadie puede leerlos.'
                  : vault.status === 'unlocked'
                    ? 'Se cifran con tu clave maestra, que ya está desbloqueada.'
                    : 'Se cifran con tu clave maestra: la pediremos una vez.'}
              </li>
              <li>
                <Icon name="refresh" size={15} />
                Al abrir otra pestaña no hace falta volver a escribirla mientras tengas una abierta.
              </li>
              <li>
                <Icon name="download" size={15} />
                Te recordaremos descargar una copia de seguridad de vez en cuando.
              </li>
            </ul>
            <p className="muted local-mode__docker">
              ¿Prefieres que <strong>nada</strong> salga de tu PC? Usa{' '}
              <a href={LOCAL_EDITION_DOCS} target="_blank" rel="noreferrer noopener">
                Chambapp local con Docker
              </a>
              : sin cuenta y sin nube.
            </p>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <div className="actions">
              <Button variant="primary" icon="hardDrive" onClick={next}>
                {vault.status === 'unlocked' && localOpen ? 'Activar' : 'Continuar'}
              </Button>
              <Button variant="ghost" onClick={onClose}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : step === 'key' ? (
          <div className="page-stack">
            <VaultUnlockCard purpose="Tus proyectos, tareas y partes locales" compact />
            {vault.status === 'unlocked' && !localOpen ? (
              <p className="muted" role="status">
                Preparando los datos de este navegador…
              </p>
            ) : null}
          </div>
        ) : step === 'saving' ? (
          <p className="muted" role="status">
            Activando el modo local…
          </p>
        ) : (
          <div className="page-stack">
            <p role="status">
              <Icon name="check" size={16} /> Listo. Los proyectos nuevos se guardarán en este
              navegador.
            </p>
            <div className="actions">
              <Button variant="primary" onClick={onClose}>
                Entendido
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>,
    document.body,
  );
}
