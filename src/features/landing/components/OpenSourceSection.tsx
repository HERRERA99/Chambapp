import { Icon } from '../../../shared/ui/Icon';
import { LOCAL_EDITION_DOCS, REPOSITORY_URL } from '../../../lib/project';
import { Reveal } from './Reveal';

const COMPOSE_URL =
  'https://raw.githubusercontent.com/HERRERA99/Chambapp/main/docker/docker-compose.yml';

/** Open source and the Docker edition that keeps everything on the user's PC. */
export function OpenSourceSection() {
  return (
    <section id="open-source" className="landing-section landing-container">
      <Reveal className="landing-section__heading landing-section__heading--center">
        <span className="landing-kicker">
          <span className="landing-kicker__dot" /> Open source · Nuevo: Chambapp local
        </span>
        <h2>
          Código abierto.
          <br />
          <span className="landing-gradient-text">Tus datos, donde tú quieras.</span>
        </h2>
        <p>
          Chambapp es un proyecto open source: puedes leer cada línea, proponer mejoras o instalarlo
          tú mismo. Y si prefieres que nada salga de tu equipo, hay una versión 100% dockerizada que
          se ejecuta en local, sin cuenta y sin subir nada a la nube.
        </p>
      </Reveal>
      <div className="landing-oss">
        <Reveal className="landing-oss__card">
          <span className="landing-oss__icon">
            <Icon name="github" size={20} />
          </span>
          <h3>Proyecto open source</h3>
          <p>
            El código de la app, la base de datos, la extensión y las imágenes Docker está en
            GitHub. Abre una incidencia, envía un pull request o compílalo a tu manera.
          </p>
          <ul>
            <li>
              <Icon name="check" size={13} /> React, TypeScript y PostgreSQL
            </li>
            <li>
              <Icon name="check" size={13} /> Migraciones, pruebas y documentación incluidas
            </li>
          </ul>
          <a className="landing-oss__link" href={REPOSITORY_URL} target="_blank" rel="noreferrer">
            Ver el repositorio <Icon name="arrow" size={15} />
          </a>
          <span className="landing-oss__repo mono">github.com/HERRERA99/Chambapp</span>
        </Reveal>
        <Reveal className="landing-oss__card landing-oss__card--accent" delay={0.08}>
          <span className="landing-oss__icon">
            <Icon name="hardDrive" size={20} />
          </span>
          <h3>
            Chambapp local <span className="landing-new">Nuevo</span>
          </h3>
          <p>
            La misma app en tu PC con Docker: base de datos propia, un único puerto en 127.0.0.1 y
            copias de seguridad cifradas. Nada sale de tu equipo.
          </p>
          <pre className="landing-oss__code mono" aria-label="Instalación con Docker">
            <code>
              {`curl -O ${COMPOSE_URL}\ndocker compose up -d\n# → http://127.0.0.1:47800`}
            </code>
          </pre>
          <a
            className="landing-oss__link"
            href={LOCAL_EDITION_DOCS}
            target="_blank"
            rel="noreferrer"
          >
            Cómo instalarla <Icon name="arrow" size={15} />
          </a>
        </Reveal>
      </div>
    </section>
  );
}
