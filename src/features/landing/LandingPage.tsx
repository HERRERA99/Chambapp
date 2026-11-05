import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  domAnimation,
  LazyMotion,
  m,
  MotionConfig,
  useReducedMotion,
  useScroll,
  useSpring,
} from 'motion/react';
import { Brand } from '../../shared/brand/Brand';
import { ButtonLink, IconButton } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { LivingBackground } from './components/LivingBackground';
import { ProductPreview } from './components/ProductPreview';
import { FeatureCards } from './components/FeatureCards';
import { ExtensionShowcase } from './components/ExtensionShowcase';
import { RoundingLab } from './components/RoundingLab';
import { WeekExplorer } from './components/WeekExplorer';
import { Reveal } from './components/Reveal';
import './landing.css';

function LandingContent() {
  const [mobileMenu, setMobileMenu] = useState(false);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 150, damping: 30 });
  return (
    <div className="landing">
      <a className="skip-link" href="#landing-main">
        Saltar al contenido
      </a>
      <LivingBackground />
      <m.div
        className="landing-scroll-progress"
        style={{ scaleX: reduced ? scrollYProgress : progress }}
        aria-hidden="true"
      />
      <header className="landing-header">
        <div className="landing-header__inner landing-container">
          <Brand />
          <nav
            id="landing-navigation"
            className={`landing-nav ${mobileMenu ? 'landing-nav--open' : ''}`}
            aria-label="Navegación pública"
          >
            <a href="#producto" onClick={() => setMobileMenu(false)}>
              El producto
            </a>
            <a href="#tu-tiempo" onClick={() => setMobileMenu(false)}>
              Tu tiempo
            </a>
            <a href="#tu-semana" onClick={() => setMobileMenu(false)}>
              Tu semana
            </a>
            <a href="#extension" onClick={() => setMobileMenu(false)}>
              Extensión <span className="landing-new">Nuevo</span>
            </a>
            <Link className="landing-nav__mobile-login" to="/login">
              Iniciar sesión
            </Link>
          </nav>
          <div className="landing-header__actions">
            <Link to="/login" className="landing-login">
              Iniciar sesión <Icon name="up" size={13} />
            </Link>
            <ButtonLink to="/registro" variant="primary">
              Crear cuenta <Icon name="arrow" size={14} />
            </ButtonLink>
            <IconButton
              icon={mobileMenu ? 'close' : 'menu'}
              className="landing-menu"
              label={mobileMenu ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={mobileMenu}
              aria-controls="landing-navigation"
              onClick={() => setMobileMenu((value) => !value)}
            />
          </div>
        </div>
      </header>
      <main id="landing-main">
        <section className="landing-hero landing-container">
          <div className="landing-hero__copy">
            <m.div
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="landing-kicker"
            >
              <span className="landing-kicker__dot" /> Tu jornada, a tu ritmo
            </m.div>
            <h1>
              <m.span
                initial={reduced ? false : { opacity: 0, y: 35 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                Cada minuto.
              </m.span>
              <m.span
                className="landing-gradient-text"
                initial={reduced ? false : { opacity: 0, y: 35 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                En su sitio.
              </m.span>
            </h1>
            <m.p
              className="landing-hero__description"
              initial={reduced ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.35 }}
            >
              Ficha tu jornada. Dale contexto a tus horas.
              <br className="landing-desktop-break" /> Y termina la semana sabiendo dónde estuvo tu
              tiempo.
            </m.p>
            <m.div
              className="landing-hero__actions"
              initial={reduced ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.45 }}
            >
              <ButtonLink to="/registro" variant="primary">
                Empieza con Chambapp <Icon name="arrow" size={17} />
              </ButtonLink>
              <a href="#demo" className="landing-demo-link">
                <span>
                  <Icon name="play" size={13} />
                </span>{' '}
                Prueba cómo funciona
              </a>
            </m.div>
            <m.div
              className="landing-hero__notes"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.65 }}
            >
              <span>
                <Icon name="check" size={13} /> Fichajes exactos
              </span>
              <span>
                <Icon name="check" size={13} /> Proyectos con contexto
              </span>
            </m.div>
          </div>
          <m.div
            id="demo"
            className="landing-hero__visual"
            initial={reduced ? false : { opacity: 0, y: 45, rotate: 2 }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            transition={{ duration: 1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="landing-preview-glow" aria-hidden="true" />
            <ProductPreview />
            <div className="landing-floating-note" aria-hidden="true">
              <span>
                <Icon name="verified" size={16} />
              </span>
              <div>
                <strong>Cada segundo cuenta.</strong>
                <small>El fichaje siempre es exacto.</small>
              </div>
            </div>
          </m.div>
          <div className="landing-hero__bottom">
            <span className="mono">MENOS RECONSTRUIR. MÁS TRABAJAR.</span>
            <a href="#producto" aria-label="Descubrir el producto">
              <Icon name="down" size={18} />
            </a>
          </div>
        </section>
        <div
          className="landing-principles landing-container"
          aria-label="Todo tu tiempo en un mismo lugar"
        >
          <span>
            Una jornada.
            <br />
            <strong>Todo el contexto.</strong>
          </span>
          {[
            { icon: 'activity' as const, label: 'Entradas y salidas' },
            { icon: 'timer' as const, label: 'Tiempo por tarea' },
            { icon: 'gauge' as const, label: 'Balance de horas' },
            { icon: 'calendar' as const, label: 'Tu semana' },
          ].map((item) => (
            <div key={item.label}>
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
        <section id="producto" className="landing-section landing-container">
          <Reveal className="landing-section__heading">
            <p className="landing-eyebrow">TODO ENCAJA</p>
            <h2>
              La jornada completa.
              <br />
              <span className="landing-muted-heading">La historia de cada hora.</span>
            </h2>
            <p>
              Del primer fichaje al último parte. Un espacio para trabajar, registrar y entender tu
              tiempo.
            </p>
          </Reveal>
          <FeatureCards />
        </section>
        <section id="tu-tiempo" className="landing-section landing-container landing-time-section">
          <Reveal className="landing-section__heading">
            <p className="landing-eyebrow">PRECISIÓN SIN COMPLICACIONES</p>
            <h2>
              El tiempo que trabajas.
              <br />
              <span className="landing-muted-heading">El tiempo que imputas.</span>
            </h2>
            <p>
              Dos medidas, una visión clara. Tu jornada conserva cada segundo. Tú eliges el redondeo
              de los partes de tareas.
            </p>
            <div className="landing-time-facts">
              <span>
                <Icon name="lock" size={16} /> Inicio y fin exactos
              </span>
              <span>
                <Icon name="settings" size={16} /> Redondeo por parte
              </span>
              <span>
                <Icon name="gauge" size={16} /> Porcentaje imputado
              </span>
            </div>
          </Reveal>
          <Reveal delay={0.12}>
            <RoundingLab />
          </Reveal>
        </section>
        <section id="tu-semana" className="landing-section landing-container">
          <Reveal className="landing-section__heading landing-section__heading--center">
            <p className="landing-eyebrow">LEVANTA LA VISTA</p>
            <h2>
              Tu semana tiene un ritmo.
              <br />
              <span className="landing-muted-heading">Encuentra el tuyo.</span>
            </h2>
            <p>
              Compara horas fichadas e imputadas, ajusta tus objetivos y consulta el balance de cada
              día.
            </p>
          </Reveal>
          <Reveal>
            <WeekExplorer />
          </Reveal>
        </section>
        <section id="extension" className="landing-section landing-container">
          <Reveal className="landing-section__heading">
            <span className="landing-kicker">
              <span className="landing-kicker__dot" /> Nuevo · Extensión de navegador
            </span>
            <h2>
              Odoo y tus contraseñas,
              <br />
              <span className="landing-gradient-text">a un clic.</span>
            </h2>
            <p>
              Chambapp sale de su pestaña: importa tareas de Odoo, envía tus partes sin teclearlos
              dos veces y rellena tus accesos con la bóveda cifrada de tu cuenta.
            </p>
          </Reveal>
          <ExtensionShowcase />
        </section>
        <section className="landing-workflow landing-container">
          <Reveal className="landing-workflow__intro">
            <p className="landing-eyebrow">UN FLUJO NATURAL</p>
            <h2>
              Empieza el día.
              <br />
              Sigue el hilo.
              <br />
              <span className="landing-gradient-text">Cierra con claridad.</span>
            </h2>
          </Reveal>
          <div className="landing-workflow__steps">
            {[
              {
                title: 'Entra en tu jornada',
                text: 'Ficha la entrada o introduce la hora manualmente. Tu jornada empieza a contar.',
                icon: 'play' as const,
              },
              {
                title: 'Trabaja con contexto',
                text: 'Elige una tarea, inicia el cronómetro o registra un parte manual. Cada sesión tiene su lugar.',
                icon: 'tasks' as const,
              },
              {
                title: 'Mira el día completo',
                text: 'Ficha la salida y revisa la relación entre tu jornada y las horas imputadas.',
                icon: 'verified' as const,
              },
            ].map((step, index) => (
              <Reveal key={step.title} delay={index * 0.08} className="landing-workflow__step">
                <span className="landing-workflow__number mono">0{index + 1}</span>
                <div>
                  <Icon name={step.icon} size={19} />
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
        <Reveal className="landing-container">
          <section className="landing-cta">
            <div className="landing-cta__orb" aria-hidden="true" />
            <span className="landing-kicker">
              <span className="landing-kicker__dot" /> Tu espacio. Tu tiempo.
            </span>
            <h2>
              Recupera el hilo
              <br />
              de tu tiempo.
            </h2>
            <p>Una jornada más clara empieza por saber dónde van tus horas.</p>
            <div className="landing-hero__actions">
              <ButtonLink to="/registro" variant="primary">
                Crear mi cuenta <Icon name="arrow" size={17} />
              </ButtonLink>
              <ButtonLink to="/login" variant="ghost">
                Ya tengo cuenta
              </ButtonLink>
            </div>
            <span className="landing-cta__footnote">
              Proyectos, tareas, fichajes y partes. En un mismo lugar.
            </span>
          </section>
        </Reveal>
      </main>
      <footer className="landing-footer landing-container">
        <Brand />
        <p>© Chambapp · Cada minuto, en su sitio.</p>
        <div>
          <Link to="/login">Iniciar sesión</Link>
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' })}
          >
            Volver arriba <Icon name="up" size={13} />
          </button>
        </div>
      </footer>
    </div>
  );
}

export default function LandingPage() {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <LandingContent />
      </MotionConfig>
    </LazyMotion>
  );
}
