import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Button, ButtonLink, IconButton } from '../../shared/ui/Button';
import { Panel, Badge, Progress, Notice } from '../../shared/ui/Panel';
import { Icon } from '../../shared/ui/Icon';
import { InputField, SelectField } from '../../shared/ui/FormField';
import { Modal } from '../../shared/ui/Modal';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { PreviewForm } from '../../shared/preview/PreviewForm';
import { usePreviewNotice } from '../../shared/preview/PreviewContext';
import { EntryModal } from '../time-entries/components/EntryModal';
import { WeekChart } from '../week/components/WeekChart';
import { tasks, taskStatusLabels, taskDayGroups } from './data/tasks.fixtures';
import type { TaskPreview } from './data/tasks.fixtures';
import { paths } from '../../app/paths';

type Filter = 'all' | 'active' | 'pending' | 'completed';

export default function TasksPage() {
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('proyecto');
  const initialTask = tasks.find(task => !projectId || task.projectId === projectId);

  if (!initialTask) {
    return <div className="page-stack"><PageHeader eyebrow="Operaciones / Proyectos / Tareas" title="Sin tareas de ejemplo" description="No hay tareas de demostración para este proyecto." /><ButtonLink to={paths.tasks}>Ver todas las tareas</ButtonLink></div>;
  }

  return <TasksWorkspace key={projectId ?? 'all'} projectId={projectId} initialTask={initialTask} />;
}

function TasksWorkspace({ projectId, initialTask }: { projectId: string | null; initialTask: TaskPreview }) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(initialTask.id);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<'create' | 'edit' | null>(null);
  const notify = usePreviewNotice();
  const selected = tasks.find(task => task.id === selectedId) ?? initialTask;
  const visibleTasks = tasks.filter(task => (!projectId || task.projectId === projectId) && (filter === 'all' || task.status === filter) && task.title.toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es')));
  const selectedEntries = selected.id === '8492' ? taskDayGroups : [];
  return <div className="page-stack"><PageHeader eyebrow="Operaciones / Proyectos / Tareas & entregables" title="Tareas & Imputaciones por Jornada" description="Planificación de entregables, estimaciones y desglose de partes trabajados a lo largo de múltiples días." actions={<><Button icon="download" onClick={() => notify('Vista previa: la exportación de tiempos aún no está conectada.')}>Exportar tiempos</Button><Button variant="primary" icon="plus" onClick={() => setCreateOpen(true)}>Nueva tarea</Button></>} /><SegmentedControl<Filter> label="Estado de tareas" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Todas' }, { value: 'active', label: 'En curso' }, { value: 'pending', label: 'Pendientes' }, { value: 'completed', label: 'Cerradas' }]} /><div className="task-workspace"><div className="page-stack"><Panel className="task-detail"><div className="actions"><Badge tone="accent">{taskStatusLabels[selected.status]}</Badge>{selected.warning ? <Badge tone="warning">Revisar presupuesto</Badge> : <Badge>Alta prioridad</Badge>}<span className="mono dim">#TSK-{selected.id}</span></div><h2 className="task-detail__title">{selected.title}</h2><p className="muted"><Icon name="folder" size={16} />{selected.project}</p><div className="task-detail__actions"><Button icon="check" onClick={() => notify('Vista previa: el estado de la tarea no se ha modificado.')}>Completar</Button><Button icon="arrow" onClick={() => notify('Vista previa: la tarea conserva su proyecto de ejemplo.')}>Mover</Button><span className="field__hint">Los partes históricos se conservan al mover una tarea.</span></div><div className="task-metrics"><div><span className="eyebrow">Estimación</span><strong>{selected.budget}</strong><span className="dim">Sprint budget</span></div><div><span className="eyebrow">Tiempo real</span><strong>{selected.real}</strong><span className="dim">Cronómetro neto</span></div><div><span className="eyebrow">Imputado (R15)</span><strong className="accent">{selected.logged}</strong><span className="dim">Base de facturación</span></div><div><span className="eyebrow">Presupuesto consumido</span><strong>{selected.progress}%</strong><span className="dim">Valores de ejemplo</span></div></div><div className="split-label"><span>Progreso imputado</span><span className="mono">{selected.progress}% consumido</span></div><Progress value={selected.progress} label={`Presupuesto de ${selected.title}`} />{selected.id === '8492' ? <div className="task-live"><span className="status-dot" /><div><strong>Sesión de ejemplo en esta tarea</strong><p className="muted">Inicio ilustrativo: hoy a las 14:15</p></div><strong className="mono accent">02:44:19</strong></div> : null}</Panel><Panel title="Partes Imputados por Jornada" icon="calendar" action={<Button icon="plus" onClick={() => setEntryMode('create')}>Añadir parte manual</Button>}>{selectedEntries.length ? selectedEntries.map(group => <div className="day-group" key={group.date}><div className="day-group__header"><div><strong>{group.date}</strong>{group.today ? <Badge tone="accent">Hoy</Badge> : null}<span className="cell-detail">{group.subtitle}</span></div><span className="mono">{group.total}</span></div>{group.sessions.map(session => <div className={`session-row ${session.active ? 'session-row--active' : ''}`} key={session.id}><Icon name={session.active ? 'timer' : 'verified'} /><div><div className="actions"><strong>Parte #{session.id}</strong><span className="mono dim">{session.interval}</span></div><p className="muted">{session.note}</p></div><div className="session-row__duration"><span className="eyebrow">{session.active ? 'En vivo · Ejemplo' : 'Imputado R15'}</span><strong className="mono">{session.duration}</strong></div>{session.active ? null : <IconButton icon="edit" label={`Previsualizar edición del parte ${session.id}`} onClick={() => setEntryMode('edit')} />}</div>)}</div>) : <div className="empty-state"><Icon name="file" size={32} /><h3>Sin desglose de ejemplo</h3><p className="muted">La maqueta de partes por jornada está disponible en la tarea de Middleware JWT.</p><Button onClick={() => { setSelectedId('8492'); navigate(paths.tasks); }}>Ver desglose de demostración</Button></div>}</Panel><Panel title="Curva de Esfuerzo e Imputación Diaria" eyebrow="Comparativa temporal · Datos ilustrativos"><WeekChart /></Panel></div><aside className="task-aside"><Panel title="Tareas del Proyecto" icon="tasks"><InputField label="Buscar tarea" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar entregable…" /><div className="backlog">{visibleTasks.map(task => <button key={task.id} className={`backlog__item ${selectedId === task.id ? 'backlog__item--selected' : ''}`} aria-pressed={selectedId === task.id} onClick={() => setSelectedId(task.id)}><span className={`eyebrow ${task.warning ? 'warning' : 'accent'}`}>{taskStatusLabels[task.status]}</span><strong>{task.title}</strong><span className="muted">{task.project}</span><span className="mono dim">{task.logged} / {task.budget}</span><Progress value={task.progress} label={`Progreso de ${task.title}`} /></button>)}</div>{visibleTasks.length === 0 ? <p className="muted">No hay tareas con estos filtros.</p> : null}<Button icon="plus" className="full-width" onClick={() => setCreateOpen(true)}>Crear subtarea vinculada</Button></Panel><Notice title="Criterio de redondeo R15" icon="settings">Intervalos de 15 minutos y una vista independiente del tiempo real. Los valores son ejemplos estáticos.</Notice></aside></div><Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nueva tarea"><PreviewForm onClose={() => setCreateOpen(false)}><InputField label="Nombre del entregable" required placeholder="Ej. Integración del portal de clientes" /><SelectField label="Proyecto"><option>{selected.project}</option><option>Neobank Mobile</option><option>Aero Logistics</option></SelectField><div className="form-grid"><InputField label="Estimación (horas)" type="number" min="0" step="0.5" placeholder="14" /><SelectField label="Prioridad"><option>Normal</option><option>Alta</option><option>Urgente</option></SelectField></div></PreviewForm></Modal><EntryModal open={entryMode !== null} onClose={() => setEntryMode(null)} editing={entryMode === 'edit'} /></div>;
}
