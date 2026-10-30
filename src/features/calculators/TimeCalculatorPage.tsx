import { useState } from 'react';
import { paths } from '../../app/paths';
import { ButtonLink } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { Icon } from '../../shared/ui/Icon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Badge } from '../../shared/ui/Panel';
import { CopyResult, DurationFields, DurationValue } from './CalculatorControls';
import {
  elapsedMinutes,
  formatMinutes,
  parseDurationMinutes,
  subtractTime,
} from './calculators.model';
import './calculators.css';

function dayLabel(offset: number) {
  if (offset === 0) return 'El mismo día';
  if (offset === -1) return 'El día anterior';
  return `${Math.abs(offset)} días antes`;
}

export default function TimeCalculatorPage() {
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('17:30');
  const [nextDay, setNextDay] = useState(false);
  const [baseTime, setBaseTime] = useState('17:30');
  const [hours, setHours] = useState('1');
  const [minutes, setMinutes] = useState('45');
  const automaticNextDay = !!start && !!end && end < start;
  const elapsed = elapsedMinutes(start, end, nextDay);
  const duration = parseDurationMinutes(hours, minutes);
  const subtraction = duration === null ? null : subtractTime(baseTime, duration);

  return (
    <div className="page-stack calculator-page">
      <PageHeader
        eyebrow="Herramientas"
        title="Calculadora de horas"
        description="Calcula cuánto ha pasado entre dos horas o retrocede desde una hora concreta."
        actions={
          <ButtonLink to={paths.percentages} icon="percent">
            Calcular porcentajes
          </ButtonLink>
        }
      />
      <div className="calculator-caption">
        <span>
          <Icon name="zap" size={15} /> Resultados al instante
        </span>
        <span className="mono">DOS FORMAS DE HACER TUS CUENTAS</span>
      </div>

      <div className="time-calculators">
        <section className="panel time-calculator" aria-labelledby="elapsed-title">
          <div className="time-calculator__heading">
            <span className="calculator-tool-icon">
              <Icon name="timer" size={23} />
            </span>
            <span className="eyebrow">01 / Entre dos horas</span>
          </div>
          <div>
            <h2 id="elapsed-title">¿Cuánto tiempo ha pasado?</h2>
            <p className="calculator-description">De una hora a otra, en horas y minutos.</p>
          </div>

          <div className="time-calculator__fields">
            <InputField
              label="Hora de inicio"
              type="time"
              value={start}
              required
              aria-invalid={!start}
              onChange={(event) => setStart(event.target.value)}
            />
            <span className="time-calculator__operator" aria-hidden="true">
              <Icon name="arrow" />
            </span>
            <InputField
              label="Hora de fin"
              type="time"
              value={end}
              required
              aria-invalid={!end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </div>
          <div className="time-calculator__day-choice">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={automaticNextDay || nextDay}
                disabled={automaticNextDay}
                onChange={(event) => setNextDay(event.target.checked)}
              />
              La hora de fin es del día siguiente
            </label>
            <p className="calculator-description">
              {automaticNextDay
                ? 'La hora de fin es anterior al inicio: contamos hasta mañana.'
                : 'Actívalo si el intervalo termina mañana, incluso a la misma hora.'}
            </p>
          </div>
          {elapsed === null ? (
            <p className="calculator-error" role="status">
              Completa las dos horas para calcular el intervalo.
            </p>
          ) : null}

          <div className="time-calculator__result">
            <div className="split-label">
              <p className="eyebrow">Tiempo transcurrido</p>
              <Badge>{automaticNextDay || nextDay ? 'Hasta el día siguiente' : 'Mismo día'}</Badge>
            </div>
            <div aria-live="polite" aria-atomic="true">
              <DurationValue minutes={elapsed} />
            </div>
            <div className="calculator-timeline" aria-hidden="true">
              <span>{start || '--:--'}</span>
              <span className="calculator-timeline__line" />
              <Icon name="arrow" size={14} />
              <span>
                {end || '--:--'}
                {automaticNextDay || nextDay ? ' (+1 día)' : ''}
              </span>
            </div>
            <CopyResult value={elapsed === null ? null : formatMinutes(elapsed)} />
          </div>
        </section>

        <section className="panel time-calculator" aria-labelledby="subtract-title">
          <div className="time-calculator__heading">
            <span className="calculator-tool-icon">
              <Icon name="minus" size={23} />
            </span>
            <span className="eyebrow">02 / Restar una duración</span>
          </div>
          <div>
            <h2 id="subtract-title">Un poco antes de esa hora.</h2>
            <p className="calculator-description">
              Elige una hora y réstale el tiempo que necesites.
            </p>
          </div>

          <InputField
            className="time-calculator__base-time"
            label="Hora de referencia"
            type="time"
            value={baseTime}
            required
            aria-invalid={!baseTime}
            onChange={(event) => setBaseTime(event.target.value)}
          />
          <div className="time-calculator__subtract-duration">
            <span className="time-calculator__operator" aria-hidden="true">
              <Icon name="minus" />
            </span>
            <DurationFields
              legend="Duración que quieres restar"
              hours={hours}
              minutes={minutes}
              onHoursChange={setHours}
              onMinutesChange={setMinutes}
              invalid={duration === null}
            />
          </div>
          {duration === null || !baseTime ? (
            <p className="calculator-error" role="status">
              Completa la hora, las horas enteras (0–9999) y los minutos (0–59).
            </p>
          ) : null}

          <div className="time-calculator__result time-calculator__result--accent">
            <div className="split-label">
              <p className="eyebrow">La hora resultante</p>
              <Badge tone={subtraction && subtraction.dayOffset < 0 ? 'warning' : 'neutral'}>
                {subtraction ? dayLabel(subtraction.dayOffset) : '—'}
              </Badge>
            </div>
            <div aria-live="polite" aria-atomic="true">
              <span className="calculator-clock-result">{subtraction?.time ?? '—'}</span>
              <span className="sr-only">
                {subtraction ? dayLabel(subtraction.dayOffset) : 'Sin resultado'}
              </span>
            </div>
            <p className="calculator-equation mono">
              {baseTime || '--:--'} <span>−</span>{' '}
              {duration === null ? '—' : formatMinutes(duration)} <span>=</span>{' '}
              {subtraction?.time ?? '—'}
            </p>
            <CopyResult
              value={
                subtraction
                  ? `${subtraction.time} · ${dayLabel(subtraction.dayOffset).toLowerCase()}`
                  : null
              }
            />
          </div>
        </section>
      </div>

      <div className="calculator-tips">
        <div>
          <Icon name="calendar" size={18} />
          <div>
            <strong>También después de medianoche</strong>
            <p>Si la hora final es anterior a la inicial, el cálculo continúa al día siguiente.</p>
          </div>
        </div>
        <div>
          <Icon name="clock" size={18} />
          <div>
            <strong>Resta tanto tiempo como necesites</strong>
            <p>También admite más de 24 horas y te indica cuántos días has retrocedido.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
