import type { Project } from '../../../domain/models';
import { formatDuration } from '../../../domain/time';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { OriginBadge } from '../../local/OriginBadge';
import { isLocalEdition } from '../../../lib/edition';

export function ProjectDetails({
  project,
  totalSeconds,
  hasActive,
  busy,
  onClose,
  onEdit,
  onArchive,
  onDelete,
  onMove,
  canMove = false,
}: {
  project: Project;
  totalSeconds: number;
  hasActive: boolean;
  busy: boolean;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  /** Move between this browser and the cloud (only offered when local data is open). */
  onMove?: () => void;
  canMove?: boolean;
}) {
  return (
    <Modal open onClose={onClose} title={project.nombre}>
      <div className="page-stack">
        <p className="muted">{project.descripcion || 'Sin descripción'}</p>
        <div className="summary-pairs">
          {isLocalEdition ? null : (
            <span>
              Guardado en <OriginBadge origin={project.origen} />
            </span>
          )}
          <span>
            Cliente <strong>{project.cliente || 'Sin cliente'}</strong>
          </span>
          <span>
            Horas imputadas <strong>{formatDuration(totalSeconds)}</strong>
          </span>
          <span>
            Presupuesto{' '}
            <strong>
              {project.presupuesto_minutos !== null
                ? formatDuration(project.presupuesto_minutos * 60)
                : 'Sin presupuesto'}
            </strong>
          </span>
        </div>
        <div className="actions">
          <Button icon="edit" disabled={busy} onClick={onEdit}>
            Editar
          </Button>
          <Button icon="folder" disabled={busy || hasActive} onClick={onArchive}>
            {project.archivado_en ? 'Desarchivar' : 'Archivar'}
          </Button>
          {onMove ? (
            <Button
              icon={project.origen === 'local' ? 'cloud' : 'hardDrive'}
              disabled={busy || hasActive || !canMove}
              onClick={onMove}
            >
              {project.origen === 'local' ? 'Mover a la nube' : 'Mover a este navegador'}
            </Button>
          ) : null}
          <Button variant="danger" icon="trash" disabled={busy || hasActive} onClick={onDelete}>
            Eliminar
          </Button>
        </div>
        {hasActive ? (
          <p className="field__hint">
            Detén el cronómetro de este proyecto antes de archivarlo, moverlo o eliminarlo.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
