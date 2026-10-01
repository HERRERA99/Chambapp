import { Panel, Badge, Notice } from '../../../shared/ui/Panel';
import { RoundingPreview } from '../../time-entries/components/RoundingPreview';

const choices = [
  { value: 0, title: 'Tiempo exacto', detail: 'Sin redondeo' },
  { value: 5, title: '5 minutos (R05)', detail: 'Granularidad fina' },
  { value: 10, title: '10 minutos (R10)', detail: 'Balance intermedio' },
  { value: 15, title: '15 minutos (R15)', detail: 'Cuartos de hora' },
  { value: 30, title: '30 minutos (R30)', detail: 'Medias horas' },
  { value: 60, title: '60 minutos (R60)', detail: 'Horas completas' },
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
        Inicio y fin se registran con su hora exacta. Solo la duración total se redondea hacia
        arriba al siguiente bloque.
      </p>
      <fieldset className="choice-fieldset" disabled={disabled}>
        <legend>Intervalo de imputación</legend>
        <div className="choice-grid choice-grid--three">
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
      <RoundingPreview interval={String(interval)} />
      <Notice title="El histórico conserva su regla" icon="shield">
        El intervalo se guarda en cada parte al crearlo. Cambiar la preferencia afecta a los nuevos
        registros y conserva las duraciones históricas.
      </Notice>
    </Panel>
  );
}
