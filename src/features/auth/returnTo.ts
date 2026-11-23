import { paths } from '../../app/paths.ts';
import { weekRedirects } from '../../app/navigation.ts';

const protectedPaths: readonly string[] = [
  paths.dashboard,
  paths.projects,
  paths.tasks,
  paths.notes,
  paths.passwords,
  paths.calendar,
  paths.records,
  paths.entries,
  paths.attendance,
  paths.weekOverview,
  paths.tools,
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
    const pathname = weekRedirects.find(({ from }) => from === url.pathname)?.to ?? url.pathname;
    return url.origin === origin && protectedPaths.includes(pathname)
      ? `${pathname}${url.search}${url.hash}`
      : paths.dashboard;
  } catch {
    return paths.dashboard;
  }
}
