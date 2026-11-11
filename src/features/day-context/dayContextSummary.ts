import { DateTime } from 'luxon';
import type { WorkspaceData } from '../../domain/models';
import { dayContext } from '../../domain/dayContext';
import { formatDuration } from '../../domain/time';

/**
 * "Entrada 08:02 · 3 partes (5h 10m)": what the user clocked and recorded on `date`,
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
        ? `${context.entries.length} ${context.entries.length === 1 ? 'parte' : 'partes'} (${formatDuration(context.entrySeconds)})`
        : 'sin partes',
    ];
    return parts.join(' · ');
  } catch {
    return null;
  }
}
