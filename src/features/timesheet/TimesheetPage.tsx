import { useState } from 'react';
import type { CSSProperties } from 'react';
import { DateTime } from 'luxon';
import { formatDuration, mondayForDate, todayInZone } from '../../domain/time';
import { Button, IconButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Panel';
import { useWorkspace } from '../workspace/useWorkspace';
import { buildTimesheetWeek } from './timesheet.model';
import type { TimesheetItem } from './timesheet.model';
import { formatHoursMinutes } from '../extension/protocol';
import { useTimesheetOdoo } from './useTimesheetOdoo';
import { TimesheetGroups } from './components/TimesheetGroups';
import { TimesheetDayHeader } from './components/TimesheetDayHeader';
import './timesheet.css';

function weekLabel(monday: string, lastDay: string) {
  const start = DateTime.fromISO(monday, { zone: 'UTC' }).setLocale('es');
  const end = DateTime.fromISO(lastDay, { zone: 'UTC' }).setLocale('es');
  return `Semana del ${start.toFormat(start.month === end.month ? 'd' : 'd LLL')} – ${end.toFormat('d LLL yyyy')}`;
}

export default function TimesheetPage() {
  const { data, isLoading, error, reload } = useWorkspace();
  const [selectedMonday, setSelectedMonday] = useState<string | null>(null);
  const zone = data?.profile.zona_horaria ?? 'Europe/Madrid';
  const today = todayInZone(zone);
  const currentMonday = mondayForDate(today);
  const monday = selectedMonday ?? currentMonday;
  const week = buildTimesheetWeek({
    entries: data?.entries ?? [],
    tasks: data?.tasks ?? [],
    monday,
  });
  const lastDay = week.days.at(-1)?.date ?? monday;
  const timelineCount = week.days.reduce((total, day) => total + day.items.length, 0);
  const {
    dialogs,
    actionError,
    groupActions,
    weekSendDisabledReason,
    sendableMinutes,
    openWeekSend,
    batchProgress,
  } = useTimesheetOdoo(data, week.days, weekLabel(monday, lastDay));

  function moveWeek(weeks: number) {
    setSelectedMonday(DateTime.fromISO(monday, { zone: 'UTC' }).plus({ weeks }).toISODate()!);
  }

  return (
    <div className="timesheet">
      {dialogs}
      <header className="timesheet__toolbar">
        <div>
          <p className="eyebrow">Parte semanal</p>
          <h1 className="timesheet__title">{weekLabel(monday, lastDay)}</h1>
        </div>
        <span className="timesheet__total mono" aria-label="Total imputable de la semana">
          {formatDuration(week.loggedSeconds)}
        </span>
        {batchProgress ? (
          <span className="timesheet__batch-progress" role="status" aria-live="polite">
            <Icon name="refresh" size={13} />
            Enviando a Odoo {batchProgress.done}/{batchProgress.total}…
          </span>
        ) : null}
        <Button
          id="timesheet-send-week"
          className="timesheet__send-week"
          icon="send"
          disabled={weekSendDisabledReason !== null}
          title={
            weekSendDisabledReason ??
            'Revisar y enviar todos los partes pendientes de la semana a Odoo'
          }
          onClick={openWeekSend}
        >
          Enviar semana a Odoo ({formatHoursMinutes(sendableMinutes)})
        </Button>
        <div className="timesheet__nav">
          <IconButton icon="left" label="Semana anterior" onClick={() => moveWeek(-1)} />
          <Button
            variant="ghost"
            disabled={monday === currentMonday}
            onClick={() => setSelectedMonday(null)}
          >
            Hoy
          </Button>
          <IconButton icon="right" label="Semana siguiente" onClick={() => moveWeek(1)} />
        </div>
      </header>
      {error ? (
        <Notice title="No se pudieron cargar los partes">
          <p role="alert">{error.message}</p>
          <Button onClick={() => void reload()}>Reintentar</Button>
        </Notice>
      ) : null}
      {actionError ? (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      ) : null}
      {isLoading && !data ? (
        <p role="status">Cargando partes…</p>
      ) : (
        <>
          <TimesheetGroups days={week.days} today={today} {...groupActions} />
          <section className="timesheet__section" aria-labelledby="timesheet-timeline-title">
            <header className="timesheet__section-header">
              <h2 id="timesheet-timeline-title">Timeline</h2>
              <span className="dim">
                {timelineCount} {timelineCount === 1 ? 'parte' : 'partes'}
              </span>
            </header>
            <div
              className="timesheet__grid"
              style={{ '--timesheet-days': week.days.length } as CSSProperties}
            >
              {week.days.map((day) => (
                <section
                  key={day.date}
                  className={`timesheet__day ${day.date === today ? 'timesheet__day--today' : ''}`}
                  aria-labelledby={`timesheet-${day.date}`}
                >
                  <TimesheetDayHeader
                    id={`timesheet-${day.date}`}
                    date={day.date}
                    seconds={day.items.reduce((total, item) => total + (item.realSeconds ?? 0), 0)}
                    totalLabel="Tiempo real del día"
                  />
                  <ul className="timesheet__items">
                    {day.items.length ? (
                      day.items.map((item) => <TimesheetRow key={item.entry.id} item={item} />)
                    ) : (
                      <li className="timesheet__empty dim">—</li>
                    )}
                  </ul>
                </section>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function TimesheetRow({ item }: { item: TimesheetItem }) {
  const { entry } = item;
  const imputed = entry.imputado_en_odoo;
  const open = !entry.fin_en;
  const status = open ? 'En curso' : imputed ? 'Imputado en Odoo' : 'Pendiente de imputar en Odoo';
  return (
    <li
      className={`timesheet__item ${imputed ? 'timesheet__item--imputed' : ''} ${open ? 'timesheet__item--open' : ''}`}
    >
      <div className="timesheet__item-head">
        {item.odooUrl ? (
          <a
            className="timesheet__item-title timesheet__item-title--link"
            href={item.odooUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir en Odoo"
          >
            {item.title}
            <Icon name="external" size={11} />
          </a>
        ) : (
          <strong className="timesheet__item-title">{item.title}</strong>
        )}
        {item.odooId ? (
          <span className="timesheet__odoo-id mono" title={item.odooId}>
            {item.odooId}
          </span>
        ) : null}
      </div>
      <div className="timesheet__item-meta">
        <span className="mono dim">{item.range}</span>
        <strong className="mono timesheet__logged" title="Tiempo real">
          {item.realSeconds === null ? '—' : formatDuration(item.realSeconds)}
        </strong>
      </div>
      <div className="timesheet__item-actions">
        <span
          className={`timesheet__item-status ${imputed ? 'timesheet__item-status--imputed' : ''}`}
          role="img"
          aria-label={status}
          title={status}
        >
          <Icon name={open ? 'timer' : imputed ? 'check' : 'clock'} size={13} />
        </span>
      </div>
    </li>
  );
}
