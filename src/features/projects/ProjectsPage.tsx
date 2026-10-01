import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { StatGrid } from '../../shared/ui/StatGrid';
import { Button, IconButton } from '../../shared/ui/Button';
import { Badge, Notice, Progress } from '../../shared/ui/Panel';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { InputField, SelectField } from '../../shared/ui/FormField';
import { DataTable } from '../../shared/ui/DataTable';
import { Modal } from '../../shared/ui/Modal';
import { PreviewForm } from '../../shared/preview/PreviewForm';
import { usePreviewNotice } from '../../shared/preview/PreviewContext';
import { ProjectCard } from './components/ProjectCard';
import { projectStats, projects } from './data/projects.fixtures';
import type { ProjectPreview } from './data/projects.fixtures';
import { projectArtwork } from './data/project-artwork';

type StatusFilter = 'all' | 'active' | 'paused' | 'archived';

export default function ProjectsPage() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<ProjectPreview | null>(null);
  const notify = usePreviewNotice();
  const visibleProjects = projects.filter(project => (status === 'all' || project.status === status) && `${project.title} ${project.client}`.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
  return <div className="page-stack"><PageHeader eyebrow="Cartera de clientes & operaciones / CRM" title="Proyectos y Clientes" description="Organización de cuentas, entregables y control visual de presupuestos y horas imputadas." actions={<><Button icon="download" onClick={() => notify('Vista previa: la exportación de informes aún no está conectada.')}>Exportar informe</Button><Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>Nuevo proyecto</Button></>} /><StatGrid stats={projectStats} /><div className="toolbar"><InputField label="Buscar proyectos" className="search-field" placeholder="Buscar por proyecto o cliente…" value={query} onChange={event => setQuery(event.target.value)} /><SegmentedControl<StatusFilter> label="Estado de proyectos" value={status} onChange={setStatus} options={[{ value: 'all', label: 'Todos (6)' }, { value: 'active', label: 'Activos (4)' }, { value: 'paused', label: 'En pausa (1)' }, { value: 'archived', label: 'Archivados (1)' }]} /><div className="view-switch" role="group" aria-label="Vista de proyectos"><IconButton icon="grid" label="Vista de tarjetas" aria-pressed={view === 'grid'} onClick={() => setView('grid')} /><IconButton icon="tasks" label="Vista de tabla" aria-pressed={view === 'table'} onClick={() => setView('table')} /></div></div>{visibleProjects.length ? view === 'grid' ? <div className="project-grid">{visibleProjects.map(project => <ProjectCard key={project.id} project={{ ...project, artwork: projectArtwork[project.id] }} onDetails={setSelected} />)}</div> : <DataTable caption="Cartera de proyectos" headers={['Proyecto / Cliente', 'Estado', 'Consumo', 'Tareas', 'Acciones']}>{visibleProjects.map(project => <tr key={project.id}><td><Link to={`/tareas?proyecto=${project.id}`}><strong>{project.title}</strong></Link><span className="cell-detail">{project.client}</span></td><td><Badge tone={project.tone}>{project.badge}</Badge></td><td><span className="mono">{project.consumed} / {project.budget}</span><Progress value={project.progress} label={`Consumo de ${project.title}`} /></td><td className="mono">{project.tasks}</td><td><IconButton icon="more" label={`Detalles de ${project.title}`} onClick={() => setSelected(project)} /></td></tr>)}</DataTable> : <div className="empty-state"><h2>No hay proyectos con estos filtros</h2><p className="muted">Prueba con otro nombre o selecciona todos los estados.</p><Button onClick={() => { setQuery(''); setStatus('all'); }}>Limpiar filtros</Button></div>}<Notice title="Gestión responsable del ciclo de vida del proyecto">Archivar conserva el historial. Las acciones de creación, archivo y eliminación estarán disponibles al conectar la lógica de negocio.</Notice><Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nuevo proyecto"><PreviewForm onClose={() => setCreateOpen(false)}><InputField label="Nombre del proyecto" placeholder="Ej. Rediseño del portal de clientes" required /><InputField label="Cliente" placeholder="Nombre de la cuenta" required /><div className="form-grid"><InputField label="Presupuesto de horas" type="number" min="0" step="0.5" placeholder="120" /><InputField label="Tarifa por hora (€)" type="number" min="0" placeholder="65" /></div><SelectField label="Estado inicial"><option>Activo</option><option>En pausa</option></SelectField></PreviewForm></Modal><Modal open={selected !== null} onClose={() => setSelected(null)} title={selected?.title ?? 'Detalles de proyecto'}>{selected ? <><p className="muted">{selected.description}</p><div className="summary-pairs"><span>Cliente <strong>{selected.client}</strong></span><span>Horas imputadas <strong>{selected.consumed}</strong></span><span>Presupuesto <strong>{selected.budget}</strong></span></div><div className="actions"><Button icon="folder" onClick={() => notify('Vista previa: el estado del proyecto no se ha modificado.')}>Archivar proyecto</Button><Button variant="danger" icon="trash" onClick={() => notify('Vista previa: no se elimina ningún proyecto.')}>Eliminar</Button></div></> : null}</Modal></div>;
}
