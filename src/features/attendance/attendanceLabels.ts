export function formatImputedPercent(percent: number | null) {
  return percent === null
    ? 'Sin fichajes'
    : `${new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(percent)}%`;
}
