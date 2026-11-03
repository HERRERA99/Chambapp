export function paginate<T>(list: readonly T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(list.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: list.slice((current - 1) * size, current * size), page: current, pages };
}
