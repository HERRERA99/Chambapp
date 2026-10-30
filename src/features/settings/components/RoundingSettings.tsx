import { RoundingPreview } from '../../time-entries/components/RoundingPreview';
import { SettingRow, SettingsSection } from './SettingRow';

const choices = [
  { value: 0, title: 'Exacto', detail: 'Sin redondeo' },
  { value: 5, title: '5 min', detail: 'Granularidad fina' },
  { value: 10, title: '10 min', detail: 'Intermedio' },
  { value: 15, title: '15 min', detail: 'Cuartos de hora' },
  { value: 30, title: '30 min', detail: 'Medias horas' },
  { value: 60, title: '60 min', detail: 'Horas completas' },
] as const;

export function RoundingSettings({
  interval,
  baseline,
  onChange,
  disabled,
  hidden,
}: {
  interval: number;
  baseline: number;
  onChange: (interval: number) => void;
  disabled: boolean;
  hidden: boolean;
}) {
  return (
    <SettingsSection
      id="redondeo"
      title="Redondeo"
      description="Inicio y fin se guardan siempre con su hora exacta. Solo la duración imputada de cada parte se redondea hacia arriba."
      hidden={hidden}
    >
      <SettingRow
        label="Intervalo de imputación"
        description="Se guarda en cada parte al crearlo. Cambiarlo no modifica las duraciones ya registradas."
        modified={interval !== baseline}
        stacked
      >
        <fieldset className="choice-fieldset" disabled={disabled}>
          <legend className="sr-only">Intervalo de imputación</legend>
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
      </SettingRow>
      <RoundingPreview interval={String(interval)} compact />
    </SettingsSection>
  );
}
