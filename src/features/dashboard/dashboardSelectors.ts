import type { WorkspaceData } from '../../domain/models';
import { mondayForDate } from '../../domain/time';
import { buildWeek } from '../week/week.model';

export function dashboardSummary(data: WorkspaceData, today: string) {
  const model = buildWeek(data, mondayForDate(today), today);
  const week = model.days.map((day) => ({
    date: day.date,
    targetSeconds: day.targetSeconds,
    real: day.realSeconds,
    logged: day.loggedSeconds,
    count: day.blocks.filter((block) => !!block.entry.fin_en).length,
  }));
  return {
    week,
    day: week.find((day) => day.date === today)!,
    missingDays: model.missingDays,
    total: {
      logged: model.loggedSeconds,
      real: model.realSeconds,
      target: model.targetSeconds,
      due: week.reduce((sum, day) => sum + (day.date <= today ? day.targetSeconds : 0), 0),
    },
  };
}
