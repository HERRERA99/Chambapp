import { useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import { Link } from 'react-router-dom';
import type { TimeEntry } from '../../domain/models';
import { formatDate, formatDuration, formatTime } from '../../domain/time';
import { readableError } from '../../lib/supabase/errors';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { Button, ButtonLink, IconButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Badge, Panel } from '../../shared/ui/Panel';
import { AttendanceControls } from '../attendance/AttendanceControls';
import { useAttendance } from '../attendance/useAttendance';
import { formatHoursMinutes } from '../extension/protocol';
import { OdooLink } from '../tasks/components/OdooLink';
import { EntryModal } from '../time-entries/components/EntryModal';
import { OdooEntryStatus } from '../time-entries/components/OdooEntryStatus';
import { TimerDisplay } from '../tracker/TimerDisplay';
import { useTracker } from '../tracker/useTracker';
import { useWorkspace } from '../workspace/useWorkspace';
import { dashboardSummary, formatDashboardPercent } from './dashboardSelectors';
import './dashboard.css';

function hoursMinutes(seconds: number) {
  return formatHoursMinutes(Math.floor(seconds / 60));
}

export default function DashboardPage() {
  const { data } = useWorkspace();
  const tracker = useTracker();
  const attendance = useAttendance();
  const notify = useFeedback();
  const [editor, setEditor] = useState<TimeEntry | 'new' | null>(null);
  const zone = data?.profile.zona_horaria ?? 'Europe/Madrid';
  const today = DateTime.fromISO(attendance.now, { zone }).toISODate()!;
  const summary = useMemo(
    () => (data ? dashboardSummary(data, today, attendance.now) : null),
    [data, today, attendance.now],
  );
  if (!data || !summary) return null;

  const { profile, entries, tasks, projects } = data;
  const { today: todaySummary, alerts } = summary;
  const activeTask = tasks.find((task) => task.id === tracker.active?.tarea_id);
  const activeProject = projects.find((project) => project.id === activeTask?.proyecto_id);
  const available = tasks.filter(
    (task) =>
      !task.archivado_en &&
      task.estado !== 'completada' &&
      projects.some((project) => project.id === task.proyecto_id && !project.archivado_en),
  );
  const priority = [...available]
    .sort((a, b) => Number(b.id === activeTask?.id) - Number(a.id === activeTask?.id))
    .slice(0, 4);
  const taskTotals = new Map<string, number>();
  for (const entry of entries)
    if (!entry.eliminado_en && entry.fin_en)
      taskTotals.set(
        entry.tarea_id,
        (taskTotals.get(entry.tarea_id) ?? 0) + (entry.duracion_imputada_segundos ?? 0),
      );
  const todayEntries = entries.filter(
    (entry) => !entry.eliminado_en && entry.fecha === today && entry.fin_en,
  );

  async function toggleTask(id: string) {
    try {
      if (tracker.active?.tarea_id === id) await tracker.stop();
      else await tracker.start(id);
    } catch (cause) {
      notify(readableError(cause));
    }
  }

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Tu jornada"
        title={`Hola, ${profile.nombre.split(' ')[0] || 'de nuevo'}`}
        description={formatDate(today, profile.zona_horaria)}
        actions={
          <Button icon="plus" onClick={() => setEditor('new')}>
            Nuevo registro
          </Button>
        }
      />
      <Panel title="Entrada y salida de jornada" icon="clock">
        <AttendanceControls />
      </Panel>
      <section className="panel today-strip" aria-label="Resumen de hoy">
        <div className="today-strip__metrics">
          <div className="today-strip__item">
            <span className="eyebrow">Fichado</span>
            <span className="mono today-strip__value">
              {hoursMinutes(todaySummary.workedSeconds)}
              {todaySummary.provisional ? <small className="muted"> provisional</small> : null}
            </span>
          </div>
          <div className="today-strip__item">
            <span className="eyebrow">Imputado</span>
            <span className="mono today-strip__value">
              {hoursMinutes(todaySummary.imputedSeconds)}
            </span>
          </div>
          <div className="today-strip__item">
            <span className="eyebrow">% del día</span>
            <strong
              className="mono today-strip__value today-strip__percent"
              data-tone={todaySummary.tone ?? undefined}
            >
              {formatDashboardPercent(todaySummary.imputedPercent)}
            </strong>
          </div>
        </div>
        <Link className="text-link" to="/semana">
          Ver semana <Icon name="arrow" size={14} />
        </Link>
      </section>
      {alerts.length ? (
        <ul className="dashboard-alerts" aria-label="Avisos de la semana">
          {alerts.map((alert) => (
            <li key={alert.id}>
              <Link to="/semana" className="dashboard-alert" data-tone={alert.tone}>
                <Icon name={alert.kind === 'odoo' ? 'send' : 'gauge'} size={15} />
                <span>{alert.label}</span>
                <Icon name="arrow" size={14} className="dashboard-alert__arrow" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <section className="tracker-hero">
        <div className="tracker-hero__details">
          <Badge tone={tracker.active ? 'accent' : 'neutral'}>
            {tracker.active ? (
              <>
                <span className="status-dot" /> En curso
              </>
            ) : tracker.pausedTaskId ? (
              'Pausado'
            ) : (
              'Listo para empezar'
            )}
          </Badge>
          <p className="eyebrow">{activeProject?.nombre ?? 'Tu espacio de trabajo'}</p>
          <h2>{activeTask?.titulo ?? 'Selecciona una tarea y registra tu tiempo'}</h2>
          <OdooLink task={activeTask} />
          <p className="mono muted">
            <Icon name="clock" size={13} />{' '}
            {tracker.active
              ? `Inicio exacto: ${formatTime(tracker.active.inicio_en, tracker.active.zona_horaria)}`
              : 'Cada sesión conserva su inicio y fin exactos.'}
          </p>
        </div>
        <TimerDisplay />
      </section>
      <div className="two-columns">
        <Panel
          title="Tareas pendientes"
          icon="tasks"
          action={<span className="mono dim">{available.length} tareas</span>}
        >
          <div className="task-list">
            {priority.length ? (
              priority.map((task) => (
                <div className="task-row" key={task.id}>
                  <IconButton
                    icon={task.id === activeTask?.id ? 'stop' : 'play'}
                    label={`${task.id === activeTask?.id ? 'Detener' : 'Iniciar'}: ${task.titulo}`}
                    disabled={
                      tracker.busy ||
                      tracker.pending ||
                      (!!tracker.active && task.id !== activeTask?.id)
                    }
                    onClick={() => void toggleTask(task.id)}
                    className={task.id === activeTask?.id ? 'icon-button--accent' : ''}
                  />
                  <div className="task-row__text">
                    {task.id === activeTask?.id ? (
                      <span className="eyebrow accent">En curso</span>
                    ) : null}
                    <Link to="/tareas">
                      <strong>{task.titulo}</strong>
                    </Link>
                    <OdooLink task={task} />
                    <span className="muted mono">
                      {projects.find((project) => project.id === task.proyecto_id)?.nombre}
                    </span>
                  </div>
                  <span className="mono">{formatDuration(taskTotals.get(task.id) ?? 0)}</span>
                </div>
              ))
            ) : (
              <div className="empty-state">
                <Icon name="tasks" size={30} />
                <p className="muted">Crea un proyecto y una tarea para empezar.</p>
                <ButtonLink to="/tareas">Abrir tareas</ButtonLink>
              </div>
            )}
          </div>
          <Link className="text-link" to="/tareas">
            Ver todas las tareas <Icon name="arrow" size={14} />
          </Link>
        </Panel>
        <Panel
          title="Partes registrados hoy"
          icon="clock"
          action={
            <span className="mono accent">
              Total: {formatDuration(todaySummary.imputedSeconds)}
            </span>
          }
        >
          {todayEntries.length ? (
            todayEntries.slice(0, 4).map((entry) => (
              <div className="entry-summary" key={entry.id}>
                <div>
                  <strong className="mono">
                    {formatTime(entry.inicio_en, entry.zona_horaria)} —{' '}
                    {formatTime(entry.fin_en!, entry.zona_horaria)}
                  </strong>
                  <span className="muted">
                    {projects.find((project) => project.id === entry.proyecto_id)?.nombre}
                  </span>
                  <p>{tasks.find((task) => task.id === entry.tarea_id)?.titulo}</p>
                  <OdooEntryStatus entry={entry} />
                  <OdooLink task={tasks.find((task) => task.id === entry.tarea_id)} />
                  <span className="mono dim entry-summary__duration">
                    Real: {formatDuration(entry.duracion_real_segundos ?? 0)}{' '}
                    <span className="accent">
                      → Imputado: {formatDuration(entry.duracion_imputada_segundos ?? 0)}
                    </span>
                  </span>
                </div>
                <IconButton icon="edit" label="Editar parte" onClick={() => setEditor(entry)} />
              </div>
            ))
          ) : (
            <p className="muted section-intro">Todavía no hay partes cerrados hoy.</p>
          )}
          {tracker.active ? (
            <div className="entry-summary entry-summary--live">
              <span className="status-dot" />
              <div>
                <strong>Tramo en curso</strong>
                <OdooEntryStatus entry={tracker.active} />
                <p className="muted">Duración provisional; se consolida al detener.</p>
              </div>
              <Badge tone="accent">{formatDuration(tracker.elapsedSeconds)}</Badge>
            </div>
          ) : null}
          <Link className="text-link" to="/partes-de-horas">
            Abrir partes de horas <Icon name="arrow" size={14} />
          </Link>
        </Panel>
      </div>
      <EntryModal
        open={editor !== null}
        entry={editor && editor !== 'new' ? editor : null}
        onClose={() => setEditor(null)}
      />
    </div>
  );
}
