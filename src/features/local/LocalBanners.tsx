import { useState } from 'react';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Panel';
import { readableError } from '../../lib/supabase/errors';
import { backupReminderDays, storageMode } from '../../lib/local/preferences';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { paths } from '../../app/paths';
import { useAuth } from '../auth/useAuth';
import { useWorkspace } from '../workspace/useWorkspace';
import { backupDue, downloadBackup, retryProjectMoves } from './localData';
import { VaultKeyDialog } from './VaultKeyDialog';

type BannerId = 'bloqueado' | 'copia' | 'sin-datos' | 'error' | 'traspaso';
const dismissedKey = 'chambapp:local-banners-closed';

function readDismissed(): BannerId[] {
  try {
    return JSON.parse(sessionStorage.getItem(dismissedKey) ?? '[]') as BannerId[];
  } catch {
    return [];
  }
}

/** Notices about the data kept in this browser, shown above every page. */
export function LocalBanners() {
  const { data } = useWorkspace();
  const { user } = useAuth();
  const notify = useFeedback();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [keyDialog, setKeyDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const local = data?.local;
  if (!data || !local) return null;
  const mode = storageMode(data.profile);
  const days = backupReminderDays(data.profile);

  const close = (id: BannerId) => {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      sessionStorage.setItem(dismissedKey, JSON.stringify(next));
    } catch {
      // Closed for this view only.
    }
  };
  const shown = (id: BannerId) => !dismissed.includes(id);
  async function run(work: () => Promise<void>, done: string) {
    setBusy(true);
    setError('');
    try {
      await work();
      notify(done);
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusy(false);
    }
  }
  const dismiss = (id: BannerId) => (
    <Button variant="ghost" onClick={() => close(id)}>
      Ocultar
    </Button>
  );

  const banners = [
    local.estado === 'bloqueado' && shown('bloqueado') ? (
      <Notice key="bloqueado" title="Tus proyectos locales están bloqueados" icon="lock">
        Hay proyectos, tareas y partes guardados en este navegador. Desbloquea tu clave maestra para
        verlos.{' '}
        <Button variant="ghost" icon="unlock" onClick={() => setKeyDialog(true)}>
          Desbloquear
        </Button>
        {dismiss('bloqueado')}
      </Notice>
    ) : null,
    local.estado === 'error' && shown('error') ? (
      <Notice key="error" title="No se pueden leer los datos de este navegador">
        Se cifraron con una clave maestra anterior. Importa una copia de seguridad en{' '}
        <ButtonLink to={`${paths.settings}#datos`} variant="ghost">
          Ajustes → Datos
        </ButtonLink>
        {dismiss('error')}
      </Notice>
    ) : null,
    mode === 'local' &&
    (local.estado === 'sin-datos' || local.estado === 'sin-clave') &&
    shown('sin-datos') ? (
      <Notice key="sin-datos" title="No hay datos locales en este navegador" icon="info">
        Tus proyectos nuevos se guardan en este navegador. Si vienes de otro dispositivo o
        navegador, importa tu copia de seguridad en{' '}
        <ButtonLink to={`${paths.settings}#datos`} variant="ghost">
          Ajustes → Datos
        </ButtonLink>
        {dismiss('sin-datos')}
      </Notice>
    ) : null,
    backupDue(data, days) && shown('copia') ? (
      <Notice key="copia" title="Descarga una copia de tus datos locales" icon="download">
        {local.ultimaCopiaEn
          ? `Hace más de ${days} días de tu última copia y hay cambios desde entonces.`
          : 'Todavía no has descargado ninguna copia.'}{' '}
        Los datos locales solo existen en este navegador.{' '}
        <Button
          variant="ghost"
          icon="download"
          disabled={busy}
          onClick={() => void run(() => downloadBackup(), 'Copia de seguridad descargada.')}
        >
          Descargar copia
        </Button>
        {dismiss('copia')}
      </Notice>
    ) : null,
    local.traspasosPendientes > 0 && shown('traspaso') ? (
      <Notice key="traspaso" title="Hay un proyecto a medio mover" icon="refresh">
        Se copió, pero falta limpiar el origen.{' '}
        <Button
          variant="ghost"
          icon="refresh"
          disabled={busy || !user}
          onClick={() => user && void run(() => retryProjectMoves(user.id), 'Proyecto movido.')}
        >
          Reintentar
        </Button>
      </Notice>
    ) : null,
  ].filter(Boolean);

  if (!banners.length && !keyDialog) return null;
  return (
    <div className="local-banners">
      {banners}
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      <VaultKeyDialog open={keyDialog} onClose={() => setKeyDialog(false)} />
    </div>
  );
}
