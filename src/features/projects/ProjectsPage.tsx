import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Project } from '../../domain/models';
import { downloadCsv } from '../../lib/export';
import { formatDuration } from '../../domain/time';
import { PageHeader } from '../../shared/ui/PageHeader';
import { StatGrid } from '../../shared/ui/StatGrid';
import { Button, IconButton } from '../../shared/ui/Button';
import { Badge, Notice } from '../../shared/ui/Panel';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { SearchSuggest } from '../../shared/ui/SearchSuggest';
import { normalizeNoteSearch } from '../notes/notes.model';
import { DataTable } from '../../shared/ui/DataTable';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { useWorkspace } from '../workspace/useWorkspace';
import { useCommand } from '../workspace/useCommand';
import { entryTotals, entryTotalsBy } from '../time-entries/entryTotals';
import { ProjectCard } from './components/ProjectCard';
import { ProjectForm } from './components/ProjectForm';
import { ProjectDetails } from './components/ProjectDetails';

type StatusFilter = 'all' | 'active' | 'archived';
type ProjectAction = { kind: 'archive' | 'delete'; project: Project };

export default function ProjectsPage() {
  const { data, isLoading, error, reload } = useWorkspace();
  const { run, pending } = useCommand();
  const notify = useFeedback();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [form, setForm] = useState<Project | 'new' | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [action, setAction] = useState<ProjectAction | null>(null);
  const projects = data?.projects.filter((project) => !project.eliminado_en) ?? [];
  const tasks = data?.tasks.filter((task) => !task.eliminado_en) ?? [];
  const entries = data?.entries.filter((entry) => !entry.eliminado_en) ?? [];
  const visible = projects.filter(
    (project) =>
      (status === 'all' || (status === 'archived') === !!project.archivado_en) &&
      normalizeNoteSearch(`${project.nombre} ${project.cliente ?? ''}`).includes(
        normalizeNoteSearch(query),
      ),
  );
  const totals = entryTotals(entries);
  const projectTotals = entryTotalsBy(entries, 'proyecto_id');
  const projectTotal = (id: string) => projectTotals.get(id)?.logged ?? 0;
  const taskCounts = new Map<string, number>();
  for (const task of tasks)
    taskCounts.set(task.proyecto_id, (taskCounts.get(task.proyecto_id) ?? 0) + 1);
  const hasActive = (id: string) =>
    entries.some((entry) => entry.proyecto_id === id && !entry.fin_en);
  const activeCount = projects.filter((project) => !project.archivado_en).length;

  async function confirmAction() {
    if (!action) return;
    await run(action.kind === 'delete' ? 'eliminar_proyecto' : 'editar_proyecto', {
      id: action.project.id,
      version: action.project.version,
      ...(action.kind === 'delete'
        ? { confirmar_cascada: true }
        : { archivado: !action.project.archivado_en }),
    });
    notify(
      action.kind === 'delete'
        ? 'Proyecto y registros asociados eliminados.'
        : action.project.archivado_en
          ? 'Proyecto restaurado.'
          : 'Proyecto archivado.',
    );
    setAction(null);
    setSelected(null);
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Cartera de clientes & operaciones / CRM"
        title="Proyectos y Clientes"
        description="Organiza entregables, presupuestos y horas imputadas de tus proyectos."
        actions={
          <>
            <Button
              icon="download"
              disabled={!data || !visible.length}
              onClick={() =>
                downloadCsv(
                  'proyectos.csv',
                  ['Proyecto', 'Cliente', 'Estado', 'Presupuesto (min)', 'Imputado (s)', 'Tareas'],
                  visible.map((project) => [
                    project.nombre,
                    project.cliente,
                    project.archivado_en ? 'Archivado' : 'Activo',
                    project.presupuesto_minutos,
                    projectTotal(project.id),
                    taskCounts.get(project.id) ?? 0,
                  ]),
                )
              }
            >
              Exportar CSV
            </Button>
            <Button
              variant="primary"
              icon="plus"
              disabled={!data || pending}
              onClick={() => setForm('new')}
            >
              Nuevo proyecto
            </Button>
          </>
        }
      />
      {error ? (
        <Notice title="No se pudieron cargar los proyectos">
          <p role="alert">{error.message}</p>
          <Button onClick={() => void reload()}>Reintentar</Button>
        </Notice>
      ) : null}
      <StatGrid
        stats={[
          {
            label: 'Proyectos activos',
            value: String(activeCount),
            detail: `${projects.length} proyectos en total`,
            icon: 'folder',
          },
          {
            label: 'Horas imputadas',
            value: formatDuration(totals.logged),
            detail: 'Partes finalizados de todos los proyectos',
            icon: 'timer',
            accent: true,
          },
          {
            label: 'Tareas pendientes',
            value: String(
              tasks.filter((task) => task.estado !== 'completada' && !task.archivado_en).length,
            ),
            detail: `${tasks.length} tareas registradas`,
            icon: 'tasks',
          },
          {
            label: 'Proyectos archivados',
            value: String(projects.length - activeCount),
            detail: 'Conservan sus horas y su historial',
            icon: 'file',
          },
        ]}
      />
      <div className="toolbar">
        <div className="search-field">
          <SearchSuggest
            label="Buscar proyectos"
            placeholder="Buscar por proyecto o cliente…"
            value={query}
            onChange={setQuery}
            emptyText="Ningún proyecto coincide."
            suggestions={projects
              .filter((project) =>
                normalizeNoteSearch(`${project.nombre} ${project.cliente ?? ''}`).includes(
                  normalizeNoteSearch(query),
                ),
              )
              .map((project) => ({
                id: project.id,
                title: project.nombre,
                detail: [project.cliente, project.archivado_en ? 'Archivado' : 'Activo']
                  .filter(Boolean)
                  .join(' · '),
              }))}
            onPick={(suggestion) =>
              setSelected(projects.find((project) => project.id === suggestion.id) ?? null)
            }
          />
        </div>
        <SegmentedControl<StatusFilter>
          label="Estado de proyectos"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: `Todos (${projects.length})` },
            { value: 'active', label: `Activos (${activeCount})` },
            { value: 'archived', label: `Archivados (${projects.length - activeCount})` },
          ]}
        />
        <div className="view-switch" role="group" aria-label="Vista de proyectos">
          <IconButton
            icon="grid"
            label="Vista de tarjetas"
            aria-pressed={view === 'grid'}
            onClick={() => setView('grid')}
          />
          <IconButton
            icon="tasks"
            label="Vista de tabla"
            aria-pressed={view === 'table'}
            onClick={() => setView('table')}
          />
        </div>
      </div>
      {isLoading && !data ? (
        <p role="status">Cargando proyectos…</p>
      ) : visible.length ? (
        view === 'grid' ? (
          <div className="project-grid">
            {visible.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                totalSeconds={projectTotal(project.id)}
                taskCount={taskCounts.get(project.id) ?? 0}
                onDetails={setSelected}
              />
            ))}
          </div>
        ) : (
          <DataTable
            caption="Cartera de proyectos"
            headers={[
              'Proyecto / Cliente',
              'Estado',
              'Imputado / Presupuesto',
              'Tareas',
              'Acciones',
            ]}
          >
            {visible.map((project) => (
              <tr key={project.id}>
                <td>
                  <Link to={`/tareas?proyecto=${project.id}`}>
                    <strong>{project.nombre}</strong>
                  </Link>
                  <span className="cell-detail">{project.cliente || 'Sin cliente'}</span>
                </td>
                <td>
                  <Badge tone={project.archivado_en ? 'neutral' : 'accent'}>
                    {project.archivado_en ? 'Archivado' : 'Activo'}
                  </Badge>
                </td>
                <td className="mono">
                  {formatDuration(projectTotal(project.id))} /{' '}
                  {project.presupuesto_minutos !== null
                    ? formatDuration(project.presupuesto_minutos * 60)
                    : 'Sin presupuesto'}
                </td>
                <td className="mono">{taskCounts.get(project.id) ?? 0}</td>
                <td>
                  <IconButton
                    icon="more"
                    label={`Detalles de ${project.nombre}`}
                    onClick={() => setSelected(project)}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        )
      ) : (
        <div className="empty-state">
          <h2>
            {projects.length ? 'No hay proyectos con estos filtros' : 'Crea tu primer proyecto'}
          </h2>
          <p className="muted">
            {projects.length
              ? 'Prueba otro nombre o selecciona todos los estados.'
              : 'Agrupa tus tareas y empieza a registrar las horas de trabajo.'}
          </p>
          {projects.length ? (
            <Button
              onClick={() => {
                setQuery('');
                setStatus('all');
              }}
            >
              Limpiar filtros
            </Button>
          ) : (
            <Button disabled={!data} onClick={() => setForm('new')}>
              Nuevo proyecto
            </Button>
          )}
        </div>
      )}
      <Notice title="Archivo e historial">
        Archivar conserva tareas y horas. Eliminar un proyecto también elimina sus tareas, sus
        partes de los informes y las contraseñas guardadas en él.
      </Notice>
      {form ? (
        <ProjectForm
          key={typeof form === 'string' ? 'new' : form.id}
          project={form === 'new' ? undefined : form}
          onClose={() => setForm(null)}
        />
      ) : null}
      {selected ? (
        <ProjectDetails
          project={selected}
          totalSeconds={projectTotal(selected.id)}
          hasActive={hasActive(selected.id)}
          busy={pending}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setForm(selected);
            setSelected(null);
          }}
          onArchive={() => {
            setAction({ kind: 'archive', project: selected });
            setSelected(null);
          }}
          onDelete={() => {
            setAction({ kind: 'delete', project: selected });
            setSelected(null);
          }}
        />
      ) : null}
      <ConfirmDialog
        key={action ? `${action.project.id}-${action.kind}` : 'closed'}
        open={action !== null}
        onClose={() => {
          if (!pending) setAction(null);
        }}
        onConfirm={confirmAction}
        busy={pending}
        danger={action?.kind === 'delete'}
        title={
          action?.kind === 'delete'
            ? 'Eliminar proyecto y su historial'
            : action?.project.archivado_en
              ? 'Desarchivar proyecto'
              : 'Archivar proyecto'
        }
        description={
          action?.kind === 'delete'
            ? `Se eliminarán «${action.project.nombre}», sus ${tasks.filter((task) => task.proyecto_id === action.project.id).length} tareas y sus ${entries.filter((entry) => entry.proyecto_id === action.project.id).length} partes de todos los informes. También se borrarán para siempre las contraseñas guardadas en este proyecto.`
            : 'El historial de horas se conserva. Podrás desarchivar el proyecto más adelante.'
        }
        confirmLabel={
          action?.kind === 'delete'
            ? 'Eliminar proyecto e historial'
            : action?.project.archivado_en
              ? 'Desarchivar'
              : 'Archivar'
        }
      />
    </div>
  );
}
