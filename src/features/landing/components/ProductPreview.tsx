import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { AnimatePresence, m, useMotionValue, useReducedMotion, useSpring } from 'motion/react';
import { Icon } from '../../../shared/ui/Icon';
import { formatClock, roundDuration } from '../../../domain/time';

const initialTask = 3600 + 24 * 60 + 13;
const initialWorked = 6 * 3600 + 18 * 60 + 24;
const initialImputed = 5 * 3600 + 45 * 60;

export function ProductPreview() {
  const reduced = useReducedMotion();
  const [running, setRunning] = useState(false);
  const [inside, setInside] = useState(false);
  const [taskSeconds, setTaskSeconds] = useState(initialTask);
  const [workedSeconds, setWorkedSeconds] = useState(initialWorked);
  const [imputedSeconds, setImputedSeconds] = useState(initialImputed);
  const [saved, setSaved] = useState(false);
  const previousTick = useRef(0);
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, { stiffness: 180, damping: 25 });
  const rotateY = useSpring(tiltY, { stiffness: 180, damping: 25 });
  const percent = workedSeconds ? Math.round((imputedSeconds / workedSeconds) * 1000) / 10 : 0;

  useEffect(() => {
    if (!running && !inside) return;
    previousTick.current = performance.now();
    const timer = setInterval(() => {
      const next = performance.now();
      const elapsed = (next - previousTick.current) / 1000;
      previousTick.current = next;
      if (running) setTaskSeconds((seconds) => seconds + elapsed);
      if (inside) setWorkedSeconds((seconds) => seconds + elapsed);
    }, 1000);
    return () => clearInterval(timer);
  }, [running, inside]);

  function tilt(event: PointerEvent<HTMLDivElement>) {
    if (reduced || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    tiltX.set((0.5 - (event.clientY - bounds.top) / bounds.height) * 4);
    tiltY.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 4);
  }
  function reset() {
    setRunning(false);
    setInside(false);
    setTaskSeconds(initialTask);
    setWorkedSeconds(initialWorked);
    setImputedSeconds(initialImputed);
    setSaved(false);
  }
  function save() {
    setRunning(false);
    setImputedSeconds((seconds) => seconds + roundDuration(taskSeconds, 15));
    setTaskSeconds(0);
    setSaved(true);
  }

  return (
    <m.div
      className="product-preview"
      style={{ rotateX: reduced ? 0 : rotateX, rotateY: reduced ? 0 : rotateY }}
      onPointerMove={tilt}
      onPointerLeave={() => {
        tiltX.set(0);
        tiltY.set(0);
      }}
    >
      <div className="product-preview__bar">
        <div className="window-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <span className="mono">Chambapp / Resumen</span>
        <span className="product-preview__demo">DEMO</span>
      </div>
      <div className="product-preview__body">
        <div className="product-preview__greeting">
          <div>
            <span className="landing-eyebrow">TU ESPACIO DE TRABAJO</span>
            <h2>Un día con foco.</h2>
          </div>
          <span
            className={`preview-attendance-status ${inside ? 'preview-attendance-status--inside' : ''}`}
          >
            <i />
            {inside ? 'Dentro' : 'Fuera'}
          </span>
        </div>
        <div className="preview-stats">
          <div>
            <span>Fichado exacto</span>
            <strong className="mono">{formatClock(workedSeconds)}</strong>
          </div>
          <div>
            <span>Imputado</span>
            <strong className="mono">{formatClock(imputedSeconds)}</strong>
          </div>
          <div>
            <span>% imputado</span>
            <strong className="mono preview-stats__accent">{percent.toLocaleString('es')}%</strong>
          </div>
        </div>
        <div
          className={`product-preview__timer ${running ? 'product-preview__timer--running' : ''}`}
        >
          <div className="preview-task-heading">
            <span className="preview-project">
              <i /> Estudio Norte
            </span>
            <span className="preview-live">
              <i />
              {running ? 'En curso' : saved ? 'Parte guardado' : 'Tarea en pausa'}
            </span>
          </div>
          <h3>Preparar la propuesta de diseño</h3>
          <span className="preview-odoo mono">
            T443212 <Icon name="up" size={11} /> <span>Referencia Odoo · ejemplo</span>
          </span>
          <div className="preview-timer-display">
            <span className="preview-digits mono">{formatClock(taskSeconds)}</span>
            <span>Tiempo de esta tarea</span>
          </div>
          <div className="preview-controls">
            <m.button
              type="button"
              whileTap={reduced ? undefined : { scale: 0.97 }}
              className="preview-primary-button"
              onClick={() => {
                setRunning((value) => !value);
                setSaved(false);
              }}
            >
              <Icon name={running ? 'pause' : 'play'} size={14} />
              {running ? 'Pausar tarea' : taskSeconds ? 'Reanudar tarea' : 'Iniciar tarea'}
            </m.button>
            <button type="button" disabled={!taskSeconds} onClick={save}>
              <Icon name="stop" size={13} /> Guardar parte
            </button>
          </div>
          <AnimatePresence initial={false}>
            <m.p
              className="preview-save-message"
              role="status"
              key={saved ? 'saved' : 'ready'}
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              {saved
                ? 'Parte de ejemplo añadido al tiempo imputado.'
                : 'Redondeo del parte: 15 min · Fichaje sin redondeo.'}
            </m.p>
          </AnimatePresence>
        </div>
        <div className="preview-attendance-row">
          <span>
            <Icon name="activity" size={15} /> Tu jornada va por su cuenta.
          </span>
          <button type="button" onClick={() => setInside((value) => !value)}>
            {inside ? 'Fichar salida' : 'Fichar entrada'}
            <Icon name="arrow" size={13} />
          </button>
        </div>
        <div className="preview-footnote">
          <span>Ejemplo interactivo. No guarda datos.</span>
          <button type="button" onClick={reset} aria-label="Restablecer el ejemplo">
            Reiniciar
          </button>
        </div>
      </div>
    </m.div>
  );
}
