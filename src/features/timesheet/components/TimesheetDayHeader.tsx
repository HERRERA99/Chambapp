import { DateTime } from 'luxon';
import { formatDuration } from '../../../domain/time';

/** Day column heading shared by the grouped table and the timeline, so both line up. */
export function TimesheetDayHeader({
  id,
  date,
  seconds,
  totalLabel,
}: {
  id: string;
  date: string;
  seconds: number;
  totalLabel: string;
}) {
  const day = DateTime.fromISO(date, { zone: 'UTC' }).setLocale('es');
  return (
    <header className="timesheet__day-header">
      <h3 id={id}>
        <span className="timesheet__weekday">{day.toFormat('ccc')}</span>{' '}
        <strong>{day.toFormat('d')}</strong>
        <span className="sr-only">{day.toFormat(' LLLL')}</span>
      </h3>
      <span className="mono dim" aria-label={totalLabel} title={totalLabel}>
        {seconds ? formatDuration(seconds) : ''}
      </span>
    </header>
  );
}
