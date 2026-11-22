import { useState } from 'react';
import { DateTime } from 'luxon';
import type { WorkspaceData } from '../../domain/models';
import { dayContext } from '../../domain/dayContext';
import type { DayContext, DayContextOptions } from '../../domain/dayContext';
import { formatReadableDuration } from '../week/components/dayTimeline.model';
import { Icon } from '../../shared/ui/Icon';
import { buildDayContextTimeline } from './dayContextTimeline';
import type { VerticalDraftBlock } from './dayContextTimeline';
import './day-context.css';

const EMPTY_HOURS = ['09:00', '10:00', '11:00', '12:00', '13:00'] as const;

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
 * Attendance and entries of `date` as a vertical timeline, for the time-entry forms:
 * clocked hours, recorded entries, unimputed gaps, and the interval being edited.
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
  const orderedItems = context ? orderedTimelineItems(context) : [];

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

          {timeline ? (
            <div className="day-context-tl__legend" aria-hidden="true">
              {timeline.attendance.length ? (
                <span>
                  <i className="day-context-tl__swatch day-context-tl__swatch--attendance" />
                  Fichado
                </span>
              ) : null}
              {timeline.entries.length ? (
                <span>
                  <i className="day-context-tl__swatch day-context-tl__swatch--entry" />
                  Partes
                </span>
              ) : null}
              {timeline.unimputedSeconds >= 60 ? (
                <span>
                  <i className="day-context-tl__swatch day-context-tl__swatch--gap" />
                  Sin imputar
                </span>
              ) : null}
              {timeline.draft ? (
                <span>
                  <i className="day-context-tl__swatch day-context-tl__swatch--draft" />
                  Este parte
                </span>
              ) : null}
              {timeline.overlapSegments.length ? (
                <span>
                  <i className="day-context-tl__swatch day-context-tl__swatch--overlap" />
                  Solape
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="day-context__scroll">
            {!timeline ? (
              <div
                className="day-context-tl day-context-tl--empty"
                role="img"
                aria-label="Sin fichajes ni partes este día"
              >
                <div className="day-context-tl__empty-grid" aria-hidden="true">
                  {EMPTY_HOURS.map((hour) => (
                    <div key={hour} className="day-context-tl__empty-row">
                      <span className="day-context-tl__empty-hour mono">{hour}</span>
                      <span className="day-context-tl__empty-line" />
                    </div>
                  ))}
                </div>
                <p className="day-context-tl__empty-text">Sin fichajes ni partes este día</p>
              </div>
            ) : (
              <div className="day-context-tl" role="img" aria-label={timeline.ariaLabel}>
                <div
                  className="day-context-tl__canvas"
                  style={{ height: `${timeline.heightPx}px` }}
                >
                  <div className="day-context-tl__axis" aria-hidden="true">
                    {timeline.ticks.map((tick) => (
                      <span
                        key={tick.ms}
                        className="day-context-tl__tick mono"
                        style={{ top: `${tick.topPercent}%` }}
                      >
                        {tick.label}
                      </span>
                    ))}
                  </div>

                  <div className="day-context-tl__track">
                    {timeline.ticks.map((tick) => (
                      <span
                        key={tick.ms}
                        className="day-context-tl__gridline"
                        style={{ top: `${tick.topPercent}%` }}
                        aria-hidden="true"
                      />
                    ))}

                    {timeline.attendance.map((block) => (
                      <div
                        key={block.id}
                        className={`day-context-tl__attendance ${block.open ? 'day-context-tl__attendance--open' : ''}`}
                        style={{
                          top: `${block.topPercent}%`,
                          height: `${block.heightPercent}%`,
                        }}
                        title={block.title}
                      >
                        {block.open ? (
                          <span className="day-context-tl__open-badge mono">en curso</span>
                        ) : null}
                      </div>
                    ))}

                    {timeline.gaps.map((gap) => (
                      <div
                        key={`${gap.startMs}-${gap.endMs}`}
                        className="day-context-tl__gap"
                        style={{
                          top: `${gap.topPercent}%`,
                          height: `${gap.heightPercent}%`,
                        }}
                        title={gap.title}
                      />
                    ))}

                    {timeline.entries.map((entry) => {
                      const blockHeightPx = (entry.heightPercent / 100) * timeline.heightPx;
                      const laneWidth = 100 / entry.laneCount;
                      const laneLeft = entry.lane * laneWidth;
                      return (
                        <div
                          key={entry.id}
                          className={`day-context-tl__entry ${entry.running ? 'day-context-tl__entry--running' : ''} ${entry.overlapsDraft ? 'day-context-tl__entry--overlap' : ''}`}
                          style={{
                            top: `${entry.topPercent}%`,
                            height: `${entry.heightPercent}%`,
                            left: `calc(${laneLeft}% + 4px)`,
                            width: `calc(${laneWidth}% - 8px)`,
                          }}
                          title={entry.title}
                        >
                          {blockHeightPx >= 22 ? (
                            <span className="day-context-tl__block-title">{entry.task}</span>
                          ) : null}
                          {blockHeightPx >= 40 ? (
                            <span className="day-context-tl__block-meta mono">
                              {entry.startLabel}–{entry.endLabel} · {entry.durationLabel}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}

                    {timeline.draft ? (
                      <DraftBlock block={timeline.draft} totalHeightPx={timeline.heightPx} />
                    ) : null}

                    {timeline.overlapSegments.map((segment) => (
                      <div
                        key={`${segment.startMs}-${segment.endMs}`}
                        className="day-context-tl__overlap"
                        style={{
                          top: `${segment.topPercent}%`,
                          height: `${segment.heightPercent}%`,
                        }}
                        title={segment.title}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="sr-only">
            <section aria-label="Entradas y salidas">
              {context.attendance.length ? (
                <>
                  <p>
                    Entrada {context.firstIn} · Salida {context.lastOut ?? 'en curso'} · Total{' '}
                    {formatReadableDuration(context.attendanceSeconds)}
                  </p>
                  <ul>
                    {context.attendance.map((row) => (
                      <li key={row.id}>
                        {row.startLabel}–{row.endLabel ?? 'en curso'} ·{' '}
                        {formatReadableDuration(row.seconds)}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p>Sin fichajes este día.</p>
              )}
            </section>

            <section aria-label="Partes del día">
              {orderedItems.length ? (
                <ol>
                  {orderedItems.map((item) =>
                    item.kind === 'draft' ? (
                      <li key="draft">
                        Este parte: {item.startLabel}–{item.endLabel ?? 'en curso'}
                        {item.seconds !== null ? ` · ${formatReadableDuration(item.seconds)}` : ''}
                      </li>
                    ) : (
                      <li key={item.entry.id}>
                        {item.entry.task}
                        {item.entry.project ? ` (${item.entry.project})` : ''}:{' '}
                        {item.entry.startLabel}–{item.entry.endLabel ?? 'en curso'} ·{' '}
                        {formatReadableDuration(item.entry.seconds)}
                        {item.entry.overlapsDraft ? ' · Se solapa con este parte' : ''}
                      </li>
                    ),
                  )}
                </ol>
              ) : (
                <p>Sin partes este día.</p>
              )}
            </section>
          </div>
        </>
      )}
    </aside>
  );
}

function DraftBlock({
  block,
  totalHeightPx,
}: {
  block: VerticalDraftBlock;
  totalHeightPx: number;
}) {
  const blockHeightPx = (block.heightPercent / 100) * totalHeightPx;
  const isPointMarker = block.open && blockHeightPx < 22;
  const nearBottom = isPointMarker && block.topPercent > 88;
  return (
    <div
      className={`day-context-tl__draft ${block.open ? 'day-context-tl__draft--open' : ''} ${isPointMarker ? 'day-context-tl__draft--marker' : ''} ${nearBottom ? 'day-context-tl__draft--marker-up' : ''}`}
      style={{
        top: `${block.topPercent}%`,
        height: isPointMarker ? undefined : `${block.heightPercent}%`,
      }}
      title={block.title}
    >
      {blockHeightPx >= 22 || isPointMarker ? (
        <span className="day-context-tl__block-title">
          Este parte{isPointMarker ? ` · ${block.startLabel}` : ''}
        </span>
      ) : null}
      {blockHeightPx >= 40 ? (
        <span className="day-context-tl__block-meta mono">
          {block.startLabel}–{block.endLabel ?? 'en curso'}
          {block.durationLabel ? ` · ${block.durationLabel}` : ''}
        </span>
      ) : null}
    </div>
  );
}

type TimelineItem =
  | { kind: 'entry'; entry: DayContext['entries'][number] }
  | ({ kind: 'draft' } & NonNullable<DayContext['draft']>);

/** Entries in order, with the draft placed where it starts, for the accessible list. */
function orderedTimelineItems(context: DayContext): TimelineItem[] {
  const items: TimelineItem[] = context.entries.map((entry) => ({ kind: 'entry', entry }));
  if (!context.draft) return items;
  const draft: TimelineItem = { kind: 'draft', ...context.draft };
  const at = Date.parse(context.draft.start);
  const index = context.entries.findIndex((entry) => Date.parse(entry.start) > at);
  items.splice(index < 0 ? items.length : index, 0, draft);
  return items;
}
