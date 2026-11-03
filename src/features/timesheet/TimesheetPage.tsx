import { useState } from 'react';
import type { CSSProperties } from 'react';
import { DateTime } from 'luxon';
import type { TimeEntry, WorkspaceData } from '../../domain/models';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import { formatDuration, mondayForDate, todayInZone } from '../../domain/time';
import { Button, IconButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from '../../shared/ui/Panel';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { useWorkspace } from '../workspace/useWorkspace';
import { useCommand } from '../workspace/useCommand';
import { useTracker } from '../tracker/useTracker';
import { OdooSendButton } from '../time-entries/components/OdooSendButton';
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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selectedMonday, setSelectedMonday] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
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

  async function setImputed(entry: TimeEntry, imputed: boolean) {
    // The mark can be set and cleared until automatic Odoo logging exists.
    if (busy || !entry.fin_en || entry.imputado_en_odoo === imputed) return;
    setActionError('');
    try {
      const saved = await run<{ version?: number; imputado_en_odoo?: boolean }>('editar_parte', {
        id: entry.id,
        version: entry.version,
        imputado_en_odoo: imputed,
      });
      // If the follow-up refresh failed, the cache is older than the save: apply the
      // saved flag and version so the checkbox stays correct and stays reversible.
      if (user && typeof saved?.version === 'number') {
        const version = saved.version;
        queryClient.setQueryData<WorkspaceData>(['workspace', user.id], (current) =>
          current
            ? {
                ...current,
                entries: current.entries.map((item) =>
                  item.id === entry.id && item.version < version
                    ? { ...item, imputado_en_odoo: saved.imputado_en_odoo ?? imputed, version }
                    : item,
                ),
              }
            : current,
        );
      }
      notify(
        imputed ? 'Parte marcado como imputado en Odoo.' : 'Parte marcado como pendiente en Odoo.',
      );
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
                        onToggle={(imputed) => void setImputed(item.entry, imputed)}
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
  onToggle,
}: {
  item: TimesheetItem;
  busy: boolean;
  onToggle: (imputed: boolean) => void;
}) {
  const { entry } = item;
  const imputed = entry.imputado_en_odoo;
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
            open
              ? 'Finaliza el parte para marcarlo como imputado.'
              : imputed
                ? 'Imputado en Odoo (desmarca para dejarlo pendiente).'
                : 'Marcar como imputado en Odoo.'
          }
        >
          <input
            type="checkbox"
            checked={imputed}
            disabled={open || busy}
            aria-label={`Imputado en Odoo: ${item.title}, ${item.range}`}
            onChange={(event) => onToggle(event.target.checked)}
          />
        </label>
        <OdooSendButton label={item.title} />
      </div>
    </li>
  );
}
