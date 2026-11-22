export type TimelineAttendanceInput = {
  id: string;
  start: string;
  /** null while the attendance record is still open. */
  end: string | null;
  provisional?: boolean;
};

export type TimelineEntryInput = {
  id: string;
  task: string;
  start: string;
  /** null while the entry timer is still running. */
  end: string | null;
};

export type BuildDayTimelineInput = {
  attendance: readonly TimelineAttendanceInput[];
  entries: readonly TimelineEntryInput[];
  zone: string;
  now: string;
};

export type TimelineTick = {
  ms: number;
  leftPercent: number;
  label: string;
};

export type TimelineAttendanceBlock = {
  id: string;
  startMs: number;
  endMs: number;
  leftPercent: number;
  widthPercent: number;
  startLabel: string;
  endLabel: string | null;
  seconds: number;
  open: boolean;
  provisional: boolean;
  title: string;
};

export type TimelineEntryBlock = {
  id: string;
  task: string;
  startMs: number;
  endMs: number;
  leftPercent: number;
  widthPercent: number;
  startLabel: string;
  endLabel: string;
  seconds: number;
  running: boolean;
  title: string;
};

export type TimelineGapBlock = {
  startMs: number;
  endMs: number;
  leftPercent: number;
  widthPercent: number;
  startLabel: string;
  endLabel: string;
  seconds: number;
  title: string;
};

export type DayTimelineModel = {
  axisStartMs: number;
  axisEndMs: number;
  ticks: TimelineTick[];
  attendance: TimelineAttendanceBlock[];
  entries: TimelineEntryBlock[];
  gaps: TimelineGapBlock[];
  attendanceSeconds: number;
  entriesSeconds: number;
  unimputedSeconds: number;
  ariaLabel: string;
};

const HOUR_MS = 3_600_000;

/** Formats seconds as human-readable Spanish duration ("6 h 09 min", "2 h", "54 min"). */
export function formatReadableDuration(seconds: number): string {
  const totalMinutes = Math.max(0, Math.floor(seconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${String(minutes).padStart(2, '0')} min`;
}

function clockParts(ms: number, zone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(new Date(ms));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  return { hour: part('hour'), minute: part('minute'), second: part('second') };
}

export function formatTimeShort(ms: number, zone: string): string {
  const { hour, minute } = clockParts(ms, zone);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function floorToHour(ms: number, zone: string): number {
  const wholeMs = Math.floor(ms / 1000) * 1000;
  const { minute, second } = clockParts(wholeMs, zone);
  return wholeMs - (minute * 60 + second) * 1000;
}

function ceilToHour(ms: number, zone: string): number {
  const floored = floorToHour(ms, zone);
  return floored < ms ? floored + HOUR_MS : floored;
}

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

/**
 * Pure calculation of the day's timeline bar: axis bounds rounded to local hours,
 * attendance background blocks, time-entry foreground blocks, and unimputed gaps
 * inside attendance not covered by any entry. Returns null when the day has no intervals.
 */
export function buildDayTimeline({
  attendance,
  entries,
  zone,
  now,
}: BuildDayTimelineInput): DayTimelineModel | null {
  const nowMs = Date.parse(now);
  const rawAttendance = attendance
    .map((record) => {
      const startMs = Date.parse(record.start);
      const open = record.end === null;
      const endMs = record.end ? Date.parse(record.end) : Math.max(startMs, nowMs);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
      return {
        id: record.id,
        startMs,
        endMs,
        open,
        provisional: Boolean(record.provisional || open),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const rawEntries = entries
    .map((entry) => {
      const startMs = Date.parse(entry.start);
      const running = entry.end === null;
      const endMs = entry.end ? Date.parse(entry.end) : Math.max(startMs, nowMs);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return null;
      return { id: entry.id, task: entry.task, startMs, endMs, running };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  if (!rawAttendance.length && !rawEntries.length) return null;

  const minMs = Math.min(
    ...rawAttendance.map((item) => item.startMs),
    ...rawEntries.map((item) => item.startMs),
  );
  const maxMs = Math.max(
    ...rawAttendance.map((item) => item.endMs),
    ...rawEntries.map((item) => item.endMs),
  );

  const axisStartMs = floorToHour(minMs, zone);
  const roundedEndMs = ceilToHour(maxMs, zone);
  const axisEndMs = roundedEndMs > axisStartMs ? roundedEndMs : axisStartMs + HOUR_MS;
  const spanMs = axisEndMs - axisStartMs;
  const toPercent = (value: number) => (value / spanMs) * 100;

  const totalHours = Math.max(1, Math.round(spanMs / HOUR_MS));
  const stepHours = totalHours <= 7 ? 1 : totalHours <= 16 ? 2 : totalHours <= 20 ? 3 : 4;
  const ticks: TimelineTick[] = [];
  for (let ms = axisStartMs; ms <= axisEndMs; ms += stepHours * HOUR_MS) {
    ticks.push({
      ms,
      leftPercent: toPercent(ms - axisStartMs),
      label: formatTimeShort(ms, zone),
    });
  }

  const attendanceBlocks: TimelineAttendanceBlock[] = rawAttendance.map((item) => {
    const startLabel = formatTimeShort(item.startMs, zone);
    const endLabel = item.open ? null : formatTimeShort(item.endMs, zone);
    const seconds = (item.endMs - item.startMs) / 1000;
    return {
      ...item,
      leftPercent: toPercent(item.startMs - axisStartMs),
      widthPercent: toPercent(item.endMs - item.startMs),
      startLabel,
      endLabel,
      seconds,
      title: `Fichado · ${startLabel}–${endLabel ?? 'en curso'} · ${formatReadableDuration(seconds)}`,
    };
  });

  const entryBlocks: TimelineEntryBlock[] = rawEntries.map((item) => {
    const startLabel = formatTimeShort(item.startMs, zone);
    const endLabel = item.running ? 'en curso' : formatTimeShort(item.endMs, zone);
    const seconds = (item.endMs - item.startMs) / 1000;
    return {
      ...item,
      leftPercent: toPercent(item.startMs - axisStartMs),
      widthPercent: toPercent(item.endMs - item.startMs),
      startLabel,
      endLabel,
      seconds,
      title: `${item.task} · ${startLabel}–${endLabel} · ${formatReadableDuration(seconds)}`,
    };
  });

  const mergedAttendance = mergeSpans(rawAttendance);
  const mergedEntries = mergeSpans(rawEntries);
  const gaps: TimelineGapBlock[] = subtractSpans(mergedAttendance, mergedEntries).map((gap) => {
    const startLabel = formatTimeShort(gap.startMs, zone);
    const endLabel = formatTimeShort(gap.endMs, zone);
    const seconds = (gap.endMs - gap.startMs) / 1000;
    return {
      ...gap,
      leftPercent: toPercent(gap.startMs - axisStartMs),
      widthPercent: toPercent(gap.endMs - gap.startMs),
      startLabel,
      endLabel,
      seconds,
      title: `Sin imputar · ${startLabel}–${endLabel} · ${formatReadableDuration(seconds)}`,
    };
  });

  const attendanceSeconds = mergedAttendance.reduce(
    (sum, item) => sum + (item.endMs - item.startMs) / 1000,
    0,
  );
  const entriesSeconds = entryBlocks.reduce((sum, item) => sum + item.seconds, 0);
  const unimputedSeconds = gaps.reduce((sum, item) => sum + item.seconds, 0);

  const summaryParts: string[] = [];
  if (attendanceBlocks.length) {
    const ranges = attendanceBlocks
      .map((item) => `${item.startLabel}–${item.endLabel ?? 'en curso'}`)
      .join(', ');
    summaryParts.push(`Fichado ${ranges}`);
  } else {
    summaryParts.push('Sin fichajes');
  }
  summaryParts.push(
    entryBlocks.length ? `partes ${formatReadableDuration(entriesSeconds)}` : 'sin partes',
  );
  if (attendanceBlocks.length) {
    summaryParts.push(
      unimputedSeconds >= 60
        ? `sin imputar ${formatReadableDuration(unimputedSeconds)}`
        : 'todo imputado',
    );
  }

  return {
    axisStartMs,
    axisEndMs,
    ticks,
    attendance: attendanceBlocks,
    entries: entryBlocks,
    gaps,
    attendanceSeconds,
    entriesSeconds,
    unimputedSeconds,
    ariaLabel: summaryParts.join('; '),
  };
}
