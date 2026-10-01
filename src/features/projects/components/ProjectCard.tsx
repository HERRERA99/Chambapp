import { Link } from 'react-router-dom';
import type { ProjectPreview } from '../data/projects.fixtures';
import { Badge, Progress } from '../../../shared/ui/Panel';
import { IconButton } from '../../../shared/ui/Button';
import { Icon } from '../../../shared/ui/Icon';

export function ProjectCard({ project, onDetails }: { project: ProjectPreview; onDetails: (project: ProjectPreview) => void }) {
  return <article className={`project-card project-card--${project.id}`}><div className="project-card__top"><Badge tone={project.tone}>{project.badge}</Badge><IconButton icon="more" label={`Detalles de ${project.title}`} onClick={() => onDetails(project)} /></div>{project.artwork ? <div className="project-artwork"><img src={project.artwork} alt="" loading="lazy" /></div> : null}<div className="project-card__body"><div className="project-client"><span className="client-monogram">{project.initials}</span><span className="eyebrow">{project.client}</span></div><h2><Link to={`/tareas?proyecto=${project.id}`}>{project.title}</Link></h2>{!project.artwork ? <p className="muted project-description">{project.description}</p> : null}<div className="tag-list">{project.tags.map(tag => <Badge key={tag}>{tag}</Badge>)}</div><div className="project-budget"><span className="dim">Consumo presupuestario</span><strong className="mono">{project.consumed} <span className="dim">/ {project.budget}</span></strong></div><Progress value={project.progress} label={`Presupuesto consumido en ${project.title}`} tone={project.tone === 'warning' ? 'warning' : 'soft'} /><div className="project-card__footer"><span><Icon name="tasks" size={14} />{project.tasks} tareas asociadas</span><span className={project.tone === 'warning' ? 'warning' : 'accent'}>{project.remaining}</span></div></div></article>;
}
