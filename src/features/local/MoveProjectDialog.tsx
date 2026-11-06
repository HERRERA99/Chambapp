import { useState } from 'react';
import type { Project } from '../../domain/models';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';
import { readableError } from '../../lib/supabase/errors';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { useAuth } from '../auth/useAuth';
import { moveProjectToCloud, moveProjectToLocal } from './localData';

/** Moves a project (with its tasks and entries) between this browser and the cloud. */
export function MoveProjectDialog({
  project,
  taskCount,
  entryCount,
  onClose,
}: {
  project: Project;
  taskCount: number;
  entryCount: number;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const notify = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toLocal = project.origen !== 'local';

  async function move() {
    if (!user || busy) return;
    setBusy(true);
    setError('');
    try {
      if (toLocal) await moveProjectToLocal(user.id, project.id);
      else await moveProjectToCloud(user.id, project.id);
      notify(
        toLocal
          ? `«${project.nombre}» se guarda ahora en este navegador.`
          : `«${project.nombre}» se guarda ahora en la nube.`,
      );
      onClose();
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={toLocal ? 'Mover a este navegador' : 'Mover a la nube'}
      description={`«${project.nombre}», con sus ${taskCount} tareas y ${entryCount} partes.`}
    >
      <div className="page-stack">
        {toLocal ? (
          <p className="muted">
            Se guardará cifrado en este navegador y se borrará de Supabase. Solo estará en este
            navegador: descarga copias de seguridad desde Ajustes → Datos. Supabase puede conservar
            sus propias copias de seguridad internas durante su periodo de retención.
          </p>
        ) : (
          <p className="muted">
            Se subirá a la nube con los mismos datos y se borrará de este navegador. Estará
            disponible en cualquier dispositivo con tu cuenta.
          </p>
        )}
        <p className="field__hint">
          Las notas y contraseñas enlazadas siguen enlazadas. Los partes eliminados no se mueven.
        </p>
        {error ? (
          <p role="alert" className="form-error">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            icon={toLocal ? 'hardDrive' : 'cloud'}
            disabled={busy}
            onClick={() => void move()}
          >
            {busy ? 'Moviendo…' : toLocal ? 'Mover a este navegador' : 'Mover a la nube'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
