import { useMemo, useState } from 'react';
import { DateTime } from 'luxon';
import type { TimeEntry, Workday } from '../../domain/models';
import { formatClock, formatDuration, mondayForDate } from '../../domain/time';
import { downloadCsv } from '../../lib/export';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Button, ButtonLink, IconButton } from '../../shared/ui/Button';
import { StatGrid } from '../../shared/ui/StatGrid';
import { Panel, Notice, Progress, Badge } from '../../shared/ui/Panel';
import { DayCard } from './components/DayCard';
import { DayGoalModal } from './components/DayGoalModal';
import { WeekChart } from './components/WeekChart';
import { WeekReport } from './components/WeekReport';
import { EntryModal } from '../time-entries/components/EntryModal';
import { AttendanceComparison } from '../attendance/AttendanceComparison';
import { useAttendance } from '../attendance/useAttendance';
import { useWorkspace } from '../workspace/useWorkspace';
import { useCommand } from '../workspace/useCommand';
import { useTracker } from '../tracker/useTracker';
import { buildWeek, describeBalance } from './week.model';
import './week.css';

type EntryForm = { entry?: TimeEntry; date?: string };

export default function WeekPage() {
  const { data, isLoading, error, reload } = useWorkspace();
  const { run, pending } = useCommand();
  const tracker = useTracker();
  const attendance = useAttendance();
  const [selectedMonday, setSelectedMonday] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState<EntryForm | null>(null);
  const [goal, setGoal] = useState<Workday | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const today = DateTime.fromISO(attendance.now, {
    zone: data?.profile.zona_horaria ?? 'Europe/Madrid',
  }).toISODate()!;
  const monday = selectedMonday ?? mondayForDate(today);
  const week = useMemo(
    () => (data ? buildWeek(data, monday, today, attendance.now) : null),
    [data, monday, today, attendance.now],
  );

  async function generate() {
    setCommandError(null);
    try {
      await run('generar_semana', { lunes: monday });
    } catch (cause) {
      setCommandError(cause instanceof Error ? cause.message : 'No se pudo generar la semana.');
    }
  }
  async function stopTimer() {
    setCommandError(null);
    try {
      await tracker.stop();
    } catch (cause) {
      setCommandError(cause instanceof Error ? cause.message : 'No se pudo detener el cronómetro.');
    }
  }
  function moveWeek(weeks: number) {
    setSelectedMonday(DateTime.fromISO(monday, { zone: 'UTC' }).plus({ weeks }).toISODate()!);
  }
  function exportWeek() {
    if (!week) return;
    downloadCsv(
      `chambapp-semana-${monday}.csv`,
      [
        'Fecha',
        'Proyecto',
        'Cliente',
        'Tarea',
        'ID Odoo',
        'Enlace Odoo',
        'Inicio exacto',
        'Fin exacto',
        'Zona horaria',
        'Real (s)',
        'Imputado (s)',
        'Redondeo (min)',
        'Descripción',
        'Estado',
      ],
      week.entries.map(({ entry, project, task }) => [
        entry.fecha,
        project?.nombre ?? '',
        project?.cliente ?? null,
        task?.titulo ?? '',
        task?.odoo_id ?? null,
        task?.odoo_url ?? null,
        entry.inicio_en,
        entry.fin_en,
        entry.zona_horaria,
        entry.duracion_real_segundos,
        entry.duracion_imputada_segundos,
        entry.intervalo_redondeo_minutos,
        entry.descripcion,
        entry.fin_en ? 'Finalizado' : 'En curso',
      ]),
    );
  }

  if (isLoading && !data)
    return (
      <div className="empty-state" role="status">
        Cargando tu semana…
      </div>
    );
  if (!data || !week)
    return (
      <Notice title="No se pudo cargar la semana">
        {error?.message ?? 'La sesión está cargando.'}
        <Button onClick={() => void reload()}>Reintentar</Button>
      </Notice>
    );
  const startDate = DateTime.fromISO(monday, { zone: 'UTC' }).setLocale('es');
  const endDate = startDate.plus({ days: 6 });
  const progress = week.targetSeconds > 0 ? (week.workedSeconds / week.targetSeconds) * 100 : 0;
  const canAdd = week.canAdd;
  const activeInWeek =
    tracker.active && week.days.some((day) => day.date === tracker.active?.fecha);
  return (
    <div className="page-stack week-page">
      <PageHeader
        eyebrow="Operaciones / Planificación / Mi semana"
        title="Mi Semana Laboral & Balances"
        description="Objetivos diarios y horas fichadas de tu jornada laboral."
        actions={
          <>
            <ButtonLink to="/calendario" icon="calendar">
              Festivos y vacaciones
            </ButtonLink>
            <ButtonLink to="/ajustes#jornada" icon="settings">
              Configurar reparto
            </ButtonLink>
            <Button
              variant="primary"
              icon="plus"
              disabled={!canAdd}
              onClick={() => setEntryForm({})}
            >
              Registrar bloque manual
            </Button>
          </>
        }
      />
      {error ? (
        <Notice title="No se pudieron actualizar los datos">
          {error.message}
          <Button onClick={() => void reload()}>Reintentar</Button>
        </Notice>
      ) : null}
      {commandError ? <Notice title="No se ha guardado">{commandError}</Notice> : null}
      <StatGrid
        stats={[
          {
            label: 'Objetivo de jornadas',
            value: formatDuration(week.targetSeconds),
            detail: `${week.workdays} días con objetivo registrado`,
            icon: 'calendar',
            progress,
          },
          {
            label: 'Tiempo fichado semanal',
            value: formatDuration(week.workedSeconds),
            detail:
              week.provisionalSeconds > 0
                ? 'Incluye fichaje en curso · provisional'
                : 'Entradas y salidas de la semana, sin contar pausas',
            icon: 'timer',
            accent: true,
          },
          {
            label: 'Tiempo real en tareas',
            value: formatDuration(week.realSeconds),
            detail: 'Duración exacta de los partes finalizados',
            icon: 'clock',
          },
          {
            label: 'Balance semanal',
            value: `${week.workedSeconds >= week.targetSeconds ? '+' : '−'}${formatDuration(Math.abs(week.workedSeconds - week.targetSeconds))}`,
            detail: `${week.completedAttendanceDays} de ${week.workdays} objetivos cumplidos`,
            icon: 'gauge',
            accent: true,
          },
        ]}
      />
      {!canAdd ? (
        <Notice title="Crea un proyecto y una tarea para registrar tiempo">
          <ButtonLink to="/proyectos" icon="plus">
            Abrir proyectos
          </ButtonLink>
        </Notice>
      ) : null}
      {!week.configuration ? (
        <Notice title="Esta semana todavía no tiene reparto">
          Guarda una configuración que entre en vigor este lunes o antes.
          <ButtonLink to="/ajustes#jornada">Configurar jornada</ButtonLink>
        </Notice>
      ) : week.missingDays > 0 ? (
        <Notice title={`${week.missingDays} jornadas pendientes de generar`}>
          El reparto vigente suma {formatDuration(week.configuration.minutos_semanales * 60)}.
          Generar la semana crea las jornadas que faltan y conserva los objetivos ya guardados.
          <Button onClick={() => void generate()} disabled={pending} icon="calendar">
            {pending ? 'Generando…' : 'Generar jornadas'}
          </Button>
        </Notice>
      ) : null}
      {activeInWeek ? (
        <Notice title="Tramo activo · tiempo provisional">
          {formatClock(tracker.elapsedSeconds)} transcurridos. Se incorporará al tiempo en tareas al
          detener el cronómetro.
        </Notice>
      ) : null}
      <Panel
        title={`Semana ${startDate.weekNumber} · ${startDate.toFormat('dd LLL')} — ${endDate.toFormat('dd LLL yyyy')}`}
        icon="calendar"
        className="calendar-panel"
        action={
          <div className="actions week-navigation">
            <IconButton
              icon="left"
              label="Semana anterior"
              onClick={() => moveWeek(-1)}
              disabled={pending}
            />
            <Button variant="ghost" onClick={() => setSelectedMonday(null)} disabled={pending}>
              Hoy
            </Button>
            <Badge>{monday === mondayForDate(today) ? 'Esta semana' : startDate.weekYear}</Badge>
            <IconButton
              icon="right"
              label="Semana siguiente"
              onClick={() => moveWeek(1)}
              disabled={pending}
            />
          </div>
        }
      >
        <div className="calendar-grid calendar-grid--full-week">
          {week.days.map((day) => (
            <DayCard
              key={day.date}
              day={day}
              canAdd={canAdd}
              activeId={tracker.active?.id}
              elapsedSeconds={tracker.elapsedSeconds}
              timerBusy={tracker.busy || tracker.pending}
              onAdd={() => setEntryForm({ date: day.date })}
              onEdit={(entry) => setEntryForm({ entry })}
              onEditGoal={() => {
                if (day.jornada) setGoal(day.jornada);
              }}
              onStop={() => void stopTimer()}
            />
          ))}
        </div>
      </Panel>
      <Panel
        title="Horas fichadas frente al objetivo"
        action={
          <div className="chart-legend">
            <span>
              <i /> Fichado
            </span>
            <span>
              <i className="chart-legend__target" /> Objetivo
            </span>
          </div>
        }
      >
        <WeekChart
          hoursLabel="fichadas"
          days={week.days.map((day) => ({ ...day, loggedSeconds: day.workedSeconds }))}
        />
      </Panel>
      <AttendanceComparison monday={monday} />
      <div className="two-columns two-columns--wide week-insights">
        <Panel title="Un balance para organizar tu ritmo" icon="shield">
          <p className="muted section-intro">
            {describeBalance(week.workedSeconds - week.targetSeconds)} en las jornadas registradas.
            El balance usa los fichajes e incluye el tiempo en curso como provisional para revisar
            la semana con claridad.
          </p>
          <div className="principles">
            <div>
              <span className="eyebrow">Precisión</span>
              <h3>Inicio y fin exactos</h3>
              <p className="muted">Cada sesión conserva los instantes registrados.</p>
            </div>
            <div>
              <span className="eyebrow">Redondeo</span>
              <h3>Solo sobre duración</h3>
              <p className="muted">Cada parte utiliza el intervalo que tenía al crearse.</p>
            </div>
            <div>
              <span className="eyebrow">Flexibilidad</span>
              <h3>Objetivos por día</h3>
              <p className="muted">
                Edita una jornada para adaptar su objetivo sin cambiar el reparto semanal.
              </p>
            </div>
          </div>
        </Panel>
        <Panel
          title="Exportación de balance"
          eyebrow="Informe de la semana seleccionada"
          className="week-export"
        >
          <p className="muted section-intro">
            Detalle por proyecto, tarea y duración, con las horas exactas de inicio y fin.
          </p>
          <p className="export-progress mono">{Math.round(progress)}%</p>
          <Progress value={progress} label="Progreso respecto a las jornadas registradas" />
          <p className="mono muted">
            {formatDuration(week.workedSeconds)} / {formatDuration(week.targetSeconds)}
          </p>
          <Button
            icon="download"
            variant="primary"
            className="full-width"
            onClick={() => window.print()}
          >
            Imprimir / Guardar PDF
          </Button>
          <Button
            icon="file"
            variant="ghost"
            className="full-width"
            onClick={exportWeek}
            disabled={!week.entries.length}
          >
            Descargar CSV
          </Button>
        </Panel>
      </div>
      <WeekReport days={week.days} entries={week.entries} />
      {entryForm ? (
        <EntryModal
          open
          onClose={() => setEntryForm(null)}
          entry={entryForm.entry}
          date={entryForm.date}
        />
      ) : null}
      {goal ? (
        <DayGoalModal
          key={`${goal.id}:${goal.version}`}
          jornada={goal}
          onClose={() => setGoal(null)}
        />
      ) : null}
    </div>
  );
}
