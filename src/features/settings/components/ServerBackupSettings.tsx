import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { DateTime } from 'luxon';
import type { WorkspaceData } from '../../../domain/models';
import { Button } from '../../../shared/ui/Button';
import { InputField } from '../../../shared/ui/FormField';
import { Notice, Panel } from '../../../shared/ui/Panel';
import { readableError } from '../../../lib/supabase/errors';
import { MIN_MASTER_PASSWORD_LENGTH } from '../../../lib/crypto/vault';
import { useFeedback } from '../../../shared/feedback/FeedbackContext';
import { useAuth } from '../../auth/useAuth';
import {
  downloadServerBackup,
  inspectServerBackup,
  replaceWithBackup,
} from '../../local/serverData';
import type { InspectedServerBackup } from '../../local/serverData';

/** Local edition: backups of everything in the local database. */
export function ServerBackupSettings({ data }: { data: WorkspaceData }) {
  const { user } = useAuth();
  const notify = useFeedback();
  const zone = data.profile.zona_horaria;
  const [encrypt, setEncrypt] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [inspected, setInspected] = useState<{ file: File; result: InspectedServerBackup } | null>(
    null,
  );
  const [filePassword, setFilePassword] = useState('');
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

  function download() {
    if (!user) return;
    if (encrypt) {
      if ([...password].length < MIN_MASTER_PASSWORD_LENGTH)
        return setError(
          `La contraseña de la copia debe tener al menos ${MIN_MASTER_PASSWORD_LENGTH} caracteres.`,
        );
      if (password !== confirmation) return setError('Las dos contraseñas no coinciden.');
    }
    void task('download', async () => {
      await downloadServerBackup(user.id, encrypt ? password : undefined);
      setPassword('');
      setConfirmation('');
      notify('Copia de seguridad descargada.');
    });
  }

  function inspect(file: File, withPassword?: string) {
    if (!user) return;
    void task('inspect', async () => {
      setInspected({ file, result: await inspectServerBackup(file, user.id, withPassword) });
    });
  }

  function replace() {
    if (!user || inspected?.result.kind !== 'ok') return;
    const incoming = inspected.result.data;
    void task('replace', async () => {
      await replaceWithBackup(user.id, incoming);
    });
  }

  const ok = inspected?.result.kind === 'ok' ? inspected.result : null;
  return (
    <div className="page-stack">
      <Panel title="Tus datos" icon="hardDrive">
        <p className="muted">
          Esta es la versión local de Chambapp: todos tus datos se guardan en la base de datos de
          Docker de este PC y no salen de él. Las notas y contraseñas siguen cifradas con tu clave
          maestra.
        </p>
      </Panel>

      <Panel title="Copia de seguridad" icon="download">
        <p className="muted">
          Descarga una copia con todo (proyectos, tareas, partes, fichajes, calendario, notas,
          contraseñas y ajustes). Guárdala fuera de este PC para no perder nada si se borra el
          volumen de Docker.
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
        ) : (
          <p className="field__hint">
            Sin contraseña, quien tenga el archivo puede leer tus proyectos y partes (las notas y
            contraseñas siguen cifradas con tu clave maestra).
          </p>
        )}
        <div className="actions">
          <Button icon="download" disabled={!!busy} onClick={download}>
            {busy === 'download' ? 'Preparando…' : 'Descargar copia'}
          </Button>
          <Button
            variant="ghost"
            icon="upload"
            disabled={!!busy}
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
              setFilePassword('');
              if (file) inspect(file);
            }}
          />
        </div>
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
        {ok && inspected ? (
          <div
            className="storage-preview"
            role="region"
            aria-label="Vista previa de la importación"
          >
            <p>
              <strong>{inspected.file.name}</strong>, exportada el{' '}
              {DateTime.fromISO(ok.exportadoEn)
                .setZone(zone)
                .setLocale('es')
                .toFormat("d LLL yyyy 'a las' HH:mm")}
              :
            </p>
            <ul>
              <li>
                {ok.counts.proyectos} proyectos, {ok.counts.tareas} tareas y {ok.counts.partes}{' '}
                partes de horas.
              </li>
              <li>
                {ok.counts.fichajes} fichajes y {ok.counts.ausencias} festivos o vacaciones.
              </li>
              <li>
                {ok.counts.notas} notas y {ok.counts.contrasenas} contraseñas.
              </li>
            </ul>
            <Notice title="Se reemplazará todo">
              Todos los datos actuales se sustituyen por los de la copia. Antes se descarga
              automáticamente una copia de lo que hay ahora. Las notas y contraseñas de la copia se
              abren con la clave maestra que tenías al hacerla.
            </Notice>
            <div className="actions">
              <Button variant="danger" disabled={!!busy} onClick={replace}>
                {busy === 'replace' ? 'Restaurando…' : 'Reemplazar todo'}
              </Button>
              <Button variant="ghost" disabled={!!busy} onClick={() => setInspected(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="warning">
            {error}
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
