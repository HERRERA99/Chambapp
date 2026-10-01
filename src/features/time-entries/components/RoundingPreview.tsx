import { Icon } from '../../../shared/ui/Icon';
import { Badge, Notice } from '../../../shared/ui/Panel';
import { formatDuration, roundDuration } from '../../../domain/time';

export function RoundingPreview({
  interval = '15',
  compact = false,
}: {
  interval?: string;
  compact?: boolean;
}) {
  const realSeconds = (4 * 60 + 8) * 60;
  const logged = roundDuration(realSeconds, Number(interval));
  return (
    <div className={`rounding-preview ${compact ? 'rounding-preview--compact' : ''}`}>
      <div className="rounding-preview__heading">
        <span className="eyebrow">Ejemplo de duración total</span>
        <Badge tone="accent">
          {interval === '0' ? 'Sin redondeo' : `R${interval.padStart(2, '0')}`}
        </Badge>
      </div>
      <div className="rounding-flow">
        <div>
          <span className="eyebrow">Inicio y fin exactos</span>
          <strong className="mono">
            09:07:14 <span className="dim">→</span> 13:15:14
          </strong>
          <span className="muted">Tiempo real: {formatDuration(realSeconds)}</span>
        </div>
        <Icon name="arrow" />
        <div className="rounding-flow__result">
          <span className="eyebrow">Duración imputada</span>
          <strong className="mono">{formatDuration(logged)}</strong>
          <span className="accent">Diferencia: +{Math.round((logged - realSeconds) / 60)} min</span>
        </div>
      </div>
      {compact ? null : (
        <Notice title="Las horas de inicio y fin siempre se conservan" icon="lock">
          Solo se redondea hacia arriba la duración total del parte. Cada parte conserva el
          intervalo que tenía configurado al crearse.
        </Notice>
      )}
    </div>
  );
}
