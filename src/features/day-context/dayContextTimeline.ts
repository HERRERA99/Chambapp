// Pure block-list model for the "Contexto del día" side panel.
// Reuses duration and clock formatting from the week timeline without duplicating logic.
import { DateTime } from 'luxon';
import type { DayContext } from '../../domain/dayContext.ts';
import { formatReadableDuration, formatTimeShort } from '../week/components/dayTimeline.model.ts';

export const DAY_BLOCK_ITEM_MIN_HEIGHT_PX = 28;
export const DAY_BLOCK_ITEM_MAX_HEIGHT_PX = 120;
export const DAY_BLOCK_PX_PER_HOUR = 36;
export const MIN_GAP_SECONDS = 60;

export type DayContextBlockKind = 'attendance' | 'outside';
export type DayContextItemKind = 'entry' | 'gap' | 'draft';

export type DayContextBlockItem = {
  id: string;
  kind: DayContextItemKind;
  startMs: number;
  endMs: number;
  /** Exact HH:MM start time in the day's timezone. */
  start: string;
  /** Exact HH:MM end time in the day's timezone, or null while open/running. */
  end: string | null;
  seconds: number;
  durationLabel: string;
  title: string;
  project?: string;
  open?: boolean;
  overlap?: boolean;
  heightPx: number;
};

export type DayContextBlock = {
  id: string;
  kind: DayContextBlockKind;
  startMs: number;
  endMs: number;
  /** Exact HH:MM start time in the day's timezone. */
  start: string;
  /** Exact HH:MM end time in the day's timezone, or null while open. */
  end: string | null;
  open: boolean;
  seconds: number;
  durationLabel: string;
  items: DayContextBlockItem[];
  ariaLabel: string;
};

export type DayContextPause = {
  /** Index in `blocks` immediately preceding this pause. */
  afterBlockIndex: number;
  startMs: number;
  endMs: number;
  start: string;
  end: string;
  seconds: number;
  durationLabel: string;
};

export type DayContextTimelineModel = {
  blocks: DayContextBlock[];
  pauses: DayContextPause[];
  attendanceSeconds: number;
  entrySeconds: number;
  unimputedSeconds: number;
};

type Span = { startMs: number; endMs: number };

const ITEM_KIND_ORDER: Record<DayContextItemKind, number> = {
  entry: 0,
  draft: 1,
  gap: 2,
};

/** Computes a proportional row height clamped to a legible min/max range. */
export function computeItemHeightPx(seconds: number): number {
  const raw = Math.round((Math.max(0, seconds) / 3600) * DAY_BLOCK_PX_PER_HOUR);
  return Math.max(DAY_BLOCK_ITEM_MIN_HEIGHT_PX, Math.min(DAY_BLOCK_ITEM_MAX_HEIGHT_PX, raw));
}

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
  const result: Span[] = [];
  for (const segment of base) {
    let cursor = segment.startMs;
    for (const cover of covered) {
      if (cover.endMs <= cursor) continue;
      if (cover.startMs >= segment.endMs) break;
      if (cover.startMs > cursor) {
        result.push({ startMs: cursor, endMs: Math.min(cover.startMs, segment.endMs) });
      }
      cursor = Math.max(cursor, Math.min(cover.endMs, segment.endMs));
    }
    if (cursor < segment.endMs) {
      result.push({ startMs: cursor, endMs: segment.endMs });
    }
  }
  return result;
}

function sortItems(items: DayContextBlockItem[]): DayContextBlockItem[] {
  return items.sort(
    (a, b) =>
      a.startMs - b.startMs ||
      a.endMs - b.endMs ||
      ITEM_KIND_ORDER[a.kind] - ITEM_KIND_ORDER[b.kind],
  );
}

/**
 * Builds chronological attendance blocks (each containing its entries, draft, and unimputed
 * gaps >= 1 min), pauses between consecutive attendance blocks, and an optional "Fuera de
 * fichaje" block for entries or draft intervals falling outside attendance.
 * Returns null when the day has no attendance, entries, or visible draft.
 */
export function buildDayContextTimeline(
  context: DayContext,
  now: string,
): DayContextTimelineModel | null {
  const dayStart = DateTime.fromISO(context.date, { zone: context.zone }).startOf('day');
  if (!dayStart.isValid) return null;
  const dayStartMs = dayStart.toMillis();
  const dayEndMs = dayStart.plus({ days: 1 }).toMillis();
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
        open: entry.running,
        overlapsDraft: entry.overlapsDraft,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  let rawDraft: { startMs: number; endMs: number; open: boolean } | null = null;
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
      rawDraft = { startMs, endMs, open };
    }
  }

  if (!rawAttendance.length && !rawEntries.length && !rawDraft) return null;

  const entrySegmentOverlapsDraft = (
    entry: (typeof rawEntries)[number],
    segStartMs: number,
    segEndMs: number,
  ): boolean => {
    if (!rawDraft || !entry.overlapsDraft) return false;
    if (rawDraft.open) {
      return entry.open || segEndMs > rawDraft.startMs;
    }
    if (segStartMs === segEndMs) {
      return segStartMs >= rawDraft.startMs && segStartMs < rawDraft.endMs;
    }
    return segStartMs < rawDraft.endMs && segEndMs > rawDraft.startMs;
  };

  const draftSegmentOverlapsEntry = (
    segStartMs: number,
    segEndMs: number,
    isOpenSegment: boolean,
  ): boolean => {
    if (!context.overlaps.length) return false;
    if (isOpenSegment) return true;
    if (segStartMs === segEndMs) {
      return rawEntries.some(
        (entry) =>
          entry.overlapsDraft &&
          (entry.open || (entry.startMs <= segStartMs && entry.endMs > segStartMs)),
      );
    }
    return rawEntries.some(
      (entry) => entry.overlapsDraft && entry.startMs < segEndMs && entry.endMs > segStartMs,
    );
  };

  const makeEntryItem = (
    id: string,
    entry: (typeof rawEntries)[number],
    segStartMs: number,
    segEndMs: number,
  ): DayContextBlockItem => {
    const isOpenSegment = entry.open && segEndMs === entry.endMs;
    const seconds = (segEndMs - segStartMs) / 1000;
    const overlap = entrySegmentOverlapsDraft(entry, segStartMs, segEndMs);
    return {
      id,
      kind: 'entry',
      startMs: segStartMs,
      endMs: segEndMs,
      start: formatTimeShort(segStartMs, context.zone),
      end: isOpenSegment ? null : formatTimeShort(segEndMs, context.zone),
      seconds,
      durationLabel: formatReadableDuration(seconds),
      title: entry.task,
      ...(entry.project ? { project: entry.project } : {}),
      ...(isOpenSegment ? { open: true } : {}),
      ...(overlap ? { overlap: true } : {}),
      heightPx: computeItemHeightPx(seconds),
    };
  };

  const makeDraftItem = (
    id: string,
    draft: NonNullable<typeof rawDraft>,
    segStartMs: number,
    segEndMs: number,
  ): DayContextBlockItem => {
    const isOpenSegment = draft.open && segEndMs === draft.endMs;
    const seconds = (segEndMs - segStartMs) / 1000;
    const overlap = draftSegmentOverlapsEntry(segStartMs, segEndMs, isOpenSegment);
    return {
      id,
      kind: 'draft',
      startMs: segStartMs,
      endMs: segEndMs,
      start: formatTimeShort(segStartMs, context.zone),
      end: isOpenSegment ? null : formatTimeShort(segEndMs, context.zone),
      seconds,
      durationLabel: formatReadableDuration(seconds),
      title: 'Este parte',
      ...(isOpenSegment ? { open: true } : {}),
      ...(overlap ? { overlap: true } : {}),
      heightPx: computeItemHeightPx(seconds),
    };
  };

  const placedPointEntryIds = new Set<string>();
  let placedPointDraft = false;

  const attendanceBlocks: DayContextBlock[] = rawAttendance.map((att) => {
    const items: DayContextBlockItem[] = [];

    for (const entry of rawEntries) {
      if (entry.startMs === entry.endMs) {
        if (
          !placedPointEntryIds.has(entry.id) &&
          att.startMs <= entry.startMs &&
          entry.startMs <= att.endMs
        ) {
          placedPointEntryIds.add(entry.id);
          items.push(
            makeEntryItem(`${att.id}:entry:${entry.id}`, entry, entry.startMs, entry.endMs),
          );
        }
        continue;
      }
      const segStart = Math.max(att.startMs, entry.startMs);
      const segEnd = Math.min(att.endMs, entry.endMs);
      if (segEnd > segStart) {
        items.push(makeEntryItem(`${att.id}:entry:${entry.id}`, entry, segStart, segEnd));
      }
    }

    if (rawDraft) {
      if (rawDraft.startMs === rawDraft.endMs) {
        if (!placedPointDraft && att.startMs <= rawDraft.startMs && rawDraft.startMs <= att.endMs) {
          placedPointDraft = true;
          items.push(makeDraftItem(`${att.id}:draft`, rawDraft, rawDraft.startMs, rawDraft.endMs));
        }
      } else {
        const segStart = Math.max(att.startMs, rawDraft.startMs);
        const segEnd = Math.min(att.endMs, rawDraft.endMs);
        if (segEnd > segStart) {
          items.push(makeDraftItem(`${att.id}:draft`, rawDraft, segStart, segEnd));
        }
      }
    }

    const covered = mergeSpans(items.map((item) => ({ startMs: item.startMs, endMs: item.endMs })));
    const gaps = subtractSpans([{ startMs: att.startMs, endMs: att.endMs }], covered);
    for (const gap of gaps) {
      const seconds = (gap.endMs - gap.startMs) / 1000;
      if (seconds < MIN_GAP_SECONDS) continue;
      items.push({
        id: `${att.id}:gap:${gap.startMs}-${gap.endMs}`,
        kind: 'gap',
        startMs: gap.startMs,
        endMs: gap.endMs,
        start: formatTimeShort(gap.startMs, context.zone),
        end: formatTimeShort(gap.endMs, context.zone),
        seconds,
        durationLabel: formatReadableDuration(seconds),
        title: 'Sin imputar',
        heightPx: computeItemHeightPx(seconds),
      });
    }

    sortItems(items);

    const seconds = (att.endMs - att.startMs) / 1000;
    const durationLabel = formatReadableDuration(seconds);
    const start = formatTimeShort(att.startMs, context.zone);
    const end = att.open ? null : formatTimeShort(att.endMs, context.zone);

    return {
      id: att.id,
      kind: 'attendance',
      startMs: att.startMs,
      endMs: att.endMs,
      start,
      end,
      open: att.open,
      seconds,
      durationLabel,
      items,
      ariaLabel: `Fichaje ${start}–${end ?? 'en curso'}, ${durationLabel}`,
    };
  });

  const pauses: DayContextPause[] = [];
  for (let i = 0; i < attendanceBlocks.length - 1; i += 1) {
    const current = attendanceBlocks[i]!;
    const next = attendanceBlocks[i + 1]!;
    const seconds = (next.startMs - current.endMs) / 1000;
    if (seconds < MIN_GAP_SECONDS) continue;
    pauses.push({
      afterBlockIndex: i,
      startMs: current.endMs,
      endMs: next.startMs,
      start: current.end ?? formatTimeShort(current.endMs, context.zone),
      end: next.start,
      seconds,
      durationLabel: formatReadableDuration(seconds),
    });
  }

  const mergedAttendance = mergeSpans(rawAttendance);
  const outsideItems: DayContextBlockItem[] = [];

  for (const entry of rawEntries) {
    if (entry.startMs === entry.endMs) {
      if (!placedPointEntryIds.has(entry.id)) {
        outsideItems.push(
          makeEntryItem(`outside:entry:${entry.id}`, entry, entry.startMs, entry.endMs),
        );
      }
      continue;
    }
    const segments = subtractSpans(
      [{ startMs: entry.startMs, endMs: entry.endMs }],
      mergedAttendance,
    );
    for (const seg of segments) {
      outsideItems.push(
        makeEntryItem(`outside:entry:${entry.id}:${seg.startMs}`, entry, seg.startMs, seg.endMs),
      );
    }
  }

  if (rawDraft) {
    if (rawDraft.startMs === rawDraft.endMs) {
      if (!placedPointDraft) {
        outsideItems.push(
          makeDraftItem('outside:draft', rawDraft, rawDraft.startMs, rawDraft.endMs),
        );
      }
    } else {
      const segments = subtractSpans(
        [{ startMs: rawDraft.startMs, endMs: rawDraft.endMs }],
        mergedAttendance,
      );
      for (const seg of segments) {
        outsideItems.push(
          makeDraftItem(`outside:draft:${seg.startMs}`, rawDraft, seg.startMs, seg.endMs),
        );
      }
    }
  }

  const blocks: DayContextBlock[] = [...attendanceBlocks];
  if (outsideItems.length) {
    sortItems(outsideItems);
    const startMs = Math.min(...outsideItems.map((item) => item.startMs));
    const endMs = Math.max(...outsideItems.map((item) => item.endMs));
    const open = outsideItems.some((item) => Boolean(item.open) && item.endMs === endMs);
    const seconds = outsideItems.reduce((sum, item) => sum + item.seconds, 0);
    const durationLabel = formatReadableDuration(seconds);
    const start = formatTimeShort(startMs, context.zone);
    const end = open ? null : formatTimeShort(endMs, context.zone);

    blocks.push({
      id: 'outside',
      kind: 'outside',
      startMs,
      endMs,
      start,
      end,
      open,
      seconds,
      durationLabel,
      items: outsideItems,
      ariaLabel:
        open && seconds < MIN_GAP_SECONDS
          ? 'Fuera de fichaje'
          : `Fuera de fichaje, ${durationLabel}`,
    });
  }

  const mergedEntries = mergeSpans(rawEntries);
  const unimputedSeconds = subtractSpans(mergedAttendance, mergedEntries).reduce(
    (sum, gap) => sum + (gap.endMs - gap.startMs) / 1000,
    0,
  );

  return {
    blocks,
    pauses,
    attendanceSeconds: context.attendanceSeconds,
    entrySeconds: context.entrySeconds,
    unimputedSeconds,
  };
}
