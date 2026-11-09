import { useState } from 'react';
import { DateTime } from 'luxon';
import type { WorkspaceData } from '../../domain/models';
import { dayContext } from '../../domain/dayContext';
import type { DayContextOptions } from '../../domain/dayContext';
import { formatDuration } from '../../domain/time';
import { Icon } from '../../shared/ui/Icon';
import './day-context.css';

/** The button that shows or hides the panel, placed at the top of each form. */
export function DayContextToggle({
  visible,
  onToggle,
  controls,
}: {
  visible: boolean;
  onToggle: () => void;
  controls: string;
}) {
  return (
    <button
      type="button"
      className="day-context-toggle"
      aria-expanded={visible}
      aria-controls={controls}
      onClick={onToggle}
    >
      <Icon name="calendar" size={15} />
      {visible ? 'Ocultar contexto del día' : 'Contexto del día'}
    </button>
  );
}

/**
 * Attendance and entries of `date`, for the time-entry forms: when the user went in
 * and out, and what is already recorded that day (with the interval being edited).
 */
export function DayContextPanel({
  id,
  data,
  date,
  zone,
  excludeEntryId,
  draft,
}: {
  id: string;
  data: WorkspaceData;
  date: string;
  zone: string;
  excludeEntryId?: string | null;
  draft?: DayContextOptions['draft'];
}) {
  // Server time when the form opened (running intervals count until then).
  const [openedAt] = useState(Date.now);
  const now = DateTime.fromISO(data.serverTime)
    .plus({ milliseconds: openedAt - data.receivedAt })
    .toISO()!;
  const day = DateTime.fromISO(date, { zone });
  let context;
  try {
    context = day.isValid ? dayContext(data, date, zone, { excludeEntryId, draft, now }) : null;
  } catch {
    context = null;
  }
  return (
    <aside id={id} className="day-context" aria-label="Contexto del día">
      <header className="day-context__header">
        <p className="eyebrow">Contexto del día</p>
        <h3>
          {day.isValid ? day.setLocale('es').toFormat("cccc d 'de' LLLL") : 'Elige una fecha'}
        </h3>
      </header>
      {!context ? (
        <p className="muted">Elige una fecha válida para ver lo registrado ese día.</p>
      ) : (
        <>
          <section className="day-context__section" aria-label="Entradas y salidas">
            <div className="day-context__title">
              <span>Entradas y salidas</span>
              {context.attendance.length ? (
                <span className="mono">{formatDuration(context.attendanceSeconds)}</span>
              ) : null}
            </div>
            {context.attendance.length ? (
              <>
                <p className="day-context__summary">
                  Entrada <strong className="mono">{context.firstIn}</strong>
                  {' · '}
                  Salida <strong className="mono">{context.lastOut ?? 'en curso'}</strong>
                </p>
                <ul className="day-context__list">
                  {context.attendance.map((row) => (
                    <li key={row.id} className="day-context__row day-context__row--attendance">
                      <span className="mono">
                        {row.startLabel} – {row.endLabel ?? 'en curso'}
                      </span>
                      <span className="dim mono">{formatDuration(row.seconds)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="dim">Sin fichajes este día.</p>
            )}
          </section>

          <section className="day-context__section" aria-label="Partes del día">
            <div className="day-context__title">
              <span>Partes del día</span>
              {context.entries.length ? (
                <span className="mono">{formatDuration(context.entrySeconds)}</span>
              ) : null}
            </div>
            {context.overlaps.length ? (
              <p className="day-context__warning" role="status">
                <Icon name="info" size={14} />
                Se solapa con{' '}
                {context.overlaps.length === 1 ? 'otro parte' : `${context.overlaps.length} partes`}
                :{' '}
                {context.overlaps.map((entry) => `${entry.task} (${entry.startLabel})`).join(', ')}.
              </p>
            ) : null}
            <ol className="day-context__list day-context__timeline">
              {timeline(context).map((item) =>
                item.kind === 'draft' ? (
                  <li key="draft" className="day-context__row day-context__row--draft">
                    <span className="mono">
                      {item.startLabel} – {item.endLabel ?? '…'}
                    </span>
                    <span>
                      <strong>Este parte</strong>
                      {item.seconds !== null ? (
                        <span className="dim mono"> · {formatDuration(item.seconds)}</span>
                      ) : null}
                    </span>
                  </li>
                ) : (
                  <li
                    key={item.entry.id}
                    className={`day-context__row ${item.entry.overlapsDraft ? 'day-context__row--overlap' : ''} ${item.entry.running ? 'day-context__row--running' : ''}`}
                  >
                    <span className="mono">
                      {item.entry.startLabel} – {item.entry.endLabel ?? 'en curso'}
                    </span>
                    <span className="day-context__entry">
                      <strong>{item.entry.task}</strong>
                      <span className="dim">
                        {item.entry.project ? `${item.entry.project} · ` : ''}
                        <span className="mono">{formatDuration(item.entry.seconds)}</span>
                      </span>
                    </span>
                  </li>
                ),
              )}
            </ol>
            {!context.entries.length ? <p className="dim">Sin partes este día.</p> : null}
          </section>
        </>
      )}
    </aside>
  );
}

type TimelineItem =
  | { kind: 'entry'; entry: ReturnType<typeof dayContext>['entries'][number] }
  | ({ kind: 'draft' } & NonNullable<ReturnType<typeof dayContext>['draft']>);

/** Entries in order, with the draft placed where it starts. */
function timeline(context: ReturnType<typeof dayContext>): TimelineItem[] {
  const items: TimelineItem[] = context.entries.map((entry) => ({ kind: 'entry', entry }));
  if (!context.draft) return items;
  const draft: TimelineItem = { kind: 'draft', ...context.draft };
  const at = Date.parse(context.draft.start);
  const index = context.entries.findIndex((entry) => Date.parse(entry.start) > at);
  items.splice(index < 0 ? items.length : index, 0, draft);
  return items;
}
