import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { DateTime } from 'luxon';
import { mondayForDate } from '../../domain/time';
import { Button, ButtonLink, IconButton } from '../../shared/ui/Button';
import { DataTable } from '../../shared/ui/DataTable';
import { Icon } from '../../shared/ui/Icon';
import { Notice, Panel } from '../../shared/ui/Panel';
import { AttendanceChart } from '../attendance/AttendanceChart';
import { HeraDayBadge, HeraDayDetails } from '../attendance/AttendanceHeraRequests';
import { useAttendance } from '../attendance/useAttendance';
import type { HeraChangeRequest } from '../extension/heraRequests';
import { formatHoursMinutes } from '../extension/protocol';
import { useExtension } from '../extension/useExtension';
import { EntryModal } from '../time-entries/components/EntryModal';
import { TimesheetGroups } from '../timesheet/components/TimesheetGroups';
import { useTimesheetOdoo } from '../timesheet/useTimesheetOdoo';
import { useCommand } from '../workspace/useCommand';
import { useWorkspace } from '../workspace/useWorkspace';
import { WeekReport } from './components/WeekReport';
import { DayTimeline } from './components/DayTimeline';
import { buildDayTimeline, formatReadableDuration } from './components/dayTimeline.model';
import { exportWeekCsv } from './exportWeekCsv';
import { buildWeekOverview } from './weekOverview.model';
import '../timesheet/timesheet.css';
import './week.css';
import './weekOverview.css';

const percentFormat = new Intl.NumberFormat('es', { maximumFractionDigits: 2 });

function percentLabel(value: number | null) {
  return value === null ? '—' : `${percentFormat.format(value)}%`;
}

function hoursMinutes(seconds: number) {
  return formatHoursMinutes(Math.floor(seconds / 60));
}

function formatClockShort(iso: string, zone: string) {
  return DateTime.fromISO(iso, { zone }).toFormat('HH:mm');
}

function weekLabel(monday: string) {
  const start = DateTime.fromISO(monday, { zone: 'UTC' }).setLocale('es');
  const end = start.plus({ days: 6 });
  const first = start.toFormat(
    start.year !== end.year ? 'd LLL yyyy' : start.month === end.month ? 'd' : 'd LLL',
  );
  return `Semana del ${first} al ${end.toFormat('d LLL')}`;
}

function useGenerateWeek(monday: string, missingDays: number) {
  const { run, pending } = useCommand();
  const opened = useRef({ monday, attempted: false });
  const [error, setError] = useState<{ monday: string; message: string } | null>(null);

  async function generate() {
    opened.current.attempted = true;
    try {
      await run('generar_semana', { lunes: monday });
      setError(null);
    } catch (cause) {
      setError({
        monday,
        message: cause instanceof Error ? cause.message : 'No se pudo generar la semana.',
      });
    }
  }

  useEffect(() => {
    if (opened.current.monday !== monday) opened.current = { monday, attempted: false };
    if (missingDays && !pending && !opened.current.attempted) void generate();
  });

  return {
    error: missingDays && !pending && error?.monday === monday ? error.message : null,
    retry: generate,
  };
}

export default function WeekOverviewPage() {
  const { data, isLoading, error, reload } = useWorkspace();
  const { now } = useAttendance();
  const { heraRequests } = useExtension();
  const [selectedMonday, setSelectedMonday] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>();
  const [entryDate, setEntryDate] = useState<string | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const zone = data?.profile.zona_horaria ?? 'Europe/Madrid';
  const today = DateTime.fromISO(now, { zone }).toISODate()!;
  const currentMonday = mondayForDate(today);
  const monday = selectedMonday ?? currentMonday;
  const title = weekLabel(monday);
  const week = useMemo(
    () => (data ? buildWeekOverview(data, monday, today, now) : null),
    [data, monday, today, now],
  );
  const generation = useGenerateWeek(monday, week?.missingDays ?? 0);
  const odoo = useTimesheetOdoo(data, week?.timesheetDays ?? [], title);
  const requestsByDate = new Map<string, HeraChangeRequest[]>();
  for (const item of heraRequests?.items ?? []) {
    const items = requestsByDate.get(item.date) ?? [];
    items.push(item);
    requestsByDate.set(item.date, items);
  }

  function navigateWeek(next: string | null) {
    setSelectedMonday(next);
    setSelectedDay(undefined);
  }

  function moveWeek(weeks: number) {
    navigateWeek(DateTime.fromISO(monday, { zone: 'UTC' }).plus({ weeks }).toISODate()!);
  }

  function closeMenu() {
    if (menu.current) {
      menu.current.open = false;
      menu.current.querySelector('summary')?.focus();
    }
  }

  if (isLoading && !week) return <p role="status">Cargando tu semana…</p>;
  if (!week)
    return (
      <Notice title="No se pudo cargar la semana">
        {error?.message}
        <Button onClick={() => void reload()}>Reintentar</Button>
      </Notice>
    );

  const openDay =
    selectedDay === undefined
      ? week.days.find((day) => day.isToday && day.hasData)?.date
      : selectedDay;
  const hasSendable = odoo.sendableMinutes > 0;
  const sendDisabledReason =
    odoo.weekSendDisabledReason ??
    (!hasSendable ? 'No hay partes pendientes para enviar a Odoo.' : null);
  const totalEmpty = week.total.imputedPercent === null;
  const summaryDetail =
    week.total.workedSeconds > 0
      ? `Imputado ${hoursMinutes(week.total.imputedSeconds)} · Fichado ${hoursMinutes(week.total.workedSeconds)}${week.targetSeconds > 0 ? ` de ${hoursMinutes(week.targetSeconds)}` : ''}`
      : week.total.imputedSeconds > 0
        ? `Imputado ${hoursMinutes(week.total.imputedSeconds)} · Sin fichajes${week.targetSeconds > 0 ? ` · Objetivo ${hoursMinutes(week.targetSeconds)}` : ''}`
        : `Sin fichajes ni partes esta semana${week.targetSeconds > 0 ? ` · Objetivo ${hoursMinutes(week.targetSeconds)}` : ''}`;

  return (
    <div className="page-stack week-page week-overview">
      {odoo.dialogs}
      <header className="week-overview__header">
        <h1>{title}</h1>
        <div className="week-overview__actions" role="group" aria-label="Cambiar de semana">
          <IconButton icon="left" label="Semana anterior" onClick={() => moveWeek(-1)} />
          <Button
            variant="ghost"
            disabled={monday === currentMonday}
            onClick={() => navigateWeek(null)}
          >
            Hoy
          </Button>
          <IconButton icon="right" label="Semana siguiente" onClick={() => moveWeek(1)} />
        </div>
        <div className="week-overview__actions week-overview__tools">
          <Button
            id="timesheet-send-week"
            icon="send"
            variant="primary"
            disabled={sendDisabledReason !== null}
            title={sendDisabledReason ?? 'Revisar los partes pendientes de la semana'}
            onClick={odoo.openWeekSend}
          >
            {hasSendable
              ? `Enviar a Odoo (${formatHoursMinutes(odoo.sendableMinutes)})`
              : 'Enviar a Odoo'}
          </Button>
          <details
            className="week-overview__menu"
            ref={menu}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.open = false;
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeMenu();
            }}
          >
            <summary className="icon-button" aria-label="Más acciones" title="Más acciones">
              <Icon name="more" />
            </summary>
            <div className="week-overview__menu-items">
              <Button
                variant="ghost"
                icon="plus"
                disabled={!week.canAdd}
                onClick={() => {
                  closeMenu();
                  setEntryDate(openDay ?? (monday === currentMonday ? today : monday));
                }}
              >
                Nuevo parte
              </Button>
              <Button
                variant="ghost"
                icon="file"
                onClick={() => {
                  closeMenu();
                  window.print();
                }}
              >
                Imprimir / PDF
              </Button>
              <Button
                variant="ghost"
                icon="download"
                disabled={!week.entries.length}
                onClick={() => {
                  closeMenu();
                  exportWeekCsv(monday, week.entries);
                }}
              >
                Descargar CSV
              </Button>
            </div>
          </details>
        </div>
      </header>
      {odoo.batchProgress ? (
        <span className="timesheet__batch-progress" role="status">
          <Icon name="refresh" size={13} />
          Enviando a Odoo {odoo.batchProgress.done}/{odoo.batchProgress.total}…
        </span>
      ) : null}
      {error ? (
        <Notice title="No se pudieron actualizar los datos">
          {error.message}
          <Button onClick={() => void reload()}>Reintentar</Button>
        </Notice>
      ) : null}
      {generation.error ? (
        <Notice title="No se pudieron generar las jornadas">
          {generation.error}
          <Button variant="ghost" onClick={() => void generation.retry()}>
            Reintentar
          </Button>
        </Notice>
      ) : null}
      {odoo.actionError ? (
        <p role="alert" className="form-error">
          {odoo.actionError}
        </p>
      ) : null}
      <section className="week-overview__summary" aria-label="Balance semanal">
        <strong
          className="mono"
          data-tone={week.total.tone ?? undefined}
          data-empty={totalEmpty ? 'true' : undefined}
          aria-label={`Porcentaje imputado de la semana: ${totalEmpty ? 'sin datos' : percentLabel(week.total.imputedPercent)}`}
        >
          {percentLabel(week.total.imputedPercent)}
        </strong>
        <span className="muted">{summaryDetail}</span>
      </section>
      <Panel className="week-overview__chart">
        <AttendanceChart days={week.days} today={today} />
      </Panel>
      <Panel className="table-panel week-overview__days">
        <DataTable
          caption="Balance de la semana por día"
          headers={['Día', 'Fichado', 'Imputado', '%', 'Odoo']}
        >
          {week.days.map((day) => {
            const expanded = openDay === day.date;
            const detailId = `week-detail-${day.date}`;
            const requests = requestsByDate.get(day.date) ?? [];
            const toggle = () => setSelectedDay(expanded ? null : day.date);
            const dayNumber = Number(day.date.slice(-2));
            const timeline = expanded
              ? buildDayTimeline({
                  attendance: day.attendance,
                  entries: (day.sheetDay?.items ?? []).map((item) => ({
                    id: item.entry.id,
                    task: item.title,
                    start: item.entry.inicio_en,
                    end: item.entry.fin_en,
                  })),
                  zone,
                  now,
                })
              : null;
            const unimputedSeconds = timeline?.unimputedSeconds ?? 0;
            const hasGroups = Boolean(day.sheetDay?.groups.length);
            return (
              <Fragment key={day.date}>
                <tr
                  className={`week-overview__day ${day.isToday ? 'week-overview__day--today' : ''}`}
                  tabIndex={0}
                  aria-current={day.isToday ? 'date' : undefined}
                  aria-expanded={expanded}
                  aria-controls={expanded ? detailId : undefined}
                  onClick={toggle}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggle();
                    }
                  }}
                >
                  <td className="week-overview__cell-day">
                    <div className="week-overview__day-label">
                      <span className="week-overview__day-name">
                        {day.name} {dayNumber}
                      </span>
                      <HeraDayBadge items={requests} />
                    </div>
                  </td>
                  <td className="week-overview__cell-worked mono" data-label="Fichado">
                    <span>{hoursMinutes(day.workedSeconds)}</span>
                    {day.provisional ? <small className="muted">Provisional</small> : null}
                  </td>
                  <td className="week-overview__cell-imputed mono" data-label="Imputado">
                    {hoursMinutes(day.imputedSeconds)}
                  </td>
                  <td className="week-overview__cell-percent" data-label="%">
                    {day.imputedPercent === null ? (
                      <span className="mono dim">—</span>
                    ) : (
                      <span
                        className="week-overview__pct-pill mono"
                        data-tone={day.tone ?? undefined}
                      >
                        {percentLabel(day.imputedPercent)}
                      </span>
                    )}
                  </td>
                  <td className="week-overview__cell-odoo" data-label="Odoo">
                    <div className="week-overview__odoo">
                      <span className={day.odoo === '—' ? 'dim' : undefined}>{day.odoo}</span>
                      <Icon name="chevron" size={14} className="week-overview__chevron" />
                    </div>
                  </td>
                </tr>
                {expanded ? (
                  <tr className="week-overview__detail">
                    <td colSpan={5} id={detailId}>
                      <div className="week-overview__detail-content">
                        {timeline ? <DayTimeline timeline={timeline} /> : null}
                        <div className="week-overview__detail-columns">
                          <section
                            className="week-overview__detail-block"
                            aria-labelledby={`week-jornada-${day.date}`}
                          >
                            <div className="week-overview__detail-header">
                              <h2 id={`week-jornada-${day.date}`}>Jornada</h2>
                              <ButtonLink
                                to={`/fichajes?fecha=${day.date}`}
                                variant="ghost"
                                icon="edit"
                                className="week-overview__detail-action"
                              >
                                Corregir
                              </ButtonLink>
                            </div>
                            {day.attendance.length ? (
                              <>
                                <ul className="week-overview__attendance">
                                  {day.attendance.map((record) => (
                                    <li key={record.id}>
                                      <span>
                                        Entrada{' '}
                                        <span className="mono">
                                          {formatClockShort(record.start, zone)}
                                        </span>
                                        {' · '}
                                        {record.end ? (
                                          <>
                                            Salida{' '}
                                            <span className="mono">
                                              {formatClockShort(record.end, zone)}
                                            </span>
                                          </>
                                        ) : (
                                          <span className="muted">Salida pendiente</span>
                                        )}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                                <p className="week-overview__attendance-total">
                                  <strong>{formatReadableDuration(day.workedSeconds)}</strong>{' '}
                                  fichadas
                                  {day.provisional ? (
                                    <span className="muted"> · provisional</span>
                                  ) : null}
                                </p>
                              </>
                            ) : (
                              <p className="muted">Sin fichajes</p>
                            )}
                          </section>
                          <section
                            className="week-overview__detail-block"
                            aria-labelledby={`week-partes-${day.date}`}
                          >
                            <div className="week-overview__detail-header">
                              <h2 id={`week-partes-${day.date}`}>Partes</h2>
                              {hasGroups ? (
                                <Button
                                  variant="ghost"
                                  icon="plus"
                                  className="week-overview__detail-action"
                                  disabled={!week.canAdd}
                                  title={
                                    !week.canAdd
                                      ? 'Crea un proyecto y una tarea activos para registrar horas.'
                                      : undefined
                                  }
                                  onClick={() => setEntryDate(day.date)}
                                >
                                  Nuevo parte
                                </Button>
                              ) : null}
                            </div>
                            {hasGroups && day.sheetDay ? (
                              <>
                                <TimesheetGroups days={[day.sheetDay]} {...odoo.groupActions} />
                                {unimputedSeconds >= 60 ? (
                                  <p className="week-overview__unimputed">
                                    Sin imputar:{' '}
                                    <strong>{formatReadableDuration(unimputedSeconds)}</strong>
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <div className="week-overview__empty-parts">
                                {unimputedSeconds >= 60 ? (
                                  <p className="week-overview__unimputed">
                                    <strong>{formatReadableDuration(unimputedSeconds)}</strong> sin
                                    imputar
                                  </p>
                                ) : (
                                  <p className="muted">Sin partes</p>
                                )}
                                <Button
                                  variant="secondary"
                                  icon="plus"
                                  className="week-overview__detail-action"
                                  disabled={!week.canAdd}
                                  title={
                                    !week.canAdd
                                      ? 'Crea un proyecto y una tarea activos para registrar horas.'
                                      : undefined
                                  }
                                  onClick={() => setEntryDate(day.date)}
                                >
                                  Nuevo parte
                                </Button>
                              </div>
                            )}
                          </section>
                        </div>
                        <HeraDayDetails items={requests} workedSeconds={day.workedSeconds} />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </DataTable>
      </Panel>
      <WeekReport days={week.reportDays} entries={week.entries} />
      {entryDate ? <EntryModal open date={entryDate} onClose={() => setEntryDate(null)} /> : null}
    </div>
  );
}
