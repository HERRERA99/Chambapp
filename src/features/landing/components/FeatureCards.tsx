import { m, useReducedMotion } from 'motion/react';
import { Icon } from '../../../shared/ui/Icon';
import { Reveal } from './Reveal';

export function FeatureCards() {
  const reduced = useReducedMotion();
  return (
    <div className="landing-bento">
      <Reveal className="landing-bento__card landing-bento__card--attendance">
        <div className="landing-card-icon">
          <Icon name="activity" size={22} />
        </div>
        <h3>
          Ficha tu día.
          <br />
          Cierra el círculo.
        </h3>
        <p>
          Entrada y salida con un clic o a mano. Varias sesiones, pausas y el recuento exacto de tu
          jornada.
        </p>
        <div
          className="landing-attendance-visual"
          aria-label="Ejemplo de jornada: entrada 09:07, pausa de 13:15 a 14:00 y salida 17:12"
        >
          <div className="landing-timeline">
            <span>
              <i />
              09:07<small>Entrada</small>
            </span>
            <div />
            <span>
              <i />
              13:15<small>Pausa</small>
            </span>
            <div className="landing-timeline__pause" />
            <span>
              <i />
              14:00<small>Vuelta</small>
            </span>
            <div />
            <span>
              <i />
              17:12<small>Salida</small>
            </span>
          </div>
          <div className="landing-attendance-visual__total">
            <span>
              <i /> Jornada cerrada · ejemplo
            </span>
            <strong className="mono">
              07:20:00<small>sin redondeo</small>
            </strong>
          </div>
        </div>
      </Reveal>
      <Reveal delay={0.1} className="landing-bento__card landing-bento__card--tasks">
        <div className="landing-card-icon">
          <Icon name="tasks" size={22} />
        </div>
        <h3>El tiempo tiene contexto.</h3>
        <p>Proyectos, tareas y partes conectados. Retoma el trabajo sin perder el hilo.</p>
        <div className="landing-task-visual" aria-hidden="true">
          {[
            { title: 'Propuesta de diseño', tag: 'En curso', icon: 'play' as const },
            { title: 'Revisión de componentes', tag: 'Pendiente', icon: 'tasks' as const },
            { title: 'Entrega al cliente', tag: 'Completada', icon: 'check' as const },
          ].map((task, index) => (
            <m.div
              key={task.title}
              className={index === 0 ? 'landing-task-visual__active' : ''}
              initial={reduced ? false : { opacity: 0, x: 18 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.14 }}
            >
              <Icon name={task.icon} size={13} />
              <span>
                {task.title}
                <small>{task.tag}</small>
              </span>
              <i />
            </m.div>
          ))}
        </div>
      </Reveal>
      <Reveal delay={0.05} className="landing-bento__card landing-bento__card--odoo">
        <div className="landing-card-icon">
          <Icon name="up" size={22} />
        </div>
        <h3>
          Tu referencia en Odoo.
          <br />
          Siempre cerca.
        </h3>
        <p>Añade el ID y el enlace de Odoo a la tarea. Accede también desde sus partes de horas.</p>
        <div
          className="landing-odoo-visual"
          aria-label="Ejemplo de referencia T443212 asociada a una tarea"
        >
          <span className="mono">T443212</span>
          <span className="landing-odoo-visual__connector" />
          <span>
            <Icon name="file" size={19} />
          </span>
          <Icon name="up" size={18} />
        </div>
        <span className="landing-card-footnote">Referencias y enlaces, a tu alcance.</span>
      </Reveal>
      <Reveal delay={0.15} className="landing-bento__card landing-bento__card--balance">
        <div>
          <div className="landing-card-icon">
            <Icon name="gauge" size={22} />
          </div>
          <h3>
            Las horas, claras.
            <br />
            El balance, también.
          </h3>
          <p>
            Descubre qué parte de tu jornada has imputado. Consulta días, semanas y exporta tus
            informes.
          </p>
        </div>
        <div
          className="landing-balance-visual"
          aria-label="Ejemplo: 91 por ciento de horas imputadas"
        >
          <svg viewBox="0 0 180 180" aria-hidden="true">
            <circle
              cx="90"
              cy="90"
              r="72"
              fill="none"
              stroke="rgba(255,255,255,.07)"
              strokeWidth="8"
            />
            <m.circle
              cx="90"
              cy="90"
              r="72"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray="452.4"
              initial={reduced ? false : { strokeDashoffset: 452.4 }}
              whileInView={{ strokeDashoffset: 40.7 }}
              viewport={{ once: true }}
              transition={{ duration: reduced ? 0 : 1.4, ease: 'easeOut' }}
              transform="rotate(-90 90 90)"
            />
          </svg>
          <span>
            <strong>
              91<small>%</small>
            </strong>
            <small>imputado · ejemplo</small>
          </span>
        </div>
      </Reveal>
    </div>
  );
}
