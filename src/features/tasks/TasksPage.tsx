import { TaskPagination } from './components/TaskPagination';
import { TaskBoard } from './components/TaskBoard';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Task } from '../../domain/models';
import { downloadCsv } from '../../lib/export';
import { formatDuration } from '../../domain/time';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Panel, Progress, Notice } from '../../shared/ui/Panel';
import { InputField, SelectField } from '../../shared/ui/FormField';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { useWorkspace } from '../workspace/useWorkspace';
import { entryTotalsBy } from '../time-entries/entryTotals';
import { TaskForm } from './components/TaskForm';
import { TaskDetail } from './components/TaskDetail';
import { taskStatusLabels } from './taskLabels';
import { OdooLink } from './components/OdooLink';

type Filter = 'all' | Task['estado'];

export default function TasksPage({ defaultView = 'list' }: { defaultView?: 'list' | 'board' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('proyecto');
  const view =
    searchParams.get('vista') === 'lista'
      ? 'list'
      : searchParams.get('vista') === 'tablero'
        ? 'board'
        : defaultView;
  const { data, isLoading, error, reload } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [pagination, setPagination] = useState({ key: '', page: 1 });
  const projects = data?.projects.filter((project) => !project.eliminado_en) ?? [];
  const tasks = data?.tasks.filter((task) => !task.eliminado_en) ?? [];
  const entries = data?.entries.filter((entry) => !entry.eliminado_en) ?? [];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const visible = tasks.filter(
    (task) =>
      (!projectId || task.proyecto_id === projectId) &&
      (includeArchived ||
        (!task.archivado_en && !projectById.get(task.proyecto_id)?.archivado_en)) &&
      (filter === 'all' || task.estado === filter) &&
      `${task.titulo} ${task.odoo_id ?? ''} ${task.descripcion ?? ''} ${projectById.get(task.proyecto_id)?.nombre ?? ''}`
        .toLocaleLowerCase('es')
        .includes(query.toLocaleLowerCase('es')),
  );
  const pageSize = 6;
  const filterKey = JSON.stringify([projectId, filter, includeArchived, query]);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = Math.min(pages, pagination.key === filterKey ? pagination.page : 1);
  const pageTasks = visible.slice((page - 1) * pageSize, page * pageSize);
  const selected = pageTasks.find((task) => task.id === selectedId) ?? pageTasks[0];
  const canCreate = projects.some((project) => !project.archivado_en);
  const taskTotals = entryTotalsBy(entries, 'tarea_id');
  const totals = (id: string) => taskTotals.get(id) ?? { real: 0, logged: 0, count: 0 };

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Operaciones / Proyectos / Tareas & entregables"
        title={view === 'board' ? 'Tablero de tareas' : 'Tareas & Imputaciones por Jornada'}
        description="Planifica tareas y consulta el tiempo real e imputado de sus sesiones de trabajo."
        actions={
          <>
            <Button
              icon="download"
              disabled={!visible.length}
              onClick={() =>
                downloadCsv(
                  'tareas.csv',
                  [
                    'Tarea',
                    'Proyecto',
                    'ID de Odoo',
                    'Enlace de Odoo',
                    'Estado',
                    'Archivada',
                    'Estimación (min)',
                    'Real (s)',
                    'Imputado (s)',
                  ],
                  visible.map((task) => [
                    task.titulo,
                    projectById.get(task.proyecto_id)?.nombre ?? '',
                    task.odoo_id,
                    task.odoo_url,
                    taskStatusLabels[task.estado],
                    task.archivado_en ? 'Sí' : 'No',
                    task.estimacion_minutos,
                    totals(task.id).real,
                    totals(task.id).logged,
                  ]),
                )
              }
            >
              Exportar CSV
            </Button>
            <Button
              variant="primary"
              icon="plus"
              disabled={!canCreate}
              onClick={() => setCreateOpen(true)}
            >
              Nueva tarea
            </Button>
          </>
        }
      />
      {error ? (
        <Notice title="No se pudieron cargar las tareas">
          <p role="alert">{error.message}</p>
          <Button onClick={() => void reload()}>Reintentar</Button>
        </Notice>
      ) : null}
      <div className="toolbar">
        <SegmentedControl<'list' | 'board'>
          label="Vista de tareas"
          value={view}
          onChange={(value) => {
            const next = new URLSearchParams(searchParams);
            next.set('vista', value === 'board' ? 'tablero' : 'lista');
            setSearchParams(next);
          }}
          options={[
            { value: 'list', label: 'Lista' },
            { value: 'board', label: 'Tablero' },
          ]}
        />
        <SegmentedControl<Filter>
          label="Estado de tareas"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todas' },
            { value: 'en_curso', label: 'En curso' },
            { value: 'pendiente', label: 'Pendientes' },
            { value: 'completada', label: 'Completadas' },
          ]}
        />
        <SelectField
          label="Proyecto"
          value={projectId ?? ''}
          onChange={(event) => {
            const next = new URLSearchParams(searchParams);
            if (event.target.value) next.set('proyecto', event.target.value);
            else next.delete('proyecto');
            setSearchParams(next);
          }}
        >
          <option value="">Todos los proyectos</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.nombre}
              {project.archivado_en ? ' (archivado)' : ''}
            </option>
          ))}
        </SelectField>
        <label className="muted">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => setIncludeArchived(event.target.checked)}
          />{' '}
          Incluir archivadas
        </label>
      </div>
      {view === 'board' ? (
        <InputField
          label="Buscar tarea en el tablero"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tarea, proyecto o ID de Odoo…"
        />
      ) : null}
      {isLoading && !data ? (
        <p role="status">Cargando tareas…</p>
      ) : view === 'board' ? (
        <TaskBoard
          tasks={visible}
          projects={projects}
          entries={entries}
          onCreate={() => setCreateOpen(true)}
        />
      ) : (
        <div className="task-workspace">
          {selected ? (
            <TaskDetail
              key={selected.id}
              task={selected}
              projects={projects}
              entries={entries.filter((entry) => entry.tarea_id === selected.id)}
            />
          ) : (
            <div className="empty-state">
              <h2>{tasks.length ? 'No hay tareas con estos filtros' : 'Crea tu primera tarea'}</h2>
              <p className="muted">
                {canCreate
                  ? 'Organiza el trabajo de un proyecto y empieza a registrar tus horas.'
                  : 'Crea un proyecto activo para añadir tareas.'}
              </p>
              {canCreate ? (
                <Button onClick={() => setCreateOpen(true)}>Nueva tarea</Button>
              ) : (
                <ButtonLink to="/proyectos">Ir a proyectos</ButtonLink>
              )}
              {tasks.length ? (
                <Button
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                    setIncludeArchived(true);
                    setSearchParams({});
                  }}
                >
                  Limpiar filtros
                </Button>
              ) : null}
            </div>
          )}
          <aside className="task-aside">
            <Panel title="Tareas del proyecto" icon="tasks">
              <InputField
                label="Buscar tarea"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar tarea, proyecto o ID de Odoo…"
              />
              <div className="backlog">
                {pageTasks.map((task) => {
                  const logged = totals(task.id).logged;
                  return (
                    <div
                      key={task.id}
                      className={`backlog__item ${selected?.id === task.id ? 'backlog__item--selected' : ''}`}
                    >
                      <button
                        type="button"
                        className="backlog__select"
                        aria-pressed={selected?.id === task.id}
                        onClick={() => setSelectedId(task.id)}
                      >
                        <span className="eyebrow accent">
                          {taskStatusLabels[task.estado]}
                          {task.archivado_en ? ' · Archivada' : ''}
                        </span>
                        <strong>{task.titulo}</strong>
                        <span className="muted">{projectById.get(task.proyecto_id)?.nombre}</span>
                        <span className="mono dim">
                          {formatDuration(logged)} /{' '}
                          {task.estimacion_minutos !== null
                            ? formatDuration(task.estimacion_minutos * 60)
                            : 'Sin estimar'}
                        </span>
                        {task.estimacion_minutos && task.estimacion_minutos > 0 ? (
                          <Progress
                            value={(logged / (task.estimacion_minutos * 60)) * 100}
                            label={`Estimación de ${task.titulo}`}
                          />
                        ) : null}
                      </button>
                      <OdooLink task={task} />
                    </div>
                  );
                })}
              </div>
              {visible.length ? (
                <TaskPagination
                  page={page}
                  pages={pages}
                  total={visible.length}
                  pageSize={pageSize}
                  onChange={(next) => setPagination({ key: filterKey, page: next })}
                />
              ) : null}
              {!visible.length ? <p className="muted">No hay tareas con estos filtros.</p> : null}
              <Button
                icon="plus"
                className="full-width"
                disabled={!canCreate}
                onClick={() => setCreateOpen(true)}
              >
                Crear tarea
              </Button>
            </Panel>
            <Notice title="Inicio y fin exactos" icon="settings">
              El redondeo se aplica únicamente a la duración total de cada parte finalizado.
            </Notice>
          </aside>
        </div>
      )}
      {createOpen ? (
        <TaskForm projects={projects} projectId={projectId} onClose={() => setCreateOpen(false)} />
      ) : null}
    </div>
  );
}
