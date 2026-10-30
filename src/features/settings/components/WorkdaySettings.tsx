import { useId } from 'react';
import { Badge, Notice } from '../../../shared/ui/Panel';
import { formatDate, formatDuration } from '../../../domain/time';
import type { WorkspaceData } from '../../../domain/models';
import { presetMinutes, weekdays } from '../settingsDraft';
import type { ScheduleDraft } from '../settingsDraft';
import { SettingRow, SettingsSection } from './SettingRow';

type Props = {
  value: ScheduleDraft;
  baseline: ScheduleDraft;
  onChange: (value: ScheduleDraft) => void;
  minimumDate: string;
  dirty: boolean;
  disabled: boolean;
  hidden: boolean;
  data: WorkspaceData;
};

const choices = [
  { value: '37.5', title: '37,5 h', detail: 'Viernes intensivo' },
  { value: '40', title: '40 h', detail: '5 × 8 h' },
  { value: '35', title: '35 h', detail: '5 × 7 h' },
  { value: 'manual', title: 'Personalizada', detail: 'Reparto día a día' },
];

export function WorkdaySettings({
  value,
  baseline,
  onChange,
  minimumDate,
  dirty,
  disabled,
  hidden,
  data,
}: Props) {
  const id = useId();
  const totalMinutes = value.minutes.reduce((total, minutes) => total + minutes, 0);
  const upcoming = data.configurations
    .filter((configuration) => configuration.vigente_desde >= minimumDate)
    .sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde));
  const minutesChanged = value.minutes.some(
    (minutes, index) => minutes !== baseline.minutes[index],
  );
  return (
    <SettingsSection
      id="jornada"
      title="Jornada laboral"
      description="Programa un nuevo reparto semanal a partir de un lunes. Las jornadas ya creadas conservan su objetivo y su histórico."
      hidden={hidden}
      badge={dirty ? <Badge tone="warning">Nuevo reparto sin guardar</Badge> : null}
    >
      {!data.configurations.length ? (
        <Notice title="Todavía no tienes jornada configurada" tone="warning">
          Define tu reparto para poder crear semanas de trabajo.
        </Notice>
      ) : null}
      <SettingRow
        label="Modalidad"
        description="Elige una plantilla o ajusta cada día."
        modified={value.mode !== baseline.mode}
        stacked
      >
        <fieldset className="choice-fieldset" disabled={disabled}>
          <legend className="sr-only">Modalidad de jornada</legend>
          <div className="choice-grid">
            {choices.map((option) => (
              <label
                className={`choice-card ${value.mode === option.value ? 'choice-card--selected' : ''}`}
                key={option.value}
              >
                <input
                  type="radio"
                  name="workday-mode"
                  checked={value.mode === option.value}
                  onChange={() =>
                    onChange({
                      ...value,
                      mode: option.value,
                      minutes: presetMinutes(option.value) ?? value.minutes,
                    })
                  }
                />
                <strong>{option.title}</strong>
                <span className="muted">{option.detail}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </SettingRow>
      <SettingRow
        label="Minutos por día"
        description="Un día con 0 minutos se considera no laborable."
        modified={minutesChanged}
        stacked
      >
        <div className="weekday-grid">
          {weekdays.map((day, index) => {
            const minutes = value.minutes[index] ?? 0;
            const invalid = !Number.isInteger(minutes) || minutes < 0 || minutes > 1440;
            return (
              <div
                className={`weekday-field ${minutes !== baseline.minutes[index] ? 'weekday-field--modified' : ''}`}
                key={day}
              >
                <label htmlFor={`${id}-${index}`}>{day}</label>
                <input
                  id={`${id}-${index}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={1440}
                  step={1}
                  value={minutes}
                  disabled={disabled}
                  aria-invalid={invalid ? true : undefined}
                  aria-describedby={`${id}-${index}-hint`}
                  onChange={(event) =>
                    onChange({
                      ...value,
                      mode: 'manual',
                      minutes: value.minutes.map((current, dayIndex) =>
                        dayIndex === index ? Number(event.target.value) : current,
                      ),
                    })
                  }
                />
                <span id={`${id}-${index}-hint`} className="field__hint">
                  {invalid ? 'Entre 0 y 1440' : minutes ? formatDuration(minutes * 60) : 'Libre'}
                </span>
              </div>
            );
          })}
        </div>
        <p className="weekday-total">
          Total semanal <strong className="mono">{formatDuration(totalMinutes * 60)}</strong>
        </p>
      </SettingRow>
      <SettingRow
        label="Entra en vigor el lunes"
        description="El nuevo reparto se aplica a las jornadas que se creen desde esa fecha."
        htmlFor={`${id}-date`}
        modified={value.effectiveDate !== baseline.effectiveDate}
      >
        <input
          id={`${id}-date`}
          type="date"
          value={value.effectiveDate}
          min={minimumDate}
          disabled={disabled}
          required
          onChange={(event) => onChange({ ...value, effectiveDate: event.target.value })}
        />
      </SettingRow>
      {upcoming.length ? (
        <Notice title="Repartos futuros ya programados">
          {upcoming.map((configuration) => (
            <p key={configuration.id}>
              {formatDate(configuration.vigente_desde)} ·{' '}
              {formatDuration(configuration.minutos_semanales * 60)} por semana
            </p>
          ))}
        </Notice>
      ) : null}
    </SettingsSection>
  );
}
