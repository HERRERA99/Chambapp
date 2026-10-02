export function formatImputedPercent(percent: number | null) {
  return percent === null
    ? 'Sin fichajes'
    : `${new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(percent)}%`;
}

/** Display actual attendance at second/millisecond precision, without a work-time rounding rule. */
export function formatAttendanceDuration(seconds: number) {
  if (!Number.isFinite(seconds)) return '—';
  const rawMilliseconds = Math.max(0, seconds) * 1000;
  // Avoid losing a millisecond to floating-point noise when adding exact interval durations.
  const milliseconds = Math.floor(
    rawMilliseconds + Number.EPSILON * Math.max(1, rawMilliseconds) * 2,
  );
  const wholeSeconds = Math.floor(milliseconds / 1000);
  const clock = `${String(Math.floor(wholeSeconds / 3600)).padStart(2, '0')}:${String(Math.floor((wholeSeconds % 3600) / 60)).padStart(2, '0')}:${String(wholeSeconds % 60).padStart(2, '0')}`;
  const fraction = milliseconds % 1000;
  return fraction ? `${clock}.${String(fraction).padStart(3, '0')}` : clock;
}
