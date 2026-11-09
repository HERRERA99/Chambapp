import { Panel, Badge, Notice } from '../../../shared/ui/Panel';
import { InputField } from '../../../shared/ui/FormField';
import { formatDate, formatDuration } from '../../../domain/time';
import type { WorkspaceData } from '../../../domain/models';
import {
  distributeWeekly,
  presetMinutes,
  splitHours,
  weekdays,
  workedDays,
} from '../settingsDraft';
import type { ScheduleDraft } from '../settingsDraft';

type Props = {
  value: ScheduleDraft;
  onChange: (value: ScheduleDraft) => void;
  minimumDate: string;
  dirty: boolean;
  disabled: boolean;
  data: WorkspaceData;
};

const DAY_MAX = 24 * 60;

/** A duration typed as hours and minutes; the value is in minutes. */
function HoursMinutesField({
  label,
  value,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  disabled: boolean;
  onChange: (minutes: number) => void;
}) {
  const { hours, minutes } = splitHours(value);
  const clamp = (next: number) => Math.min(max, Math.max(0, next));
  const read = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return (
    <fieldset className="hours-minutes" disabled={disabled}>
      <legend>{label}</legend>
      <div className="hours-minutes__inputs">
        <label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={Math.floor(max / 60)}
            step={1}
            value={hours}
            aria-label={`${label}, horas`}
            onChange={(event) => onChange(clamp(read(event.target.value) * 60 + minutes))}
          />
          <span className="dim">h</span>
        </label>
        <label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={59}
            step={1}
            value={minutes}
            aria-label={`${label}, minutos`}
            onChange={(event) =>
              onChange(clamp(hours * 60 + Math.min(59, Math.max(0, read(event.target.value)))))
            }
          />
          <span className="dim">min</span>
        </label>
      </div>
    </fieldset>
  );
}

export function WorkdaySettings({ value, onChange, minimumDate, dirty, disabled, data }: Props) {
  const totalMinutes = value.minutes.reduce((total, minutes) => total + minutes, 0);
  const days = workedDays(value.minutes);
  const choices = [
    { value: '37.5', title: '37,5 Horas', detail: 'Viernes intensivo' },
    { value: '40', title: '40 Horas', detail: '5 × 8h' },
    { value: '35', title: '35 Horas', detail: '5 × 7h' },
    { value: 'semanal', title: 'Horas semanales', detail: 'Reparto igual entre los días' },
    { value: 'manual', title: 'Día a día', detail: 'Horas de cada día' },
  ];
  const upcoming = data.configurations
    .filter((configuration) => configuration.vigente_desde >= minimumDate)
    .sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde));

  function chooseMode(mode: string) {
    const preset = presetMinutes(mode);
    if (preset) return onChange({ ...value, mode, minutes: preset });
    if (mode === 'semanal')
      return onChange({ ...value, mode, minutes: distributeWeekly(totalMinutes, days) });
    onChange({ ...value, mode });
  }

  function toggleDay(index: number) {
    const next = days.includes(index) ? days.filter((day) => day !== index) : [...days, index];
    if (!next.length) return;
    onChange({ ...value, mode: 'semanal', minutes: distributeWeekly(totalMinutes, next) });
  }

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
        Elige un modelo, indica tus horas semanales para repartirlas por igual o define las horas de
        cada día. Se aplica desde el lunes que indiques.
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
                onChange={() => chooseMode(option.value)}
              />
              <strong>{option.title}</strong>
              <span className="muted">{option.detail}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {value.mode === 'semanal' ? (
        <div className="weekly-split">
          <HoursMinutesField
            label="Horas semanales"
            value={totalMinutes}
            max={days.length * DAY_MAX}
            disabled={disabled}
            onChange={(minutes) =>
              onChange({ ...value, mode: 'semanal', minutes: distributeWeekly(minutes, days) })
            }
          />
          <fieldset className="weekday-toggles" disabled={disabled}>
            <legend>Días que trabajas</legend>
            <div className="weekday-toggles__list">
              {weekdays.map((day, index) => (
                <label
                  key={day}
                  className={`weekday-toggle ${days.includes(index) ? 'weekday-toggle--on' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={days.includes(index)}
                    onChange={() => toggleDay(index)}
                  />
                  {day.slice(0, 3)}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="field__hint">
            Cada día:{' '}
            {days
              .map(
                (index) =>
                  `${weekdays[index]!.slice(0, 3)} ${formatDuration(value.minutes[index]! * 60)}`,
              )
              .join(' · ')}
          </p>
        </div>
      ) : (
        <div className="settings-days settings-days--hours">
          {weekdays.map((day, index) => (
            <HoursMinutesField
              key={day}
              label={day}
              value={value.minutes[index] ?? 0}
              max={DAY_MAX}
              disabled={disabled}
              onChange={(minutes) =>
                onChange({
                  ...value,
                  mode: 'manual',
                  minutes: value.minutes.map((current, dayIndex) =>
                    dayIndex === index ? minutes : current,
                  ),
                })
              }
            />
          ))}
        </div>
      )}
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
        hint="Las jornadas ya creadas conservan su objetivo."
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
