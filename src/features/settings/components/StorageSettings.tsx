import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { DateTime } from 'luxon';
import type { WorkspaceData } from '../../../domain/models';
import { Button } from '../../../shared/ui/Button';
import { InputField } from '../../../shared/ui/FormField';
import { Modal } from '../../../shared/ui/Modal';
import { Notice, Panel } from '../../../shared/ui/Panel';
import { readableError } from '../../../lib/supabase/errors';
import { MIN_MASTER_PASSWORD_LENGTH } from '../../../lib/crypto/vault';
import { loadCredentials } from '../../../lib/supabase/vault.repository';
import { askPersistence, closeLocalData } from '../../../lib/local/runtime';
import { useFeedback } from '../../../shared/feedback/FeedbackContext';
import { useAuth } from '../../auth/useAuth';
import { useVault } from '../../vault/useVault';
import { VaultKeyDialog } from '../../local/VaultKeyDialog';
import { LocalModeDialog } from '../../local/LocalModeDialog';
import type { Profile } from '../../../domain/models';
import {
  clearLocal,
  downloadBackup,
  importBackup,
  inspectBackup,
  retryProjectMoves,
} from '../../local/localData';
import type { InspectedBackup } from '../../local/localData';

export type StorageDraft = { almacenamiento: 'nube' | 'local'; avisoCopiaDias: number };

const when = (iso: string | null, zone: string) =>
  iso
    ? DateTime.fromISO(iso).setZone(zone).setLocale('es').toFormat("d LLL yyyy 'a las' HH:mm")
    : 'nunca';

/** Where projects, tasks and entries are kept, plus backups of the local data. */
export function StorageSettings({
  value,
  onChange,
  data,
  disabled = false,
  onLocalSaved,
}: {
  value: StorageDraft;
  onChange: (next: StorageDraft) => void;
  data: WorkspaceData;
  disabled?: boolean;
  /** The local mode was activated (and saved) from its own dialog. */
  onLocalSaved?: (profile: Profile) => void;
}) {
  const vault = useVault();
  const { user } = useAuth();
  const notify = useFeedback();
  const local = data.local;
  const open = local?.estado === 'abierto' || local?.estado === 'sin-datos';
  const zone = data.profile.zona_horaria;
  const [keyDialog, setKeyDialog] = useState(false);
  const [localDialog, setLocalDialog] = useState(false);
  const [encrypt, setEncrypt] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [inspected, setInspected] = useState<{ file: File; result: InspectedBackup } | null>(null);
  const [filePassword, setFilePassword] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [clearText, setClearText] = useState('');
  const [clearBackup, setClearBackup] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);

  async function task(label: string, work: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError('');
    try {
      await work();
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusy('');
    }
  }

  // Settings is one <form>: Enter in these fields must not save the whole page.
  const onEnter = (action: () => void) => (event: KeyboardEvent) => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    action();
  };

  function chooseLocal() {
    // Already saved as local: nothing to activate (maybe only switching back from a draft).
    if (open && data.profile.preferencias.almacenamiento === 'local')
      onChange({ ...value, almacenamiento: 'local' });
    else setLocalDialog(true);
  }

  function download() {
    if (encrypt) {
      if ([...password].length < MIN_MASTER_PASSWORD_LENGTH)
        return setError(
          `La contraseña de la copia debe tener al menos ${MIN_MASTER_PASSWORD_LENGTH} caracteres.`,
        );
      if (password !== confirmation) return setError('Las dos contraseñas no coinciden.');
    }
    void task('download', async () => {
      await downloadBackup(encrypt ? password : undefined);
      setPassword('');
      setConfirmation('');
      notify('Copia de seguridad descargada.');
    });
  }

  function inspect(file: File, withPassword?: string) {
    if (!user) return;
    void task('inspect', async () => {
      setInspected({ file, result: await inspectBackup(file, user.id, withPassword) });
    });
  }

  function apply(mode: 'combinar' | 'reemplazar') {
    if (inspected?.result.kind !== 'ok') return;
    const { data: incoming } = inspected.result;
    void task(mode, async () => {
      await importBackup(incoming, mode);
      setInspected(null);
      setFilePassword('');
      notify(
        mode === 'combinar'
          ? 'Copia combinada con tus datos locales.'
          : 'Datos locales reemplazados por la copia.',
      );
    });
  }

  function clear() {
    if (clearText !== 'BORRAR' || !user) return;
    void task('clear', async () => {
      const credentials = vault.status === 'unlocked' ? await loadCredentials(user.id) : [];
      await clearLocal(user.id, credentials, clearBackup);
      setClearOpen(false);
      setClearText('');
      notify('Datos locales borrados de este navegador.');
    });
  }

  const preview = inspected?.result.kind === 'ok' ? inspected.result.preview : null;

  return (
    <div className="page-stack">
      <Panel title="Dónde se guardan tus datos" icon="hardDrive">
        <p className="muted">
          Proyectos, tareas y partes de horas pueden guardarse en este navegador en lugar de en la
          nube. El resto (perfil, jornada, fichajes, festivos, notas y contraseñas) sigue en la
          nube. Los dos se ven siempre juntos: esta opción decide dónde se crean los proyectos
          nuevos; sus tareas y partes van con su proyecto.
        </p>
        <fieldset className="choice-fieldset" disabled={disabled || !!busy}>
          <legend>Proyectos nuevos</legend>
          <div className="choice-grid">
            <label
              className={`choice-card ${value.almacenamiento === 'nube' ? 'choice-card--selected' : ''}`}
            >
              <input
                type="radio"
                name="almacenamiento"
                checked={value.almacenamiento === 'nube'}
                onChange={() => onChange({ ...value, almacenamiento: 'nube' })}
              />
              <strong>En la nube</strong>
              <span className="muted">Disponibles en cualquier dispositivo con tu cuenta.</span>
            </label>
            <label
              className={`choice-card ${value.almacenamiento === 'local' ? 'choice-card--selected' : ''}`}
            >
              <input
                type="radio"
                name="almacenamiento"
                checked={value.almacenamiento === 'local'}
                disabled={local?.estado === 'no-disponible' || local?.estado === 'error'}
                onChange={chooseLocal}
              />
              <strong>En este navegador</strong>
              <span className="muted">
                Cifrados con tu clave maestra y guardados solo aquí. Haz copias de seguridad.
              </span>
            </label>
          </div>
        </fieldset>
        {!open && local?.estado !== 'no-disponible' && local?.estado !== 'error' ? (
          <p className="field__hint">
            {vault.status === 'missing'
              ? 'Para guardar datos en este navegador necesitas una clave maestra, que los cifra.'
              : 'Desbloquea tu clave maestra para usar los datos de este navegador.'}{' '}
            <Button
              variant="ghost"
              icon={vault.status === 'missing' ? 'shield' : 'unlock'}
              onClick={() => setKeyDialog(true)}
            >
              {vault.status === 'missing' ? 'Crear clave maestra' : 'Desbloquear'}
            </Button>
          </p>
        ) : null}
        {local?.estado === 'no-disponible' ? (
          <Notice title="Este navegador no permite guardar datos locales">
            Puede ocurrir en ventanas privadas. Usa una ventana normal para el modo local.
          </Notice>
        ) : null}
        {local?.estado === 'error' ? (
          <Notice title="No se pueden leer los datos locales">
            Se cifraron con una clave maestra anterior (se restableció). Importa una copia de
            seguridad para recuperarlos, o bórralos.
          </Notice>
        ) : null}
      </Panel>

      <Panel title="Datos de este navegador" icon="database">
        {open ? (
          <dl className="storage-summary">
            <div>
              <dt>Proyectos</dt>
              <dd>{local!.proyectos}</dd>
            </div>
            <div>
              <dt>Tareas</dt>
              <dd>{local!.tareas}</dd>
            </div>
            <div>
              <dt>Partes</dt>
              <dd>{local!.partes}</dd>
            </div>
            <div>
              <dt>Último cambio</dt>
              <dd>{when(local!.actualizadoEn, zone)}</dd>
            </div>
            <div>
              <dt>Última copia</dt>
              <dd>{when(local!.ultimaCopiaEn, zone)}</dd>
            </div>
            <div>
              <dt>Almacenamiento persistente</dt>
              <dd>
                {local!.persistente === true
                  ? 'Concedido'
                  : local!.persistente === false
                    ? 'No concedido: el navegador podría borrarlos si le falta espacio'
                    : 'Sin comprobar'}{' '}
                {local!.persistente !== true ? (
                  <Button variant="ghost" onClick={() => void askPersistence()}>
                    Pedirlo
                  </Button>
                ) : null}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="muted">
            {local?.estado === 'bloqueado'
              ? 'Hay datos guardados en este navegador. Desbloquea tu clave maestra para verlos.'
              : 'Todavía no hay datos guardados en este navegador.'}
          </p>
        )}
        {local && local.traspasosPendientes > 0 ? (
          <Notice title="Hay un proyecto a medio mover">
            Se copió, pero falta limpiar el origen.{' '}
            <Button
              variant="ghost"
              icon="refresh"
              disabled={!!busy}
              onClick={() => user && void task('retry', () => retryProjectMoves(user.id))}
            >
              Reintentar
            </Button>
          </Notice>
        ) : null}
        <InputField
          className="storage-days"
          label="Recordar la copia de seguridad cada (días)"
          type="number"
          min={0}
          max={365}
          value={value.avisoCopiaDias}
          disabled={disabled}
          hint="Avisa si hay cambios sin copia desde hace más días. 0 lo desactiva."
          onChange={(event) =>
            onChange({
              ...value,
              avisoCopiaDias: Math.max(0, Math.min(365, Number(event.target.value) || 0)),
            })
          }
        />
        {open ? (
          <div className="actions">
            <Button
              variant="ghost"
              icon="lock"
              onClick={() => {
                closeLocalData(true);
                vault.lock();
              }}
            >
              Bloquear todo
            </Button>
          </div>
        ) : null}
      </Panel>

      <Panel title="Copia de seguridad" icon="download">
        <p className="muted">
          Los datos locales solo existen en este navegador. Descarga copias para no perderlos y para
          llevarlos a otro dispositivo o navegador.
        </p>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={encrypt}
            onChange={(event) => setEncrypt(event.target.checked)}
          />
          Cifrar con contraseña
        </label>
        {encrypt ? (
          <div className="form-grid" onKeyDown={onEnter(download)}>
            <InputField
              label="Contraseña de la copia"
              type="password"
              autoComplete="new-password"
              value={password}
              hint={`Mínimo ${MIN_MASTER_PASSWORD_LENGTH} caracteres. Sin ella no se puede abrir la copia.`}
              onChange={(event) => setPassword(event.target.value)}
            />
            <InputField
              label="Repite la contraseña"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
        ) : null}
        <div className="actions">
          <Button
            icon="download"
            disabled={!open || !!busy || !local?.proyectos}
            onClick={download}
          >
            {busy === 'download' ? 'Preparando…' : 'Descargar copia'}
          </Button>
          <Button
            variant="ghost"
            icon="upload"
            disabled={!open || !!busy}
            onClick={() => fileInput.current?.click()}
          >
            Importar copia
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) inspect(file);
            }}
          />
        </div>
        {!open ? (
          <p className="field__hint">Desbloquea tu clave maestra para descargar o importar.</p>
        ) : null}
        {inspected?.result.kind === 'needs-password' ? (
          <div
            className="form-grid"
            onKeyDown={onEnter(() => inspect(inspected.file, filePassword))}
          >
            <InputField
              label="Contraseña de la copia"
              type="password"
              autoComplete="off"
              value={filePassword}
              onChange={(event) => setFilePassword(event.target.value)}
            />
            <div className="actions">
              <Button
                disabled={!!busy || !filePassword}
                onClick={() => inspect(inspected.file, filePassword)}
              >
                Abrir copia
              </Button>
              <Button variant="ghost" onClick={() => setInspected(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
        {preview && inspected?.result.kind === 'ok' ? (
          <div
            className="storage-preview"
            role="region"
            aria-label="Vista previa de la importación"
          >
            <p>
              <strong>{inspected.file.name}</strong>, exportada el{' '}
              {when(inspected.result.exportadoEn, zone)}: {preview.incoming.proyectos} proyectos,{' '}
              {preview.incoming.tareas} tareas y {preview.incoming.partes} partes.
            </p>
            <ul>
              <li>{preview.nuevos} registros nuevos.</li>
              <li>
                {preview.masRecientesEnArchivo} más recientes en el archivo (sustituyen a los de
                aquí al combinar).
              </li>
              <li>{preview.masRecientesAqui} más recientes aquí (se conservan al combinar).</li>
              {preview.eliminadosEnArchivo ? (
                <li>{preview.eliminadosEnArchivo} eliminados en el archivo.</li>
              ) : null}
              {preview.enLaNube ? (
                <li>{preview.enLaNube} ya están en la nube y se omiten.</li>
              ) : null}
            </ul>
            <div className="actions">
              <Button icon="check" disabled={!!busy} onClick={() => apply('combinar')}>
                Combinar
              </Button>
              <Button variant="danger" disabled={!!busy} onClick={() => apply('reemplazar')}>
                Reemplazar todo
              </Button>
              <Button variant="ghost" disabled={!!busy} onClick={() => setInspected(null)}>
                Cancelar
              </Button>
            </div>
            <p className="field__hint">
              «Reemplazar todo» descarga antes una copia de lo que hay ahora.
            </p>
          </div>
        ) : null}
      </Panel>

      <Panel title="Borrar datos locales" icon="trash">
        <p className="muted">
          Borra de este navegador todos tus proyectos, tareas y partes locales, y las contraseñas de
          esos proyectos. No afecta a los datos de la nube.
        </p>
        <Button
          variant="danger"
          icon="trash"
          disabled={!!busy || local?.estado === 'sin-clave'}
          onClick={() => setClearOpen(true)}
        >
          Borrar datos locales
        </Button>
      </Panel>

      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      <VaultKeyDialog open={keyDialog} onClose={() => setKeyDialog(false)} />
      {localDialog ? (
        <LocalModeDialog
          open
          data={data}
          onClose={() => setLocalDialog(false)}
          onSaved={(profile) => {
            onChange({ ...value, almacenamiento: 'local' });
            onLocalSaved?.(profile);
          }}
        />
      ) : null}
      {clearOpen
        ? createPortal(
            <div onSubmit={(event) => event.stopPropagation()}>
              <Modal
                open
                title="Borrar datos locales"
                description="Se borrarán de este navegador. Si no tienes una copia, no se podrán recuperar."
                onClose={() => setClearOpen(false)}
              >
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={clearBackup}
                    disabled={!open}
                    onChange={(event) => setClearBackup(event.target.checked)}
                  />
                  Descargar antes una copia de seguridad
                </label>
                <InputField
                  label="Escribe BORRAR para confirmar"
                  value={clearText}
                  onChange={(event) => setClearText(event.target.value)}
                />
                <div className="form-actions">
                  <Button variant="ghost" onClick={() => setClearOpen(false)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    disabled={clearText !== 'BORRAR' || !!busy}
                    onClick={clear}
                  >
                    {busy === 'clear' ? 'Borrando…' : 'Borrar'}
                  </Button>
                </div>
              </Modal>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
