import { Link } from 'react-router-dom';
import type { Project } from '../../../domain/models';
import { formatDuration } from '../../../domain/time';
import { Badge, Progress } from '../../../shared/ui/Panel';
import { IconButton } from '../../../shared/ui/Button';
import { Icon } from '../../../shared/ui/Icon';

export function ProjectCard({
  project,
  totalSeconds,
  taskCount,
  onDetails,
}: {
  project: Project;
  totalSeconds: number;
  taskCount: number;
  onDetails: (project: Project) => void;
}) {
  const budgetSeconds = (project.presupuesto_minutos ?? 0) * 60;
  const progress = budgetSeconds > 0 ? (totalSeconds / budgetSeconds) * 100 : 0;
  const client = project.cliente || 'Sin cliente';
  const initials = (project.cliente || project.nombre)
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toLocaleUpperCase('es');
  return (
    <article className="project-card">
      <div className="project-card__top">
        <Badge tone={project.archivado_en ? 'neutral' : 'accent'}>
          {project.archivado_en ? 'Archivado' : 'Activo'}
        </Badge>
        <IconButton
          icon="more"
          label={`Detalles de ${project.nombre}`}
          onClick={() => onDetails(project)}
        />
      </div>
      <div className="project-card__body">
        <div className="project-client">
          <span className="client-monogram">{initials}</span>
          <span className="eyebrow">{client}</span>
        </div>
        <h2>
          <Link to={`/tareas?proyecto=${project.id}`}>{project.nombre}</Link>
        </h2>
        <p className="muted project-description">{project.descripcion || 'Sin descripción'}</p>
        <div className="project-budget">
          <span className="dim">Horas imputadas</span>
          <strong className="mono">
            {formatDuration(totalSeconds)}{' '}
            <span className="dim">
              /{' '}
              {project.presupuesto_minutos !== null
                ? formatDuration(budgetSeconds)
                : 'Sin presupuesto'}
            </span>
          </strong>
        </div>
        {budgetSeconds > 0 ? (
          <Progress
            value={progress}
            label={`Presupuesto consumido en ${project.nombre}`}
            tone={progress > 100 ? 'warning' : 'soft'}
          />
        ) : null}
        <div className="project-card__footer">
          <span>
            <Icon name="tasks" size={14} />
            {taskCount} tareas asociadas
          </span>
          {budgetSeconds > 0 ? (
            <span className={progress > 100 ? 'warning' : 'accent'}>
              {formatDuration(Math.abs(budgetSeconds - totalSeconds))}{' '}
              {progress > 100 ? 'de exceso' : 'disponibles'}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
