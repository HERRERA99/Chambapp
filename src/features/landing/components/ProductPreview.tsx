import { Badge, Progress } from '../../../shared/ui/Panel';
import { Icon } from '../../../shared/ui/Icon';

export function ProductPreview() {
  return (
    <div className="product-preview">
      <div className="product-preview__bar">
        <div className="window-dots">
          <i />
          <i />
          <i />
        </div>
        <span className="mono">app.chambapp.com/resumen</span>
        <span className="status-dot" />
      </div>
      <div className="product-preview__body">
        <div className="product-preview__timer">
          <div className="split-label">
            <Badge tone="accent">
              <span className="status-dot" />
              En curso · Ejemplo
            </Badge>
            <span className="mono dim">Sesión #4</span>
          </div>
          <p className="eyebrow">Proyecto Mercury / Refactor API</p>
          <h2>Integración de pasarela de pago Stripe & Telemetría</h2>
          <p className="preview-digits mono">
            02<span>:</span>18<span>:</span>47
          </p>
          <div className="preview-controls">
            <span>
              <Icon name="stop" />
              Detener y guardar parte
            </span>
            <span>
              <Icon name="pause" />
              Pausar tramo
            </span>
          </div>
        </div>
        <div className="product-preview__progress">
          <div className="split-label">
            <strong>Progreso diario</strong>
            <Badge tone="accent">+35 min saldo</Badge>
          </div>
          <p className="mono">
            6h 45m <span className="dim">/ 7h 30m obj.</span>
          </p>
          <Progress value={90} label="Progreso ilustrativo de jornada" />
          <div className="split-label muted">
            <span>Real: 6h 18m</span>
            <span>Imputado: 6h 45m</span>
          </div>
          <p className="mono dim">Regla activa: Redondeo 15 min</p>
        </div>
      </div>
    </div>
  );
}
