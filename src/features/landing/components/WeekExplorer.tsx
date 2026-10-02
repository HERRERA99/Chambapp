import { useState } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { Icon } from '../../../shared/ui/Icon';
import { formatClock } from '../../../domain/time';

const days = [
  { day: 'Lunes', label: 'Lun', worked: 27000, imputed: 25200 },
  { day: 'Martes', label: 'Mar', worked: 28800, imputed: 27000 },
  { day: 'Miércoles', label: 'Mié', worked: 25560, imputed: 24300 },
  { day: 'Jueves', label: 'Jue', worked: 27900, imputed: 26100 },
  { day: 'Viernes', label: 'Vie', worked: 24840, imputed: 21600 },
];
const workedTotal = days.reduce((total, day) => total + day.worked, 0);
const imputedTotal = days.reduce((total, day) => total + day.imputed, 0);

export function WeekExplorer() {
  const [selected, setSelected] = useState(2);
  const reduced = useReducedMotion();
  const current = days[selected]!;
  return (
    <div className="landing-week-explorer">
      <div className="landing-week-explorer__heading">
        <div>
          <span className="landing-eyebrow">BALANCE SEMANAL · EJEMPLO</span>
          <h3>Cada día tiene su historia.</h3>
        </div>
        <span className="landing-week-explorer__period">
          <Icon name="calendar" size={15} /> Lunes — viernes
        </span>
      </div>
      <div className="landing-week-explorer__content">
        <div className="landing-week-bars">
          <div className="landing-week-bars__legend">
            <span>
              <i /> Fichado
            </span>
            <span>
              <i /> Imputado
            </span>
            <small>Selecciona un día</small>
          </div>
          <div
            className="landing-week-bars__chart"
            role="group"
            aria-label="Seleccionar un día del balance ilustrativo"
          >
            {days.map((day, index) => (
              <button
                type="button"
                key={day.day}
                className={`landing-week-bars__day ${selected === index ? 'landing-week-bars__day--active' : ''}`}
                aria-pressed={selected === index}
                aria-label={`${day.day}: fichado ${formatClock(day.worked)}, imputado ${formatClock(day.imputed)}`}
                onClick={() => setSelected(index)}
              >
                <span className="landing-week-bars__columns" aria-hidden="true">
                  <m.i
                    className="landing-week-bars__worked"
                    style={{ height: `${(day.worked / 30600) * 100}%` }}
                    initial={reduced ? false : { scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: reduced ? 0 : 0.75, delay: index * 0.08 }}
                  />
                  <m.i
                    className="landing-week-bars__imputed"
                    style={{ height: `${(day.imputed / 30600) * 100}%` }}
                    initial={reduced ? false : { scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: reduced ? 0 : 0.75, delay: 0.15 + index * 0.08 }}
                  />
                </span>
                <span>{day.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="landing-week-detail" aria-live="polite">
          <span className="landing-week-detail__day">
            <i />
            {current.day}
          </span>
          <div>
            <span>Fichado exacto</span>
            <strong className="mono">{formatClock(current.worked)}</strong>
          </div>
          <div>
            <span>Imputado en tareas</span>
            <strong className="mono">{formatClock(current.imputed)}</strong>
          </div>
          <div className="landing-week-detail__percent">
            <span>Horas imputadas</span>
            <strong>
              {Math.round((current.imputed / current.worked) * 100)}
              <small>%</small>
            </strong>
          </div>
        </div>
      </div>
      <div className="landing-week-explorer__totals">
        <span>
          <Icon name="gauge" size={16} /> Una mirada al conjunto
        </span>
        <div>
          <small>Fichado semanal</small>
          <strong className="mono">{formatClock(workedTotal)}</strong>
        </div>
        <div>
          <small>Imputado semanal</small>
          <strong className="mono">{formatClock(imputedTotal)}</strong>
        </div>
        <div>
          <small>% imputado</small>
          <strong className="mono">
            {((imputedTotal / workedTotal) * 100).toLocaleString('es', {
              maximumFractionDigits: 1,
            })}
            %
          </strong>
        </div>
      </div>
    </div>
  );
}
