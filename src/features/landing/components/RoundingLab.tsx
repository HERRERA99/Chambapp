import { useState } from 'react';
import { AnimatePresence, m, useReducedMotion } from 'motion/react';
import { Icon } from '../../../shared/ui/Icon';
import { formatClock, roundDuration } from '../../../domain/time';

const exactSeconds = 4 * 3600 + 8 * 60 + 17;
const options = [0, 15, 30, 60] as const;

export function RoundingLab() {
  const [interval, setInterval] = useState<number>(15);
  const reduced = useReducedMotion();
  const imputed = roundDuration(exactSeconds, interval);
  return (
    <div className="landing-rounding-lab">
      <div className="landing-rounding-lab__header">
        <span className="landing-eyebrow">PRUÉBALO CON UN PARTE</span>
        <Icon name="settings" size={18} />
      </div>
      <p>¿Cómo quieres imputar esta sesión?</p>
      <div
        className="landing-rounding-options"
        role="group"
        aria-label="Redondeo del parte de ejemplo"
      >
        {options.map((minutes) => (
          <button
            type="button"
            key={minutes}
            aria-pressed={interval === minutes}
            onClick={() => setInterval(minutes)}
          >
            {minutes ? `${minutes} min` : 'Exacto'}
            {minutes === interval ? (
              <m.span
                className="landing-rounding-options__active"
                layoutId="rounding-option"
                transition={{ duration: reduced ? 0 : 0.2 }}
              />
            ) : null}
          </button>
        ))}
      </div>
      <div className="landing-rounding-equation">
        <div>
          <span>Tiempo real del parte</span>
          <strong className="mono">{formatClock(exactSeconds)}</strong>
          <small>09:07:14 → 13:15:31</small>
        </div>
        <Icon name="arrow" size={20} />
        <div className="landing-rounding-equation__result">
          <span>Tiempo imputado</span>
          <AnimatePresence mode="wait" initial={false}>
            <m.strong
              key={interval}
              className="mono"
              initial={reduced ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : -8 }}
              transition={{ duration: reduced ? 0 : 0.14 }}
            >
              {formatClock(imputed)}
            </m.strong>
          </AnimatePresence>
          <small>
            {interval ? `+${formatClock(imputed - exactSeconds)} de ajuste` : 'Duración exacta'}
          </small>
        </div>
      </div>
      <div className="landing-rounding-lab__protected">
        <span>
          <Icon name="lock" size={15} /> Tu fichaje no cambia
        </span>
        <strong className="mono">07:42:10</strong>
      </div>
      <p className="landing-rounding-lab__note">
        Ejemplo ilustrativo. El redondeo se aplica a la duración del parte; las horas de entrada y
        salida se conservan.
      </p>
    </div>
  );
}
