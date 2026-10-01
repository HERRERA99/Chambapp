import { Panel, Badge, Notice } from '../../../shared/ui/Panel';
import { InputField } from '../../../shared/ui/FormField';
import { formatDate, formatDuration } from '../../../domain/time';
import type { WorkspaceData } from '../../../domain/models';
import { presetMinutes, weekdays } from '../settingsDraft';
import type { ScheduleDraft } from '../settingsDraft';

type Props = {
  value: ScheduleDraft;
  onChange: (value: ScheduleDraft) => void;
  minimumDate: string;
  dirty: boolean;
  disabled: boolean;
  data: WorkspaceData;
};

export function WorkdaySettings({ value, onChange, minimumDate, dirty, disabled, data }: Props) {
  const totalMinutes = value.minutes.reduce((total, minutes) => total + minutes, 0);
  const choices = [
    { value: '37.5', title: '37,5 Horas', detail: 'Viernes intensivo' },
    { value: '40', title: '40 Horas', detail: '5 × 8h' },
    { value: '35', title: '35 Horas', detail: '5 × 7h' },
    { value: 'manual', title: 'Personalizada', detail: 'Reparto día a día' },
  ];
  const upcoming = data.configurations
    .filter((configuration) => configuration.vigente_desde >= minimumDate)
    .sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde));
  return (
    <Panel
      id="jornada"
      title="Jornada Base y Reparto Semanal"
      icon="calendar"
      action={
        <Badge tone={dirty ? 'warning' : 'neutral'}>
          {dirty ? 'Cambio pendiente' : 'Reparto semanal'}
        </Badge>
      }
    >
      <p className="muted section-intro">
        Programa un nuevo reparto a partir de un lunes. Las jornadas ya creadas conservan su
        objetivo.
      </p>
      <fieldset className="choice-fieldset" disabled={disabled}>
        <legend>Convenio / Modalidad base</legend>
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
      <div className="form-grid form-grid--three">
        {weekdays.map((day, index) => (
          <InputField
            key={day}
            label={`${day} · minutos`}
            type="number"
            min={0}
            max={1440}
            step={1}
            value={value.minutes[index] ?? 0}
            hint={formatDuration((value.minutes[index] ?? 0) * 60)}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...value,
                mode: 'manual',
                minutes: value.minutes.map((minutes, dayIndex) =>
                  dayIndex === index ? Number(event.target.value) : minutes,
                ),
              })
            }
          />
        ))}
      </div>
      <div className="schedule-total">
        <span className="eyebrow">Total semanal</span>
        <strong className="mono accent">{formatDuration(totalMinutes * 60)}</strong>
        <span className="field__hint">Los días con 0 horas se consideran no laborables.</span>
      </div>
      <InputField
        label="Lunes de entrada en vigor"
        type="date"
        value={value.effectiveDate}
        min={minimumDate}
        disabled={disabled}
        onChange={(event) => onChange({ ...value, effectiveDate: event.target.value })}
        required
        hint="Selecciona un lunes disponible. El nuevo reparto se aplicará a las jornadas que se creen desde esa fecha."
      />
      {upcoming.length ? (
        <Notice title="Jornadas futuras ya programadas">
          {upcoming.map((configuration) => (
            <p key={configuration.id}>
              {formatDate(configuration.vigente_desde)} ·{' '}
              {formatDuration(configuration.minutos_semanales * 60)} por semana.
            </p>
          ))}
        </Notice>
      ) : null}
      {!data.configurations.length ? (
        <Notice title="Sin jornada configurada">
          Define tu reparto para poder crear semanas de trabajo.
        </Notice>
      ) : null}
    </Panel>
  );
}
