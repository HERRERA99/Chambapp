import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { Button } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { formatMinutes } from './calculators.model';

export function DurationFields({
  hours,
  minutes,
  onHoursChange,
  onMinutesChange,
  legend,
  invalid = false,
}: {
  hours: string;
  minutes: string;
  onHoursChange: (value: string) => void;
  onMinutesChange: (value: string) => void;
  legend: string;
  invalid?: boolean;
}) {
  return (
    <fieldset className="calculator-duration-fields">
      <legend className="sr-only">{legend}</legend>
      <InputField
        label="Horas"
        type="number"
        inputMode="numeric"
        min={0}
        max={9999}
        step={1}
        value={hours}
        aria-invalid={invalid}
        onChange={(event) => onHoursChange(event.target.value)}
      />
      <span className="calculator-duration-fields__separator" aria-hidden="true">
        :
      </span>
      <InputField
        label="Minutos"
        type="number"
        inputMode="numeric"
        min={0}
        max={59}
        step={1}
        value={minutes}
        aria-invalid={invalid}
        onChange={(event) => onMinutesChange(event.target.value)}
      />
    </fieldset>
  );
}

export function DurationValue({ minutes }: { minutes: number | null }) {
  return (
    <span className="calculator-value">
      <span className="sr-only">{minutes === null ? 'Sin resultado' : formatMinutes(minutes)}</span>
      {minutes === null ? (
        <span aria-hidden="true">—</span>
      ) : (
        <span aria-hidden="true">
          <span className="calculator-value__part">
            {Math.floor(minutes / 60)}
            <small>h</small>
          </span>
          <span className="calculator-value__part">
            {String(minutes % 60).padStart(2, '0')}
            <small>min</small>
          </span>
        </span>
      )}
    </span>
  );
}

export function CopyResult({ value }: { value: string | null }) {
  const notify = useFeedback();
  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      notify('Resultado copiado.');
    } catch {
      notify('No se pudo copiar. Puedes seleccionar el resultado y copiarlo.');
    }
  }
  return (
    <Button variant="ghost" icon="copy" disabled={value === null} onClick={() => void copy()}>
      Copiar resultado
    </Button>
  );
}
