import { m, useReducedMotion } from 'motion/react';
import { Icon } from '../../../shared/ui/Icon';
import type { IconName } from '../../../shared/ui/Icon';
import { Reveal } from './Reveal';

const features: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'tasks',
    title: 'Tus tareas de Odoo, en un clic',
    text: 'Abre una tarea en Odoo y la extensión la reconoce. Añádela a Chambapp con su ID, enlace y proyecto.',
  },
  {
    icon: 'send',
    title: 'Imputa sin copiar a mano',
    text: 'Desde tu parte semanal, «Enviar a Odoo» crea la línea de horas, comprueba que se guardó y la marca como imputada.',
  },
  {
    icon: 'key',
    title: 'Tus contraseñas, donde las necesitas',
    text: 'Desbloquea tu bóveda cifrada y rellena usuario y contraseña en la web que tienes abierta.',
  },
];

/** Landing section for the browser extension, with a drawing of its popup. */
export function ExtensionShowcase() {
  const reduced = useReducedMotion();
  return (
    <div className="landing-extension">
      <div className="landing-extension__features">
        {features.map((feature, index) => (
          <Reveal key={feature.title} delay={index * 0.08} className="landing-extension__feature">
            <span className="landing-card-icon">
              <Icon name={feature.icon} size={20} />
            </span>
            <div>
              <h3>{feature.title}</h3>
              <p>{feature.text}</p>
            </div>
          </Reveal>
        ))}
        <Reveal delay={0.24} className="landing-extension__browsers">
          <Icon name="globe" size={14} /> Para Chrome, Edge y Firefox · se instala desde tu espacio
        </Reveal>
      </div>
      <Reveal delay={0.1} className="landing-extension__visual">
        <div
          className="landing-browser"
          role="img"
          aria-label="Ejemplo: una tarea de Odoo abierta y la extensión de Chambapp ofreciendo añadirla"
        >
          <div className="landing-browser__bar" aria-hidden="true">
            <span className="landing-browser__dots">
              <i />
              <i />
              <i />
            </span>
            <span className="landing-browser__url mono">empresa.odoo.com/odoo/tasks/443212</span>
            <span className="landing-browser__ext">
              <img src="/brand/favicon.svg" alt="" width={16} height={16} />
              <b>+</b>
            </span>
          </div>
          <div className="landing-browser__page" aria-hidden="true">
            <span className="landing-browser__line landing-browser__line--title" />
            <span className="landing-browser__line" />
            <span className="landing-browser__line landing-browser__line--short" />
            <span className="landing-browser__table">
              <i />
              <i />
              <i />
            </span>
          </div>
          <m.div
            className="landing-popup"
            aria-hidden="true"
            initial={reduced ? false : { opacity: 0, y: -12, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <span className="landing-popup__head">
              <img src="/brand/favicon.svg" alt="" width={16} height={16} /> Chambapp
            </span>
            <span className="landing-popup__tabs">
              <b>Odoo</b>
              <span>Contraseñas</span>
            </span>
            <span className="landing-popup__card">
              <small className="mono">TAREA DE ODOO DETECTADA · T443212</small>
              <strong>Migrar facturación al nuevo ERP</strong>
              <span className="landing-popup__field">Proyecto · Cliente Acme</span>
              <span className="landing-popup__button">+ Añadir a Chambapp</span>
            </span>
            <span className="landing-popup__queue">
              <span className="mono">05 nov · 01:15</span>
              <em>Imputado</em>
            </span>
          </m.div>
        </div>
      </Reveal>
    </div>
  );
}
