import { paths } from '../../app/paths.ts';

const protectedPaths: readonly string[] = [
  paths.dashboard,
  paths.projects,
  paths.tasks,
  paths.board,
  paths.notes,
  paths.calendar,
  paths.entries,
  paths.attendance,
  paths.week,
  paths.percentages,
  paths.timeCalculator,
  paths.fakeData,
  paths.settings,
  paths.onboarding,
];

/** Only allow known local workspace routes as authentication destinations. */
export function safeReturnTo(
  value: string | null | undefined,
  origin = window.location.origin,
): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return paths.dashboard;
  try {
    const url = new URL(value, origin);
    return url.origin === origin && protectedPaths.includes(url.pathname)
      ? `${url.pathname}${url.search}${url.hash}`
      : paths.dashboard;
  } catch {
    return paths.dashboard;
  }
}
