import { useState } from 'react';
import type { ReactNode } from 'react';
import { DateTime } from 'luxon';
import { Link } from 'react-router-dom';
import { Button, IconButton } from '../../shared/ui/Button';
import { Panel, Badge, Notice, Progress } from '../../shared/ui/Panel';
import { Icon } from '../../shared/ui/Icon';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { StartTimerButton } from '../tracker/StartTimerButton';
import { useTracker } from '../tracker/useTracker';
import { useAttendance } from '../attendance/useAttendance';
import { ManualAttendanceButton } from '../attendance/ManualAttendanceButton';
import { formatImputedPercent } from '../attendance/attendanceLabels';
import { OdooLink } from '../tasks/components/OdooLink';
import { TaskForm } from '../tasks/components/TaskForm';
import { OdooEntryStatus } from '../time-entries/components/OdooEntryStatus';
import { EntryModal } from '../time-entries/components/EntryModal';
import { useWorkspace } from '../workspace/useWorkspace';
import { paths } from '../../app/paths';
import { attendanceDays, attendanceTotal } from '../../domain/attendance';
import { formatClock, formatDate, formatDuration } from '../../domain/time';
import { readableError } from '../../lib/supabase/errors';
import type { TimeEntry, WorkspaceData } from '../../domain/models';
import { dashboardSummary } from './dashboardSelectors';
import { entriesForDay, relevantTasks, todayMetrics } from './today.model';
import type { RelevantReason } from './today.model';
import './today.css';

const reasonLabels: Partial<Record<RelevantReason, string>> = {
  active: 'En marcha',
  paused: 'Pausada',
  in_progress: 'En curso',
};

function hourMinute(iso: string, zone: string) {
  return DateTime.fromISO(iso, { zone }).toFormat('HH:mm');
}

function lastWorkedLabel(iso: string, today: string, zone: string) {
  const at = DateTime.fromISO(iso, { zone });
  const days = DateTime.fromISO(today, { zone }).diff(at.startOf('day'), 'days').days;
  if (days < 1) return `Hoy, ${at.toFormat('HH:mm')}`;
  if (days < 2) return 'Ayer';
  return at.setLocale('es').toFormat('d LLL');
}

function Metric({
  label,
  value,
  title,
  children,
  tone,
}: {
  label: string;
  value: string;
  title?: string;
  children?: ReactNode;
  tone?: 'accent';
}) {
  return (
    <div className={`today-metric ${tone ? `today-metric--${tone}` : ''}`}>
      <p className="today-metric__label">{label}</p>
      <p className="today-metric__value" title={title}>
        {value}
      </p>
      <div className="today-metric__detail">{children}</div>
    </div>
  );
}

function WeekDetails({ data, today, now }: { data: WorkspaceData; today: string; now: string }) {
  const { week, total, missingDays } = dashboardSummary(data, today);
  const days = attendanceDays(
    data.fichajes,
    data.entries,
    week.map((day) => day.date),
    data.profile.zona_horaria,
    now,
  );
  const weekTotal = attendanceTotal(days);
  const workedToDate = days.reduce(
    (sum, day) => sum + (day.date <= today ? day.workedSeconds : 0),
    0,
  );
  const balance = workedToDate - total.due;
  return (
    <details className="today-week">
      <summary>
        <Icon name="chevron" size={16} className="today-week__chevron" />
        <span>Esta semana</span>
        <span className="today-week__summary mono">
          {formatDuration(weekTotal.workedSeconds)} fichadas
          {weekTotal.imputedPercent === null
            ? ''
            : ` · ${formatImputedPercent(weekTotal.imputedPercent)} imputado`}
        </span>
      </summary>
      <div className="today-week__body">
        <dl className="today-week__stats">
          <div>
            <dt>Fichado</dt>
            <dd className="mono">{formatDuration(weekTotal.workedSeconds)}</dd>
          </div>
          <div>
            <dt>Imputado</dt>
            <dd className="mono">{formatDuration(weekTotal.imputedSeconds)}</dd>
          </div>
          <div>
            <dt>% imputado</dt>
            <dd className="mono">{formatImputedPercent(weekTotal.imputedPercent)}</dd>
          </div>
          <div>
            <dt>Saldo frente al objetivo hasta hoy</dt>
            <dd className="mono">
              {balance >= 0 ? '+' : '−'}
              {formatDuration(Math.abs(balance))}
            </dd>
          </div>
        </dl>
        {missingDays ? (
          <Notice title="Hay jornadas sin generar esta semana" tone="warning">
            Genera la semana para fijar los objetivos diarios.
          </Notice>
        ) : null}
        <div className="actions">
          <Link className="text-link" to={paths.week}>
            Abrir Mi semana <Icon name="arrow" size={14} />
          </Link>
          <Link className="text-link" to={`${paths.attendance}?fecha=${today}`}>
            Ver fichajes y gráfico semanal <Icon name="arrow" size={14} />
          </Link>
        </div>
      </div>
    </details>
  );
}

export default function DashboardPage() {
  const { data } = useWorkspace();
  const tracker = useTracker();
  const attendance = useAttendance();
  const notify = useFeedback();
  const [editor, setEditor] = useState<TimeEntry | 'new' | null>(null);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  if (!data) return null;
  const { profile, tasks, projects } = data;
  const zone = profile.zona_horaria;
  const now = attendance.now;
  const today = DateTime.fromISO(now, { zone }).toISODate()!;
  const metrics = todayMetrics(data, today, now);
  // The running entry may not be in the cached list yet; show it as soon as the tracker knows it.
  const liveEntry = tracker.active;
  const activity = entriesForDay(
    liveEntry && !data.entries.some((entry) => entry.id === liveEntry.id)
      ? [...data.entries, liveEntry]
      : data.entries,
    today,
    zone,
    now,
  );
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const suggestions = relevantTasks(data, {
    activeTaskId: tracker.active?.tarea_id,
    pausedTaskId: tracker.pausedTaskId,
  });
  const currentTask = taskById.get(tracker.active?.tarea_id ?? tracker.pausedTaskId ?? '');
  const currentProject = projectById.get(currentTask?.proyecto_id ?? '');
  const activeProjects = projects.filter(
    (project) => !project.archivado_en && !project.eliminado_en,
  );
  const canRegister = suggestions.length > 0;
  const timerBlocked = tracker.busy || tracker.pending;
  const attendanceBlocked = attendance.busy || attendance.pending;
  const percent = metrics.imputedPercent;
  const firstName = profile.nombre.split(' ')[0];

  async function run(work: () => Promise<void>) {
    try {
      await work();
    } catch (cause) {
      notify(readableError(cause), 'error');
    }
  }

  return (
    <div className="today">
      <header className="today__header">
        <div>
          <h1>Hoy</h1>
          <p className="page-description today__date">
            {formatDate(today, zone)}
            {firstName ? ` · Hola, ${firstName}` : ''}
          </p>
        </div>
        <div className="page-actions">
          <Button
            icon="tasks"
            disabled={!activeProjects.length}
            title={activeProjects.length ? undefined : 'Crea un proyecto activo primero'}
            onClick={() => setTaskFormOpen(true)}
          >
            Nueva tarea
          </Button>
          <Button
            variant="primary"
            icon="plus"
            disabled={!canRegister}
            onClick={() => setEditor('new')}
          >
            Registrar tiempo
          </Button>
        </div>
      </header>

      <section className="today-metrics" aria-label="Resumen de hoy">
        <Metric
          label="Fichado hoy"
          value={formatDuration(metrics.workedSeconds)}
          title={`${formatClock(metrics.workedSeconds)} exactas`}
        >
          {attendance.active ? (
            <span className="today-tag today-tag--live">
              <span className="status-dot status-dot--success" aria-hidden="true" />
              Incluye {formatDuration(metrics.provisionalSeconds)} en curso (provisional)
            </span>
          ) : metrics.workedSeconds ? (
            'Jornada fuera · tramos cerrados'
          ) : (
            'Todavía no has fichado hoy'
          )}
        </Metric>
        <Metric
          label="Imputado a tareas"
          value={formatDuration(metrics.imputedSeconds)}
          tone="accent"
        >
          <span>
            {metrics.finishedEntries === 1
              ? '1 parte finalizado'
              : `${metrics.finishedEntries} partes finalizados`}
            {tracker.active
              ? ` · ${formatDuration(tracker.elapsedSeconds)} en curso sin contar`
              : ''}
          </span>
          {metrics.finishedEntries ? (
            <span className="today-metric__odoo">
              <Icon
                name={metrics.odooMarked === metrics.finishedEntries ? 'check' : 'clock'}
                size={14}
              />
              Marcados en Odoo: {metrics.odooMarked} de {metrics.finishedEntries}
            </span>
          ) : null}
        </Metric>
        <Metric label="% imputado" value={percent === null ? '—' : formatImputedPercent(percent)}>
          {percent === null ? (
            'Se calcula cuando fiches la entrada'
          ) : (
            <>
              <Progress
                value={percent}
                label="Porcentaje del tiempo fichado imputado a tareas"
                tone={percent > 100 ? 'warning' : 'accent'}
              />
              <span>
                {percent > 100
                  ? 'Supera el 100 % por el redondeo de los partes'
                  : 'Imputado ÷ fichado hoy'}
              </span>
            </>
          )}
        </Metric>
      </section>

      <section className="today-now" aria-label="Ahora">
        <div className={`now-card ${attendance.active ? 'now-card--attendance' : ''}`}>
          <div className="now-card__head">
            <h2>Jornada</h2>
            <Badge tone={attendance.active ? 'success' : 'neutral'}>
              {attendance.active ? 'Dentro' : 'Fuera'}
            </Badge>
          </div>
          <div className="now-card__main">
            {attendance.active ? (
              <>
                <span className="now-card__clock mono" aria-label="Tiempo desde la entrada">
                  {formatClock(attendance.elapsedSeconds)}
                </span>
                <span className="now-card__meta">
                  Entrada a las {hourMinute(attendance.active.inicio_en, zone)}
                </span>
              </>
            ) : (
              <span className="now-card__meta">
                {metrics.workedSeconds
                  ? 'Has fichado la salida. Ficha de nuevo al volver.'
                  : 'Ficha la entrada cuando empieces tu jornada.'}
              </span>
            )}
          </div>
          <div className="now-card__actions">
            {attendance.pending ? (
              <Button
                variant="primary"
                loading={attendance.busy}
                disabled={attendance.busy}
                onClick={() => void attendance.retry().catch(() => undefined)}
              >
                Reintentar fichaje
              </Button>
            ) : (
              <Button
                variant={attendance.active ? 'secondary' : 'primary'}
                icon={attendance.active ? 'logout' : 'login'}
                loading={attendance.busy}
                disabled={attendanceBlocked}
                onClick={() =>
                  void (attendance.active ? attendance.stop() : attendance.start()).catch(
                    () => undefined,
                  )
                }
              >
                {attendance.active ? 'Fichar salida' : 'Fichar entrada'}
              </Button>
            )}
            <ManualAttendanceButton variant="ghost" size="sm" />
          </div>
        </div>

        <div className={`now-card ${tracker.active ? 'now-card--live surface-bone' : ''}`}>
          <div className="now-card__head">
            <h2>Tarea en curso</h2>
            {tracker.pending ? (
              <Badge tone="warning">Pendiente de confirmar</Badge>
            ) : tracker.active ? (
              <Badge tone="accent">
                <span className="status-dot status-dot--live" aria-hidden="true" /> Grabando
              </Badge>
            ) : tracker.pausedTaskId ? (
              <Badge>Pausada</Badge>
            ) : null}
          </div>
          {currentTask || tracker.pending ? (
            <>
              <div className="now-card__main now-card__main--task">
                <div className="now-card__task">
                  <strong>{currentTask?.titulo ?? 'Tarea'}</strong>
                  <span className="now-card__meta">
                    {currentProject?.nombre}
                    {tracker.active
                      ? ` · desde las ${hourMinute(tracker.active.inicio_en, tracker.active.zona_horaria)}`
                      : ''}
                  </span>
                  <OdooLink task={currentTask} />
                </div>
                <span className="now-card__clock mono" aria-label="Duración de la sesión">
                  {formatClock(tracker.elapsedSeconds)}
                </span>
              </div>
              <div className="now-card__actions">
                {tracker.pending ? (
                  <Button
                    variant="primary"
                    icon="refresh"
                    disabled={tracker.busy}
                    onClick={() => void run(tracker.retryPending)}
                  >
                    Reintentar
                  </Button>
                ) : tracker.active ? (
                  <>
                    <Button
                      variant="primary"
                      icon="stop"
                      loading={tracker.busy}
                      disabled={timerBlocked}
                      onClick={() => void run(tracker.stop)}
                    >
                      Detener y guardar
                    </Button>
                    <Button
                      icon="pause"
                      disabled={timerBlocked}
                      onClick={() => void run(tracker.pause)}
                    >
                      Pausar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="primary"
                      icon="play"
                      loading={tracker.busy}
                      disabled={timerBlocked}
                      onClick={() => void run(tracker.resume)}
                    >
                      Reanudar
                    </Button>
                    <StartTimerButton taskId={tracker.pausedTaskId ?? undefined} />
                  </>
                )}
              </div>
              {tracker.active ? (
                <p className="now-card__hint">
                  Tiempo provisional: se convierte en parte al detener.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <div className="now-card__main">
                <span className="now-card__meta">
                  {canRegister
                    ? 'No hay ninguna tarea en marcha. Empieza una desde “Retomar trabajo”.'
                    : 'Crea un proyecto y una tarea para empezar a registrar tiempo.'}
                </span>
              </div>
              <div className="now-card__actions">
                <StartTimerButton disabled={!canRegister} />
              </div>
            </>
          )}
        </div>
      </section>

      <div className="today-grid">
        <Panel
          title="Retomar trabajo"
          action={
            <Link className="text-link" to={paths.tasks}>
              Todas las tareas <Icon name="arrow" size={14} />
            </Link>
          }
        >
          {suggestions.length ? (
            <ul className="resume-list">
              {suggestions.map(({ task, project, reason, lastWorkedAt }) => {
                const isActive = reason === 'active';
                return (
                  <li
                    key={task.id}
                    className={`resume-row ${isActive ? 'resume-row--active' : ''}`}
                  >
                    <IconButton
                      icon={isActive ? 'stop' : 'play'}
                      label={`${isActive ? 'Detener' : 'Empezar'}: ${task.titulo}`}
                      className={isActive ? 'icon-button--accent' : 'resume-row__play'}
                      disabled={timerBlocked || (!!tracker.active && !isActive)}
                      onClick={() =>
                        void run(() => (isActive ? tracker.stop() : tracker.start(task.id)))
                      }
                    />
                    <div className="resume-row__text">
                      <Link to={`${paths.tasks}?proyecto=${task.proyecto_id}`}>{task.titulo}</Link>
                      <span>
                        {project?.nombre}
                        {lastWorkedAt && !isActive
                          ? ` · ${lastWorkedLabel(lastWorkedAt, today, zone)}`
                          : ''}
                      </span>
                    </div>
                    {reasonLabels[reason] ? (
                      <Badge tone={isActive ? 'accent' : 'neutral'}>{reasonLabels[reason]}</Badge>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state">
              <Icon name="tasks" size={28} />
              <p>
                {activeProjects.length
                  ? 'No tienes tareas abiertas.'
                  : 'Crea un proyecto y una tarea para empezar.'}
              </p>
              {activeProjects.length ? (
                <Button icon="plus" onClick={() => setTaskFormOpen(true)}>
                  Nueva tarea
                </Button>
              ) : (
                <Link className="button button--secondary" to={paths.projects}>
                  Ir a proyectos
                </Link>
              )}
            </div>
          )}
        </Panel>

        <Panel
          title="Actividad de hoy"
          action={
            <Link className="text-link" to={paths.entries}>
              Todos los partes <Icon name="arrow" size={14} />
            </Link>
          }
        >
          {activity.length ? (
            <ul className="activity-list">
              {activity.map((entry) => {
                const task = taskById.get(entry.tarea_id);
                const live = !entry.fin_en;
                const crossesDay = !live && entry.fecha !== today;
                return (
                  <li key={entry.id} className={`activity-row ${live ? 'activity-row--live' : ''}`}>
                    <span className="activity-row__time mono">
                      {hourMinute(entry.inicio_en, entry.zona_horaria)}
                      <span aria-hidden="true">–</span>
                      <span className="sr-only"> a </span>
                      {live ? 'ahora' : hourMinute(entry.fin_en!, entry.zona_horaria)}
                    </span>
                    <div className="activity-row__text">
                      <strong>{task?.titulo ?? 'Tarea no disponible'}</strong>
                      <span className="activity-row__meta">
                        {projectById.get(entry.proyecto_id)?.nombre}
                        {crossesDay ? ' · cruza medianoche' : ''}
                      </span>
                      {entry.descripcion ? (
                        <span className="activity-row__note">{entry.descripcion}</span>
                      ) : null}
                    </div>
                    <div className="activity-row__duration">
                      {live ? (
                        <>
                          <strong className="mono">
                            {formatDuration(
                              tracker.active?.id === entry.id
                                ? tracker.elapsedSeconds
                                : (Date.parse(now) - Date.parse(entry.inicio_en)) / 1000,
                            )}
                          </strong>
                          <span>Provisional</span>
                        </>
                      ) : (
                        <>
                          <strong className="mono" title="Duración imputada (con redondeo)">
                            {formatDuration(entry.duracion_imputada_segundos ?? 0)}
                          </strong>
                          <span title="Duración real exacta">
                            Real {formatDuration(entry.duracion_real_segundos ?? 0)}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="activity-row__status">
                      {live ? (
                        <Badge tone="accent">En curso</Badge>
                      ) : (
                        <OdooEntryStatus entry={entry} />
                      )}
                    </div>
                    {live ? (
                      <span className="activity-row__action" />
                    ) : (
                      <IconButton
                        icon="edit"
                        label={`Editar parte: ${task?.titulo ?? 'tarea'}`}
                        className="activity-row__action"
                        onClick={() => setEditor(entry)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="empty-state">
              <Icon name="clock" size={28} />
              <p>Todavía no hay registros hoy.</p>
              <Button icon="plus" disabled={!canRegister} onClick={() => setEditor('new')}>
                Registrar tiempo
              </Button>
            </div>
          )}
        </Panel>
      </div>

      <WeekDetails data={data} today={today} now={now} />

      <EntryModal
        open={editor !== null}
        entry={editor && editor !== 'new' ? editor : null}
        date={today}
        onClose={() => setEditor(null)}
      />
      {taskFormOpen ? (
        <TaskForm projects={projects} onClose={() => setTaskFormOpen(false)} />
      ) : null}
    </div>
  );
}
