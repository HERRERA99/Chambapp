import { Fragment, useState } from 'react';
import { DateTime } from 'luxon';
import type { WorkspaceData } from '../../domain/models';
import { dayContext } from '../../domain/dayContext';
import type { DayContext, DayContextOptions } from '../../domain/dayContext';
import { formatReadableDuration } from '../week/components/dayTimeline.model';
import { Icon } from '../../shared/ui/Icon';
import { MIN_GAP_SECONDS, buildDayContextTimeline } from './dayContextTimeline';
import type { DayContextBlock, DayContextBlockItem } from './dayContextTimeline';
import './day-context.css';

/** The button that shows or hides the panel, placed at the top of each form. */
export function DayContextToggle({
  visible,
  onToggle,
  controls,
  summary,
}: {
  visible: boolean;
  onToggle: () => void;
  controls: string;
  /** One line about the day (entrada, partes), shown while the panel is hidden. */
  summary?: string | null;
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
      {!visible && summary ? <span className="day-context-toggle__summary">{summary}</span> : null}
    </button>
  );
}

/**
 * Attendance and entries of `date` grouped as one block per attendance record (with pauses
 * between blocks and an optional "Fuera de fichaje" block), showing exact HH:MM ranges.
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
  let context: DayContext | null;
  try {
    context = day.isValid ? dayContext(data, date, zone, { excludeEntryId, draft, now }) : null;
  } catch {
    context = null;
  }
  const timeline = context ? buildDayContextTimeline(context, now) : null;
  const attendanceSeconds = timeline?.attendanceSeconds ?? context?.attendanceSeconds ?? 0;
  const entrySeconds = timeline?.entrySeconds ?? context?.entrySeconds ?? 0;
  const unimputedSeconds = timeline?.unimputedSeconds ?? 0;
  const pauseAfterBlock = new Map(
    (timeline?.pauses ?? []).map((pause) => [pause.afterBlockIndex, pause]),
  );

  return (
    <aside id={id} className="day-context" aria-label="Contexto del día">
      <header className="day-context__header">
        <p className="eyebrow">Contexto del día</p>
        <h3>
          {day.isValid ? day.setLocale('es').toFormat("cccc d 'de' LLLL") : 'Elige una fecha'}
        </h3>
        {context ? (
          <p className="day-context__totals">
            <span>
              Fichado <strong className="mono">{formatReadableDuration(attendanceSeconds)}</strong>
            </span>
            <span className="day-context__sep" aria-hidden="true">
              ·
            </span>
            <span>
              Partes <strong className="mono">{formatReadableDuration(entrySeconds)}</strong>
            </span>
            <span className="day-context__sep" aria-hidden="true">
              ·
            </span>
            <span className={unimputedSeconds >= 60 ? 'day-context__unimputed' : undefined}>
              Sin imputar{' '}
              <strong className="mono">{formatReadableDuration(unimputedSeconds)}</strong>
            </span>
          </p>
        ) : null}
      </header>

      {!context ? (
        <p className="muted">Elige una fecha válida para ver lo registrado ese día.</p>
      ) : (
        <>
          {context.overlaps.length ? (
            <p className="day-context__warning" role="status">
              <Icon name="info" size={14} />
              <span>
                Se solapa con{' '}
                {context.overlaps.length === 1 ? 'otro parte' : `${context.overlaps.length} partes`}
                :{' '}
                {context.overlaps.map((entry) => `${entry.task} (${entry.startLabel})`).join(', ')}.
              </span>
            </p>
          ) : null}

          <div className="day-context__scroll">
            {!timeline ? (
              <p className="day-context-empty">Sin fichajes ni partes este día</p>
            ) : (
              <div className="day-context-blocks">
                {timeline.blocks.map((block, index) => {
                  const pause = pauseAfterBlock.get(index);
                  return (
                    <Fragment key={block.id}>
                      <ContextBlockCard block={block} />
                      {pause ? (
                        <div className="day-context-pause">
                          <span>Pausa {pause.durationLabel}</span>
                        </div>
                      ) : null}
                    </Fragment>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function ContextBlockCard({ block }: { block: DayContextBlock }) {
  const isAttendance = block.kind === 'attendance';
  const showOutsideDuration = !block.open || block.seconds >= MIN_GAP_SECONDS;
  const blockClasses = [
    'day-context-block',
    `day-context-block--${block.kind}`,
    block.open && isAttendance ? 'day-context-block--open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={blockClasses} role="group" aria-label={block.ariaLabel}>
      <header className="day-context-block__header">
        {isAttendance ? (
          <span>
            Entrada <strong className="day-context-block__time mono">{block.start}</strong>
          </span>
        ) : (
          <span className="day-context-block__label">Fuera de fichaje</span>
        )}
      </header>

      {block.items.length ? (
        <ul className="day-context-block__list">
          {block.items.map((item) => (
            <ContextItemRow key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <p className="day-context-block__empty">Sin partes en este tramo</p>
      )}

      <footer className="day-context-block__footer">
        {isAttendance ? (
          block.open ? (
            <>
              <span className="day-context-block__open-label">En curso</span>
              <span className="day-context__sep" aria-hidden="true">
                ·
              </span>
              <span className="day-context-block__duration mono">{block.durationLabel}</span>
            </>
          ) : (
            <>
              <span>
                Salida <strong className="day-context-block__time mono">{block.end}</strong>
              </span>
              <span className="day-context__sep" aria-hidden="true">
                ·
              </span>
              <span className="day-context-block__duration mono">{block.durationLabel}</span>
            </>
          )
        ) : showOutsideDuration ? (
          <>
            <span>Total</span>
            <span className="day-context__sep" aria-hidden="true">
              ·
            </span>
            <span className="day-context-block__duration mono">{block.durationLabel}</span>
          </>
        ) : (
          <span className="day-context-block__open-label">En curso</span>
        )}
      </footer>
    </section>
  );
}

function ContextItemRow({ item }: { item: DayContextBlockItem }) {
  const showDuration = !item.open || item.seconds >= MIN_GAP_SECONDS;
  const rangeText = `${item.start} – ${item.end ?? 'en curso'}`;
  const titleParts = [
    item.project ? `${item.title} (${item.project})` : item.title,
    rangeText,
    ...(showDuration ? [item.durationLabel] : []),
  ];

  const classes = [
    'day-context-row',
    `day-context-row--${item.kind}`,
    item.open ? 'day-context-row--open' : '',
    item.overlap ? 'day-context-row--overlap' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      className={classes}
      style={{ minHeight: `${item.heightPx}px` }}
      title={titleParts.join(' · ')}
    >
      <span className="day-context-row__title">{item.title}</span>
      <span className="day-context-row__meta mono">
        <span className="day-context-row__range">{rangeText}</span>
        {showDuration ? (
          <span className="day-context-row__duration">{item.durationLabel}</span>
        ) : null}
      </span>
    </li>
  );
}
