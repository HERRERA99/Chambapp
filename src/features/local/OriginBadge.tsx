import type { DataOrigin } from '../../domain/models';
import { Icon } from '../../shared/ui/Icon';

/** "Local" or "Nube" next to a project, task or entry. */
export function OriginBadge({ origin }: { origin: DataOrigin | undefined }) {
  const local = origin === 'local';
  return (
    <span
      className={`badge origin-badge ${local ? 'badge--warning' : 'badge--neutral'}`}
      title={local ? 'Guardado en este navegador' : 'Guardado en la nube'}
    >
      <Icon name={local ? 'hardDrive' : 'cloud'} size={12} />
      {local ? 'Local' : 'Nube'}
    </span>
  );
}
