// Pure vertical timeline model for the "Contexto del día" side panel.
// Reuses duration and clock formatting from the week timeline without duplicating logic.
import { DateTime } from 'luxon';
import type { DayContext } from '../../domain/dayContext.ts';
import { formatReadableDuration, formatTimeShort } from '../week/components/dayTimeline.model.ts';

export const DAY_TIMELINE_MIN_HOURS = 4;
export const DAY_TIMELINE_PX_PER_HOUR = 56;

const HOUR_MS = 3_600_000;

export type VerticalTick = {
  ms: number;
  topPercent: number;
  label: string;
};

export type VerticalAttendanceBlock = {
  id: string;
  startMs: number;
  endMs: number;
  topPercent: number;
  heightPercent: number;
  startLabel: string;
  endLabel: string | null;
  seconds: number;
  open: boolean;
  title: string;
};

export type VerticalEntryBlock = {
  id: string;
  task: string;
  project: string;
  startMs: number;
  endMs: number;
  topPercent: number;
  heightPercent: number;
  startLabel: string;
  endLabel: string;
  seconds: number;
  durationLabel: string;
  running: boolean;
  overlapsDraft: boolean;
  lane: number;
  laneCount: number;
  title: string;
};

export type VerticalGapBlock = {
  startMs: number;
  endMs: number;
  topPercent: number;
  heightPercent: number;
  startLabel: string;
  endLabel: string;
  seconds: number;
  durationLabel: string;
  title: string;
};

export type VerticalDraftBlock = {
  startMs: number;
  endMs: number;
  topPercent: number;
  heightPercent: number;
  startLabel: string;
  endLabel: string | null;
  seconds: number | null;
  durationLabel: string | null;
  open: boolean;
  hasOverlap: boolean;
  title: string;
};

export type VerticalOverlapBlock = {
  startMs: number;
  endMs: number;
  topPercent: number;
  heightPercent: number;
  startLabel: string;
  endLabel: string;
  seconds: number;
  durationLabel: string;
  tasks: string[];
  title: string;
};

export type DayContextTimelineModel = {
  axisStartMs: number;
  axisEndMs: number;
  totalHours: number;
  heightPx: number;
  ticks: VerticalTick[];
  attendance: VerticalAttendanceBlock[];
  gaps: VerticalGapBlock[];
  entries: VerticalEntryBlock[];
  draft: VerticalDraftBlock | null;
  overlapSegments: VerticalOverlapBlock[];
  attendanceSeconds: number;
  entrySeconds: number;
  unimputedSeconds: number;
  ariaLabel: string;
};

type Span = { startMs: number; endMs: number };

function mergeSpans(spans: readonly Span[]): Span[] {
  const valid = spans
    .filter((span) => span.endMs > span.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged: Span[] = [];
  for (const span of valid) {
    const previous = merged.at(-1);
    if (!previous || span.startMs > previous.endMs) {
      merged.push({ startMs: span.startMs, endMs: span.endMs });
    } else if (span.endMs > previous.endMs) {
      previous.endMs = span.endMs;
    }
  }
  return merged;
}

function subtractSpans(base: readonly Span[], covered: readonly Span[]): Span[] {
  const gaps: Span[] = [];
  for (const segment of base) {
    let cursor = segment.startMs;
    for (const cover of covered) {
      if (cover.endMs <= cursor) continue;
      if (cover.startMs >= segment.endMs) break;
      if (cover.startMs > cursor) {
        gaps.push({ startMs: cursor, endMs: Math.min(cover.startMs, segment.endMs) });
      }
      cursor = Math.max(cursor, Math.min(cover.endMs, segment.endMs));
    }
    if (cursor < segment.endMs) {
      gaps.push({ startMs: cursor, endMs: segment.endMs });
    }
  }
  return gaps;
}

function mergeOverlapSpans(
  spans: readonly { startMs: number; endMs: number; task: string }[],
): { startMs: number; endMs: number; tasks: string[] }[] {
  const valid = spans
    .filter((span) => span.endMs > span.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged: { startMs: number; endMs: number; tasks: string[] }[] = [];
  for (const span of valid) {
    const previous = merged.at(-1);
    if (!previous || span.startMs > previous.endMs) {
      merged.push({ startMs: span.startMs, endMs: span.endMs, tasks: [span.task] });
    } else {
      if (span.endMs > previous.endMs) {
        previous.endMs = span.endMs;
      }
      if (!previous.tasks.includes(span.task)) {
        previous.tasks.push(span.task);
      }
    }
  }
  return merged;
}

/** Assigns side-by-side lanes only to entries that actually overlap in time. */
function assignLanes<T extends Span>(items: readonly T[]): { lane: number; laneCount: number }[] {
  const result = items.map(() => ({ lane: 0, laneCount: 1 }));
  let clusterStart = 0;
  let clusterMaxEnd = -Infinity;

  const layoutCluster = (from: number, to: number) => {
    const laneEnds: number[] = [];
    for (let i = from; i < to; i += 1) {
      const item = items[i]!;
      let lane = laneEnds.findIndex((end) => end <= item.startMs);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.endMs);
      } else {
        laneEnds[lane] = item.endMs;
      }
      result[i]!.lane = lane;
    }
    const count = Math.max(1, laneEnds.length);
    for (let i = from; i < to; i += 1) {
      result[i]!.laneCount = count;
    }
  };

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    if (i > clusterStart && item.startMs >= clusterMaxEnd) {
      layoutCluster(clusterStart, i);
      clusterStart = i;
      clusterMaxEnd = item.endMs;
    } else {
      clusterMaxEnd = Math.max(clusterMaxEnd, item.endMs);
    }
  }
  if (clusterStart < items.length) {
    layoutCluster(clusterStart, items.length);
  }
  return result;
}

/**
 * Computes the proportional vertical timeline for one day:
 * hourly ticks (`HH:00`), attendance backdrop, unimputed amber gaps,
 * entry blocks, edited draft block, and red overlap segments.
 * Returns null when the day has no attendance, entries, or visible draft.
 */
export function buildDayContextTimeline(
  context: DayContext,
  now: string,
): DayContextTimelineModel | null {
  const dayStart = DateTime.fromISO(context.date, { zone: context.zone }).startOf('day');
  if (!dayStart.isValid) return null;
  const dayEnd = dayStart.plus({ days: 1 });
  const dayStartMs = dayStart.toMillis();
  const dayEndMs = dayEnd.toMillis();
  const nowMs = Date.parse(now);
  const clamp = (ms: number) => Math.max(dayStartMs, Math.min(dayEndMs, ms));

  const rawAttendance = context.attendance
    .map((row) => {
      const rawStart = Date.parse(row.start);
      const safeNow = Number.isFinite(nowMs) ? nowMs : rawStart;
      const rawEnd = row.end ? Date.parse(row.end) : Math.max(rawStart, safeNow);
      if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd < rawStart) return null;
      const startMs = clamp(rawStart);
      const endMs = Math.max(startMs, clamp(rawEnd));
      return {
        id: row.id,
        startMs,
        endMs,
        startLabel: row.startLabel,
        endLabel: row.endLabel,
        open: row.running,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const rawEntries = context.entries
    .map((entry) => {
      const rawStart = Date.parse(entry.start);
      const safeNow = Number.isFinite(nowMs) ? nowMs : rawStart;
      const rawEnd = entry.end ? Date.parse(entry.end) : Math.max(rawStart, safeNow);
      if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd) || rawEnd < rawStart) return null;
      const startMs = clamp(rawStart);
      const endMs = Math.max(startMs, clamp(rawEnd));
      return {
        id: entry.id,
        task: entry.task,
        project: entry.project,
        startMs,
        endMs,
        startLabel: entry.startLabel,
        endLabel: entry.running
          ? 'en curso'
          : (entry.endLabel ?? formatTimeShort(endMs, context.zone)),
        running: entry.running,
        overlapsDraft: entry.overlapsDraft,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  let rawDraft: {
    startMs: number;
    endMs: number;
    startLabel: string;
    endLabel: string | null;
    seconds: number | null;
    open: boolean;
  } | null = null;

  if (context.draft) {
    const rawStart = Date.parse(context.draft.start);
    const draftSeconds = context.draft.seconds;
    const open = draftSeconds === null;
    const rawEnd = open
      ? Math.max(rawStart, Number.isFinite(nowMs) ? nowMs : rawStart)
      : rawStart + draftSeconds * 1000;
    if (
      Number.isFinite(rawStart) &&
      Number.isFinite(rawEnd) &&
      rawStart < dayEndMs &&
      (rawEnd > dayStartMs || (rawEnd === rawStart && rawStart >= dayStartMs))
    ) {
      const startMs = clamp(rawStart);
      const endMs = Math.max(startMs, clamp(rawEnd));
      rawDraft = {
        startMs,
        endMs,
        startLabel: context.draft.startLabel,
        endLabel: context.draft.endLabel,
        seconds: context.draft.seconds,
        open,
      };
    }
  }

  if (!rawAttendance.length && !rawEntries.length && !rawDraft) return null;

  const starts = [
    ...rawAttendance.map((item) => item.startMs),
    ...rawEntries.map((item) => item.startMs),
    ...(rawDraft ? [rawDraft.startMs] : []),
  ];
  const ends = [
    ...rawAttendance.map((item) => item.endMs),
    ...rawEntries.map((item) => item.endMs),
    ...(rawDraft ? [rawDraft.endMs] : []),
  ];
  const minMs = Math.min(...starts);
  const maxMs = Math.max(...ends);

  let axisStart = DateTime.fromMillis(minMs, { zone: context.zone }).startOf('hour');
  const endFloor = DateTime.fromMillis(maxMs, { zone: context.zone }).startOf('hour');
  let axisEnd = endFloor.toMillis() < maxMs ? endFloor.plus({ hours: 1 }) : endFloor;

  if (axisEnd.toMillis() - axisStart.toMillis() < DAY_TIMELINE_MIN_HOURS * HOUR_MS) {
    axisEnd = axisStart.plus({ hours: DAY_TIMELINE_MIN_HOURS });
    if (axisEnd.toMillis() > dayEndMs) {
      axisEnd = dayEnd;
      const shiftedStartMs = Math.max(dayStartMs, dayEndMs - DAY_TIMELINE_MIN_HOURS * HOUR_MS);
      axisStart = DateTime.fromMillis(shiftedStartMs, { zone: context.zone });
    }
  }

  const axisStartMs = axisStart.toMillis();
  const axisEndMs = axisEnd.toMillis();
  const spanMs = axisEndMs - axisStartMs;
  const toPercent = (value: number) => (value / spanMs) * 100;
  const totalHours = Math.max(DAY_TIMELINE_MIN_HOURS, Math.round(spanMs / HOUR_MS));
  const heightPx = totalHours * DAY_TIMELINE_PX_PER_HOUR;

  const ticks: VerticalTick[] = [];
  for (let cursor = axisStart; cursor.toMillis() <= axisEndMs; cursor = cursor.plus({ hours: 1 })) {
    const ms = cursor.toMillis();
    ticks.push({
      ms,
      topPercent: toPercent(ms - axisStartMs),
      label: formatTimeShort(ms, context.zone),
    });
  }

  const attendance: VerticalAttendanceBlock[] = rawAttendance.map((item) => {
    const seconds = (item.endMs - item.startMs) / 1000;
    return {
      ...item,
      topPercent: toPercent(item.startMs - axisStartMs),
      heightPercent: toPercent(item.endMs - item.startMs),
      seconds,
      title: `Fichado · ${item.startLabel}–${item.endLabel ?? 'en curso'} · ${formatReadableDuration(seconds)}`,
    };
  });

  const lanes = assignLanes(rawEntries);
  const entries: VerticalEntryBlock[] = rawEntries.map((item, index) => {
    const seconds = (item.endMs - item.startMs) / 1000;
    const durationLabel = formatReadableDuration(seconds);
    const { lane, laneCount } = lanes[index]!;
    return {
      ...item,
      topPercent: toPercent(item.startMs - axisStartMs),
      heightPercent: toPercent(item.endMs - item.startMs),
      seconds,
      durationLabel,
      lane,
      laneCount,
      title: `${item.task}${item.project ? ` (${item.project})` : ''} · ${item.startLabel}–${item.endLabel} · ${durationLabel}`,
    };
  });

  const mergedAttendance = mergeSpans(rawAttendance);
  const mergedEntries = mergeSpans(rawEntries);
  const gaps: VerticalGapBlock[] = subtractSpans(mergedAttendance, mergedEntries).map((gap) => {
    const startLabel = formatTimeShort(gap.startMs, context.zone);
    const endLabel = formatTimeShort(gap.endMs, context.zone);
    const seconds = (gap.endMs - gap.startMs) / 1000;
    const durationLabel = formatReadableDuration(seconds);
    return {
      ...gap,
      topPercent: toPercent(gap.startMs - axisStartMs),
      heightPercent: toPercent(gap.endMs - gap.startMs),
      startLabel,
      endLabel,
      seconds,
      durationLabel,
      title: `Sin imputar · ${startLabel}–${endLabel} · ${durationLabel}`,
    };
  });

  const draft: VerticalDraftBlock | null = rawDraft
    ? (() => {
        const displaySeconds =
          rawDraft.seconds !== null
            ? rawDraft.seconds
            : rawDraft.endMs > rawDraft.startMs
              ? (rawDraft.endMs - rawDraft.startMs) / 1000
              : null;
        const durationLabel =
          displaySeconds !== null ? formatReadableDuration(displaySeconds) : null;
        return {
          ...rawDraft,
          topPercent: toPercent(rawDraft.startMs - axisStartMs),
          heightPercent: toPercent(rawDraft.endMs - rawDraft.startMs),
          durationLabel,
          hasOverlap: context.overlaps.length > 0,
          title: `Este parte · ${rawDraft.startLabel}–${rawDraft.endLabel ?? 'en curso'}${durationLabel ? ` · ${durationLabel}` : ''}`,
        };
      })()
    : null;

  const rawOverlapSegments: { startMs: number; endMs: number; task: string }[] = [];
  if (rawDraft) {
    for (const entry of rawEntries) {
      if (!entry.overlapsDraft) continue;
      const startMs = Math.max(rawDraft.startMs, entry.startMs);
      const endMs = rawDraft.open ? entry.endMs : Math.min(rawDraft.endMs, entry.endMs);
      if (endMs > startMs) {
        rawOverlapSegments.push({ startMs, endMs, task: entry.task });
      }
    }
  }
  const overlapSegments: VerticalOverlapBlock[] = mergeOverlapSpans(rawOverlapSegments).map(
    (segment) => {
      const startLabel = formatTimeShort(segment.startMs, context.zone);
      const endLabel = formatTimeShort(segment.endMs, context.zone);
      const seconds = (segment.endMs - segment.startMs) / 1000;
      const durationLabel = formatReadableDuration(seconds);
      return {
        ...segment,
        topPercent: toPercent(segment.startMs - axisStartMs),
        heightPercent: toPercent(segment.endMs - segment.startMs),
        startLabel,
        endLabel,
        seconds,
        durationLabel,
        title: `Solape con ${segment.tasks.join(', ')} · ${startLabel}–${endLabel} · ${durationLabel}`,
      };
    },
  );

  const attendanceSeconds = context.attendanceSeconds;
  const entrySeconds = context.entrySeconds;
  const unimputedSeconds = gaps.reduce((sum, gap) => sum + gap.seconds, 0);

  const summaryParts: string[] = [];
  if (attendance.length) {
    const ranges = attendance
      .map((item) => `${item.startLabel}–${item.endLabel ?? 'en curso'}`)
      .join(', ');
    summaryParts.push(`Fichado ${ranges} (${formatReadableDuration(attendanceSeconds)})`);
  } else {
    summaryParts.push('Sin fichajes');
  }
  summaryParts.push(
    entries.length
      ? `${entries.length} ${entries.length === 1 ? 'parte' : 'partes'} (${formatReadableDuration(entrySeconds)})`
      : 'sin partes',
  );
  if (attendance.length) {
    summaryParts.push(
      unimputedSeconds >= 60
        ? `sin imputar ${formatReadableDuration(unimputedSeconds)}`
        : 'todo imputado',
    );
  }
  if (draft) {
    summaryParts.push(
      `este parte ${draft.startLabel}–${draft.endLabel ?? 'en curso'}${draft.durationLabel ? ` (${draft.durationLabel})` : ''}`,
    );
  }
  if (context.overlaps.length) {
    summaryParts.push(
      `se solapa con ${context.overlaps.length === 1 ? 'otro parte' : `${context.overlaps.length} partes`}`,
    );
  }

  return {
    axisStartMs,
    axisEndMs,
    totalHours,
    heightPx,
    ticks,
    attendance,
    gaps,
    entries,
    draft,
    overlapSegments,
    attendanceSeconds,
    entrySeconds,
    unimputedSeconds,
    ariaLabel: summaryParts.join('; '),
  };
}
