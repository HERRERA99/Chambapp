import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { downloadCsv } from '../../lib/export';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Notice } from '../../shared/ui/Panel';
import { Modal } from '../../shared/ui/Modal';
import { useWorkspace } from '../workspace/useWorkspace';
import { useTracker } from '../tracker/useTracker';
import { entryTotalsBy } from '../time-entries/entryTotals';
import { TaskForm } from './components/TaskForm';
import { TaskDetail } from './components/TaskDetail';
import { TaskQueue } from './components/TaskQueue';
import { TaskPagination } from './components/TaskPagination';
import { ArchivedTaskCards } from './components/ArchivedTaskCards';
import { taskStatusLabels } from './taskLabels';
import { archivePageSize, paginate, pickFocus, taskQueue } from './taskQueue';

export default function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const projectId = searchParams.get('proyecto');
  const { data, isLoading, error, reload } = useWorkspace();
  const tracker = useTracker();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [archiveMode, setArchiveMode] = useState(false);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [popupId, setPopupId] = useState<string | null>(null);
  const [archivePage, setArchivePage] = useState({ key: '', page: 1 });
  const projects = data?.projects.filter((project) => !project.eliminado_en) ?? [];
  const tasks = data?.tasks.filter((task) => !task.eliminado_en) ?? [];
  const entries = data?.entries.filter((entry) => !entry.eliminado_en) ?? [];
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const queue = taskQueue({ tasks, projects, query, projectId });
  const activeTaskId = tracker.active?.tarea_id ?? null;
  const focus = pickFocus({ queue, selectedId, activeTaskId, tasks });
  const canCreate = projects.some((project) => !project.archivado_en);
  const taskTotals = entryTotalsBy(entries, 'tarea_id');
  const totals = (id: string) => taskTotals.get(id) ?? { real: 0, logged: 0, count: 0 };
  // The focused task is shown on the left, so the queue omits it (not in archive mode).
  const others = (list: typeof tasks) =>
    archiveMode ? list : list.filter((task) => task.id !== focus?.id);
  // The archive page resets whenever the search, project or mode changes.
  const filterKey = JSON.stringify([query, projectId, archiveMode]);
  if (archivePage.key !== filterKey) setArchivePage({ key: filterKey, page: 1 });
  const archive = paginate(
    queue.hidden,
    archivePage.key === filterKey ? archivePage.page : 1,
    archivePageSize,
  );
  // Hidden matches only appear in the queue while searching outside archive mode.
  const hiddenPreview = !archiveMode && query.trim() ? queue.hidden : [];
  const listed = archiveMode ? queue.hidden : queue.active;
  // A task that disappears (e.g. deleted from the popup) closes the popup.
  const popupTask = tasks.find((task) => task.id === popupId);

  function setProject(value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('proyecto', value);
    else next.delete('proyecto');
    setSearchParams(next);
  }

  function exportTasks() {
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
      listed.map((task) => [
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
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Trabajo / Tareas"
        title="Tareas"
        actions={
          <>
            <Button icon="download" disabled={!listed.length} onClick={exportTasks}>
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
      {isLoading && !data ? (
        <p role="status">Cargando tareas…</p>
      ) : (
        <div className="task-workspace">
          {archiveMode ? (
            <section className="archived-view" aria-labelledby="archived-view-title">
              <header className="archived-view__header">
                <h2 id="archived-view-title">Finalizadas y archivadas</h2>
                <span className="mono dim">{queue.hidden.length}</span>
              </header>
              {queue.hidden.length ? (
                <>
                  <ArchivedTaskCards
                    tasks={archive.items}
                    projects={projects}
                    logged={(id) => totals(id).logged}
                    onOpen={(task) => setPopupId(task.id)}
                  />
                  {archive.pages > 1 ? (
                    <TaskPagination
                      page={archive.page}
                      pages={archive.pages}
                      total={queue.hidden.length}
                      pageSize={archivePageSize}
                      onChange={(page) => setArchivePage({ key: filterKey, page })}
                    />
                  ) : null}
                </>
              ) : (
                <p className="muted">Ninguna tarea finalizada o archivada coincide.</p>
              )}
            </section>
          ) : focus ? (
            <TaskDetail
              key={focus.id}
              task={focus}
              projects={projects}
              entries={entries.filter((entry) => entry.tarea_id === focus.id)}
            />
          ) : (
            <div className="empty-state">
              <h2>
                {tasks.length ? 'No hay tareas activas con estos filtros' : 'Crea tu primera tarea'}
              </h2>
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
              {query || projectId ? (
                <Button
                  onClick={() => {
                    setQuery('');
                    setProject(null);
                  }}
                >
                  Limpiar filtros
                </Button>
              ) : null}
            </div>
          )}
          <TaskQueue
            inProgress={others(queue.inProgress)}
            pending={others(queue.pending)}
            hidden={hiddenPreview}
            projects={projects}
            focusId={focus?.id}
            activeTaskId={activeTaskId}
            query={query}
            projectId={projectId}
            archiveMode={archiveMode}
            totals={totals}
            onQuery={setQuery}
            onProject={setProject}
            onArchiveMode={setArchiveMode}
            onSelect={(task) => {
              setSelectedId(task.id);
              setArchiveMode(false);
            }}
            onOpen={(task) => setPopupId(task.id)}
          />
        </div>
      )}
      {popupTask ? (
        <Modal open size="wide" title="Detalle de tarea" onClose={() => setPopupId(null)}>
          <TaskDetail
            key={popupTask.id}
            task={popupTask}
            projects={projects}
            entries={entries.filter((entry) => entry.tarea_id === popupTask.id)}
          />
        </Modal>
      ) : null}
      {createOpen ? (
        <TaskForm projects={projects} projectId={projectId} onClose={() => setCreateOpen(false)} />
      ) : null}
    </div>
  );
}
