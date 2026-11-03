import { useState } from 'react';
import type { CSSProperties } from 'react';
import { DateTime } from 'luxon';
import type { TimeEntry } from '../../domain/models';
import { formatDuration, mondayForDate, todayInZone } from '../../domain/time';
import { Button, IconButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Panel';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { useWorkspace } from '../workspace/useWorkspace';
import { useCommand } from '../workspace/useCommand';
import { useTracker } from '../tracker/useTracker';
import { buildTimesheetWeek } from './timesheet.model';
import type { TimesheetItem } from './timesheet.model';
import './timesheet.css';

function weekLabel(monday: string, lastDay: string) {
  const start = DateTime.fromISO(monday, { zone: 'UTC' }).setLocale('es');
  const end = DateTime.fromISO(lastDay, { zone: 'UTC' }).setLocale('es');
  return `Semana del ${start.toFormat(start.month === end.month ? 'd' : 'd LLL')} – ${end.toFormat('d LLL yyyy')}`;
}

export default function TimesheetPage() {
  const { data, isLoading, error, reload } = useWorkspace();
  const { run, pending } = useCommand();
  const tracker = useTracker();
  const notify = useFeedback();
  const [selectedMonday, setSelectedMonday] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  // Saved marks (entry id -> saved version) stay locked while the cached data is older
  // than the save, e.g. if the follow-up reload fails. Newer data is authoritative.
  const [confirmed, setConfirmed] = useState<ReadonlyMap<string, number>>(new Map());
  const isImputed = (entry: TimeEntry) =>
    entry.imputado_en_odoo || (confirmed.get(entry.id) ?? -1) > entry.version;
  const zone = data?.profile.zona_horaria ?? 'Europe/Madrid';
  const today = todayInZone(zone);
  const currentMonday = mondayForDate(today);
  const monday = selectedMonday ?? currentMonday;
  const week = buildTimesheetWeek({
    entries: data?.entries ?? [],
    tasks: data?.tasks ?? [],
    monday,
  });
  const busy = pending || tracker.busy || tracker.pending;
  const lastDay = week.days.at(-1)?.date ?? monday;

  function moveWeek(weeks: number) {
    setSelectedMonday(DateTime.fromISO(monday, { zone: 'UTC' }).plus({ weeks }).toISODate()!);
  }

  async function markImputed(entry: TimeEntry) {
    // This view only ever marks entries; it never sends `false`.
    if (busy || isImputed(entry) || !entry.fin_en) return;
    setActionError('');
    try {
      const saved = await run<{ version?: number }>('editar_parte', {
        id: entry.id,
        version: entry.version,
        imputado_en_odoo: true,
      });
      const version = typeof saved?.version === 'number' ? saved.version : entry.version + 1;
      setConfirmed((current) => new Map(current).set(entry.id, version));
      notify('Parte marcado como imputado en Odoo.');
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'No se pudo guardar la marca de Odoo.',
      );
    }
  }

  return (
    <div className="timesheet">
      <header className="timesheet__toolbar">
        <div>
          <p className="eyebrow">Parte semanal</p>
          <h1 className="timesheet__title">{weekLabel(monday, lastDay)}</h1>
        </div>
        <span className="timesheet__total mono" aria-label="Total imputable de la semana">
          {formatDuration(week.loggedSeconds)}
        </span>
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
        <div
          className="timesheet__grid"

          style={{ '--timesheet-days': week.days.length } as CSSProperties}
        >
          {week.days.map((day) => {
            const date = DateTime.fromISO(day.date, { zone: 'UTC' }).setLocale('es');
            return (
              <section
                key={day.date}

                className={`timesheet__day ${day.date === today ? 'timesheet__day--today' : ''}`}
                aria-labelledby={`timesheet-${day.date}`}
              >
                <header className="timesheet__day-header">
                  <h2 id={`timesheet-${day.date}`}>
                    <span className="timesheet__weekday">{date.toFormat('ccc')}</span>{' '}
                    <strong>{date.toFormat('d')}</strong>
                    <span className="sr-only">{date.toFormat(' LLLL')}</span>
                  </h2>
                  <span className="mono dim" aria-label="Total del día">
                    {day.loggedSeconds ? formatDuration(day.loggedSeconds) : ''}
                  </span>
                </header>
                <ul className="timesheet__items">
                  {day.items.length ? (
                    day.items.map((item) => (
                      <TimesheetRow
                        key={item.entry.id}
                        item={item}
                        busy={busy}
                        imputed={isImputed(item.entry)}
                        onMark={() => void markImputed(item.entry)}
                      />
                    ))
                  ) : (
                    <li className="timesheet__empty dim">—</li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TimesheetRow({
  item,
  busy,
  imputed,
  onMark,
}: {
  item: TimesheetItem;
  busy: boolean;
  imputed: boolean;
  onMark: () => void;
}) {
  const { entry } = item;
  const open = !entry.fin_en;
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
        <strong className="mono timesheet__logged">
          {item.loggedSeconds === null ? '—' : formatDuration(item.loggedSeconds)}
        </strong>
      </div>
      <div className="timesheet__item-actions">
        <label
          className="timesheet__check"
          title={
            imputed
              ? 'Imputado en Odoo. No se puede desmarcar desde esta vista.'
              : open
                ? 'Finaliza el parte para marcarlo como imputado.'
                : 'Marcar como imputado en Odoo (no se podrá desmarcar aquí).'
          }
        >
          <input
            type="checkbox"
            checked={imputed}
            disabled={imputed || open || busy}
            aria-label={`Imputado en Odoo: ${item.title}, ${item.range}`}
            onChange={(event) => {
              if (event.target.checked) onMark();
            }}
          />
        </label>
        {/* Placeholder: automatic Odoo logging is not implemented yet. */}
        <button
          type="button"
          className="icon-button timesheet__send"
          aria-disabled="true"
          aria-label={`Imputar automáticamente en Odoo (próximamente): ${item.title}`}
          title="Imputar automáticamente en Odoo (próximamente)"
        >
          <Icon name="send" size={14} />
        </button>
      </div>
    </li>
  );
}
