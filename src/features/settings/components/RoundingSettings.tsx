import { Panel, Badge } from '../../../shared/ui/Panel';
import { RoundingPreview } from '../../time-entries/components/RoundingPreview';

const choices = [
  { value: 0, title: 'Exacto', detail: 'Sin redondeo' },
  { value: 5, title: '5 min', detail: 'R05 · Fino' },
  { value: 10, title: '10 min', detail: 'R10 · Intermedio' },
  { value: 15, title: '15 min', detail: 'R15 · Cuartos de hora' },
  { value: 30, title: '30 min', detail: 'R30 · Medias horas' },
  { value: 60, title: '60 min', detail: 'R60 · Horas completas' },
] as const;

export function RoundingSettings({
  interval,
  onChange,
  disabled,
}: {
  interval: number;
  onChange: (interval: number) => void;
  disabled: boolean;
}) {
  return (
    <Panel
      id="redondeo"
      title="Redondeo del Tiempo Total"
      icon="settings"
      action={
        <Badge tone="accent">
          {interval === 0 ? 'Tiempo exacto' : `R${String(interval).padStart(2, '0')}`}
        </Badge>
      }
    >
      <p className="muted section-intro">
        Solo se redondea hacia arriba la duración total de cada parte; inicio y fin son exactos.
      </p>
      <fieldset className="choice-fieldset" disabled={disabled}>
        <legend>Intervalo de imputación</legend>
        <div className="choice-grid choice-grid--six">
          {choices.map((option) => (
            <label
              className={`choice-card ${interval === option.value ? 'choice-card--selected' : ''}`}
              key={option.value}
            >
              <input
                type="radio"
                name="rounding-interval"
                value={option.value}
                checked={interval === option.value}
                onChange={() => onChange(option.value)}
              />
              <strong>{option.title}</strong>
              <span className="muted">{option.detail}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <details className="settings-help">
        <summary>Ver un ejemplo y cómo afecta a los partes</summary>
        <RoundingPreview interval={String(interval)} />
        <p className="field__hint">
          El intervalo se guarda en cada parte al crearlo: cambiarlo solo afecta a los nuevos
          registros.
        </p>
      </details>
    </Panel>
  );
}
