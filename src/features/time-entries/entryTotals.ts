import type { TimeEntry } from '../../domain/models';

/** Finalized entries are authoritative; open timers are shown separately. */
export function entryTotals(entries: readonly TimeEntry[]) {
  return entries.reduce(
    (total, entry) => {
      if (!entry.eliminado_en && entry.fin_en) {
        total.real += entry.duracion_real_segundos ?? 0;
        total.logged += entry.duracion_imputada_segundos ?? 0;
        total.count += 1;
      }
      return total;
    },
    { real: 0, logged: 0, count: 0 },
  );
}

export function entryTotalsBy(entries: readonly TimeEntry[], field: 'tarea_id' | 'proyecto_id') {
  const totals = new Map<string, ReturnType<typeof entryTotals>>();
  for (const entry of entries) {
    if (entry.eliminado_en || !entry.fin_en) continue;
    const key = entry[field];
    const total = totals.get(key) ?? { real: 0, logged: 0, count: 0 };
    total.real += entry.duracion_real_segundos ?? 0;
    total.logged += entry.duracion_imputada_segundos ?? 0;
    total.count += 1;
    totals.set(key, total);
  }
  return totals;
}
