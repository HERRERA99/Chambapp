import { DateTime } from 'luxon';
import type { WorkspaceData } from '../../domain/models';
import { dayContext } from '../../domain/dayContext';
import { formatReadableDuration } from '../week/components/dayTimeline.model';

/**
 * "Entrada 08:02 · 3 partes (5 h 10 min)": what the user clocked and recorded on `date`,
 * for the toggle while the panel is closed. null for an invalid date.
 */
export function dayContextSummary(
  data: WorkspaceData,
  date: string,
  zone: string,
  excludeEntryId?: string | null,
): string | null {
  const now = DateTime.fromISO(data.serverTime)
    .plus({ milliseconds: Date.now() - data.receivedAt })
    .toISO()!;
  try {
    if (!DateTime.fromISO(date, { zone }).isValid) return null;
    const context = dayContext(data, date, zone, { excludeEntryId, now });
    const parts = [
      context.firstIn ? `Entrada ${context.firstIn}` : 'Sin fichajes',
      context.entries.length
        ? `${context.entries.length} ${context.entries.length === 1 ? 'parte' : 'partes'} (${formatReadableDuration(context.entrySeconds)})`
        : 'sin partes',
    ];
    return parts.join(' · ');
  } catch {
    return null;
  }
}
