import { useMemo, useState } from 'react';
import { paths } from '../../app/paths';
import { ButtonLink } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { Icon } from '../../shared/ui/Icon';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Badge } from '../../shared/ui/Panel';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { useAttendance } from '../attendance/useAttendance';
import { useWorkspace } from '../workspace/useWorkspace';
import { CopyResult, DurationFields, DurationValue } from './CalculatorControls';
import {
  formatMinutes,
  parseDurationMinutes,
  parsePercentage,
  percentageMinutes,
  todayWorkedSeconds,
} from './calculators.model';
import './calculators.css';

const sources = [
  { value: 'manual', label: 'Introducir tiempo' },
  { value: 'today', label: 'Mi jornada de hoy' },
] as const;

export default function PercentagesPage() {
  const { data, isLoading } = useWorkspace();
  const attendance = useAttendance();
  const [source, setSource] = useState<'manual' | 'today'>('manual');
  const [hours, setHours] = useState('8');
  const [minutes, setMinutes] = useState('0');
  const [percentage, setPercentage] = useState('85');
  const manualMinutes = parseDurationMinutes(hours, minutes);
  const customPercentage = parsePercentage(percentage);
  const todaySeconds = useMemo(
    () =>
      data ? todayWorkedSeconds(data.fichajes, data.profile.zona_horaria, attendance.now) : null,
    [data, attendance.now],
  );
  const baseSeconds =
    source === 'today' ? todaySeconds : manualMinutes === null ? null : manualMinutes * 60;
  const customMinutes =
    baseSeconds !== null && customPercentage !== null
      ? percentageMinutes(baseSeconds, customPercentage)
      : null;
  const hasActiveToday = attendance.active !== null && (todaySeconds ?? 0) > 0;

  return (
    <div className="page-stack calculator-page">
      <PageHeader
        eyebrow="Herramientas / Porcentajes"
        title="Cada porcentaje, a su tiempo."
        description="Convierte un porcentaje de tu jornada en horas y minutos. Sin hacer cuentas."
        actions={
          <ButtonLink to={paths.timeCalculator} icon="calculator">
            Calculadora de horas
          </ButtonLink>
        }
      />

      <div className="calculator-caption">
        <span>
          <Icon name="zap" size={15} /> Resultados al instante
        </span>
        <span className="mono">HORAS + MINUTOS → PORCENTAJE</span>
      </div>

      <section className="percentage-workbench panel" aria-label="Calculadora de porcentajes">
        <div className="percentage-base">
          <div className="calculator-section-heading">
            <span className="calculator-step">01</span>
            <div>
              <p className="eyebrow">El punto de partida</p>
              <h2>Tu tiempo base</h2>
            </div>
          </div>
          <p className="calculator-description">Elige cuánto tiempo quieres tomar como el 100 %.</p>
          <SegmentedControl
            label="Origen del tiempo base"
            options={sources}
            value={source}
            onChange={setSource}
          />

          <div className="percentage-base__input">
            {source === 'manual' ? (
              <>
                <DurationFields
                  legend="Tiempo base"
                  hours={hours}
                  minutes={minutes}
                  onHoursChange={setHours}
                  onMinutesChange={setMinutes}
                  invalid={manualMinutes === null}
                />
                {manualMinutes === null ? (
                  <p className="calculator-error" role="status">
                    Introduce horas enteras entre 0 y 9999 y minutos entre 0 y 59.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="percentage-today">
                <div className="split-label">
                  <span className="eyebrow">Tiempo trabajado hoy</span>
                  <Badge tone={hasActiveToday ? 'success' : 'neutral'}>
                    {hasActiveToday ? (
                      <>
                        <span className="calculator-live-dot" /> En curso
                      </>
                    ) : (
                      'Fichajes de hoy'
                    )}
                  </Badge>
                </div>
                <div aria-live="polite" aria-atomic="true">
                  <DurationValue
                    minutes={todaySeconds === null ? null : Math.floor(todaySeconds / 60)}
                  />
                </div>
                <p className="calculator-description">
                  {todaySeconds === null
                    ? isLoading
                      ? 'Cargando tus fichajes…'
                      : 'No se pudieron cargar tus fichajes.'
                    : todaySeconds === 0
                      ? 'Todavía no hay tiempo fichado hoy. Puedes introducir una duración o registrar una entrada.'
                      : 'Incluye tus fichajes de hoy y el tramo en curso. Los descansos quedan fuera.'}
                </p>
                <ButtonLink to={paths.attendance} icon="activity" variant="ghost">
                  Ver mis fichajes
                </ButtonLink>
              </div>
            )}
          </div>

          <div className="percentage-base__total">
            <span className="eyebrow">100 % de tu tiempo</span>
            <strong className="mono">
              {baseSeconds === null ? '—' : formatMinutes(Math.floor(baseSeconds / 60))}
            </strong>
          </div>
          <p className="calculator-footnote">
            <Icon name="info" size={14} />
            {source === 'today'
              ? 'Se actualiza con tu jornada y utiliza los segundos exactos de tus fichajes.'
              : 'Cambia la duración y todos los resultados se actualizarán automáticamente.'}
          </p>
        </div>

        <div className="percentage-results">
          <div className="calculator-section-heading">
            <span className="calculator-step">02</span>
            <div>
              <p className="eyebrow">Tus resultados</p>
              <h2>El tiempo que corresponde</h2>
            </div>
          </div>
          <div className="percentage-presets" aria-live="polite" aria-atomic="true">
            {[80, 90].map((preset) => {
              const result = baseSeconds === null ? null : percentageMinutes(baseSeconds, preset);
              return (
                <div className="percentage-preset" key={preset}>
                  <div className="split-label">
                    <span className="percentage-preset__label">
                      {preset}
                      <small>%</small>
                    </span>
                    <Icon name="percent" size={17} />
                  </div>
                  <DurationValue minutes={result} />
                  <div className="percentage-track" aria-hidden="true">
                    <span style={{ width: `${preset}%` }} />
                  </div>
                  <p className="calculator-description">de tu tiempo base</p>
                </div>
              );
            })}
          </div>

          <div className="percentage-custom">
            <div className="percentage-custom__heading">
              <div>
                <p className="eyebrow">A tu medida</p>
                <h3>Tu propio porcentaje</h3>
              </div>
              <div className="percentage-custom__field">
                <InputField
                  label="Porcentaje personalizado"
                  className="percentage-number"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step="any"
                  value={percentage}
                  aria-invalid={customPercentage === null}
                  onChange={(event) => setPercentage(event.target.value)}
                />
                <span aria-hidden="true">%</span>
              </div>
            </div>
            <input
              className="percentage-slider"
              aria-label="Ajustar porcentaje personalizado"
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={customPercentage ?? 0}
              onChange={(event) => setPercentage(event.target.value)}
            />
            <div className="percentage-slider-labels mono" aria-hidden="true">
              <span>0 %</span>
              <span>50 %</span>
              <span>100 %</span>
            </div>
            {customPercentage === null ? (
              <p className="calculator-error" role="status">
                Introduce un porcentaje entre 0 y 100.
              </p>
            ) : null}
            <div className="percentage-custom__result">
              <div aria-live="polite" aria-atomic="true">
                <DurationValue minutes={customMinutes} />
              </div>
              <CopyResult value={customMinutes === null ? null : formatMinutes(customMinutes)} />
            </div>
          </div>
          <p className="calculator-footnote">
            <Icon name="info" size={14} /> Resultados redondeados al minuto más cercano.
          </p>
        </div>
      </section>
    </div>
  );
}
