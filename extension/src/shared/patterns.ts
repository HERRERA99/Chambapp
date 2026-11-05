/**
 * Match pattern for an origin, without its port: Firefox ignores patterns that
 * name a port, and without one Chrome matches every port. Callers still compare
 * the exact origin wherever it matters.
 */
export function originPattern(origin: string) {
  const url = new URL(origin);
  return `${url.protocol}//${url.hostname}/*`;
}
