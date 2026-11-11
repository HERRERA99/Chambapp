import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Modal } from '../../shared/ui/Modal';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import type { IconName } from '../../shared/ui/Icon';
import { paths } from '../../app/paths';
import { useExtension } from './useExtension';
import {
  EXTENSION_FOLDER,
  FIREFOX_DEBUGGING,
  browserKind,
  downloadExtension,
  extensionsPage,
  loadPackageInfo,
  rememberTutorialStep,
} from './extensionDownload';
import type { BrowserKind, DownloadState, PackageInfo } from './extensionDownload';
import './extension.css';
import { isLocalEdition } from '../../lib/edition';
import { DEFAULT_LOCAL_ORIGIN } from '../../lib/localUser';

type StepId =
  | 'download'
  | 'unzip'
  | 'open'
  | 'developer'
  | 'load'
  | 'firefox-install'
  | 'firefox-temporary'
  | 'signin'
  | 'odoo'
  | 'done';
type Step = { id: StepId; title: string; short: string; icon: IconName };

const step = (id: StepId, title: string, short: string, icon: IconName): Step => ({
  id,
  title,
  short,
  icon,
});
const common = {
  signin: step('signin', 'Fíjala e inicia sesión', 'Sesión', 'user'),
  odoo: step('odoo', 'Conecta tu Odoo', 'Odoo', 'settings'),
  done: step('done', '¡Todo listo!', 'Listo', 'verified'),
};

/** Steps for each browser: Chrome and Edge load a folder; Firefox installs the .xpi. */
function stepsFor(browser: BrowserKind, firefoxSigned: boolean): Step[] {
  if (browser === 'firefox')
    return [
      step('download', 'Descarga la extensión', 'Descargar', 'download'),
      firefoxSigned
        ? step('firefox-install', 'Acepta la instalación', 'Instalar', 'shield')
        : step('firefox-temporary', 'Cárgala como complemento temporal', 'Cargar', 'up'),
      common.signin,
      common.odoo,
      common.done,
    ];
  return [
    step('download', 'Descarga la extensión', 'Descargar', 'download'),
    step('unzip', 'Descomprímela en una carpeta fija', 'Descomprimir', 'folder'),
    step('open', 'Abre la página de extensiones', 'Extensiones', 'globe'),
    step('developer', 'Activa el modo de desarrollador', 'Modo dev', 'code'),
    step('load', 'Carga la carpeta descomprimida', 'Cargar', 'up'),
    common.signin,
    common.odoo,
    common.done,
  ];
}

const browserNames: Record<BrowserKind, string> = {
  chrome: 'Google Chrome',
  edge: 'Microsoft Edge',
  firefox: 'Mozilla Firefox',
};

function Live({ ok, okText, waitText }: { ok: boolean; okText: string; waitText: string }) {
  return (
    <p className={`ext-live ${ok ? 'ext-live--ok' : ''}`} role="status" aria-live="polite">
      <span className="ext-live__dot" aria-hidden="true" />
      {ok ? okText : waitText}
    </p>
  );
}

function Copy({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="ext-copy">
      <code className="mono">{text}</code>
      <Button
        variant="secondary"
        icon={copied ? 'check' : 'copy'}
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? 'Copiado' : 'Copiar'}
      </Button>
    </span>
  );
}

/** Small drawings of the browser screens, so each step shows where to click. */
function Mock({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="ext-mock" role="img" aria-label={label}>
      <div className="ext-mock__bar" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="ext-mock__body" aria-hidden="true">
        {children}
      </div>
    </div>
  );
}

function Detected({ onReload }: { onReload: () => void }) {
  const extension = useExtension();
  return (
    <>
      <Live
        ok={extension.available}
        okText={`¡Extensión detectada! Versión ${extension.version}.`}
        waitText="Esperando a la extensión… Esta página la detecta sola en cuanto la instales."
      />
      {!extension.available ? (
        <p className="field__hint">
          ¿Ya la instalaste y no aparece?{' '}
          <button type="button" className="text-button" onClick={onReload}>
            Recarga esta página
          </button>{' '}
          (el tutorial seguirá en este paso).
        </p>
      ) : null}
    </>
  );
}

function StepBody({
  id,
  browser,
  info,
  download,
  onDownload,
  onReload,
  onClose,
}: {
  id: StepId;
  browser: BrowserKind;
  info: PackageInfo | null;
  download: DownloadState;
  onDownload: () => void;
  onReload: () => void;
  onClose: () => void;
}) {
  const extension = useExtension();
  const firefox = browser === 'firefox';
  const edge = browser === 'edge';
  const fileName = firefox ? 'chambapp-extension-firefox.xpi' : `${EXTENSION_FOLDER}.zip`;
  switch (id) {
    case 'download':
      return (
        <>
          <p>
            La extensión para <strong>{browserNames[browser]}</strong> se descarga como{' '}
            <code className="mono">{fileName}</code>.
            {firefox && info?.firefoxSigned
              ? ' Está firmada por Mozilla: Firefox te pedirá permiso para instalarla en cuanto pulses el botón.'
              : ''}
          </p>
          {firefox && info && !info.firefoxSigned ? (
            <p className="ext-live" role="note">
              <span className="ext-live__dot" aria-hidden="true" />
              Esta versión aún no está firmada por Mozilla: solo se puede cargar como complemento
              temporal, que Firefox quita al cerrarse.
            </p>
          ) : null}
          {download.status === 'started' ? (
            <p className="ext-live ext-live--ok" role="status">
              <span className="ext-live__dot" aria-hidden="true" />
              {firefox && info?.firefoxSigned
                ? 'Descarga iniciada. Si Firefox muestra «Firefox impidió que este sitio instalara software», pulsa «Continuar con la instalación».'
                : 'Descarga iniciada. Búscala en la carpeta Descargas.'}
            </p>
          ) : download.status === 'starting' ? (
            <p className="ext-live" role="status">
              <span className="ext-live__dot" aria-hidden="true" />
              Preparando la descarga…
            </p>
          ) : download.status === 'error' ? (
            <p className="form-error" role="alert">
              {download.message}
            </p>
          ) : null}
          <div className="actions">
            <Button
              variant={download.status === 'started' ? 'secondary' : 'primary'}
              icon="download"
              disabled={download.status === 'starting'}
              onClick={onDownload}
            >
              {download.status === 'started'
                ? 'Descargar otra vez'
                : `Descargar para ${browserNames[browser]}`}
            </Button>
          </div>
          {extension.available ? (
            <Live
              ok
              okText={`Ya tienes la extensión instalada (v${extension.version}). Solo necesitas descargarla para actualizarla.`}
              waitText=""
            />
          ) : null}
        </>
      );
    case 'unzip':
      return (
        <>
          <p>
            Haz clic derecho sobre el archivo → <strong>Extraer todo…</strong> y guárdalo en una
            carpeta que no vayas a borrar, por ejemplo <code className="mono">Documentos</code>. El
            navegador carga la extensión desde ahí cada vez que se abre.
          </p>
          <Mock label={`Carpeta ${EXTENSION_FOLDER} con manifest.json dentro`}>
            <div className="ext-tree">
              <span>
                <Icon name="folder" size={14} /> Documentos
              </span>
              <span className="ext-tree__item ext-tree__item--accent">
                <Icon name="folder" size={14} /> {EXTENSION_FOLDER}
              </span>
              <span className="ext-tree__item ext-tree__item--deep">
                <Icon name="file" size={14} /> manifest.json
              </span>
              <span className="ext-tree__item ext-tree__item--deep dim">
                <Icon name="folder" size={14} /> assets · content · icons …
              </span>
            </div>
          </Mock>
          <p className="field__hint">
            Si la mueves o la borras, la extensión dejará de funcionar y tendrás que cargarla de
            nuevo.
          </p>
        </>
      );
    case 'open':
      return (
        <>
          <p>
            Copia esta dirección, ábrela en una pestaña nueva y pulsa Intro. Por seguridad, el
            navegador no deja abrir estas páginas desde un enlace.
          </p>
          <Copy text={extensionsPage(browser)} />
          <p className="field__hint">
            También llegas desde el menú{' '}
            {edge
              ? '⋯ → Extensiones → Administrar extensiones'
              : '⋮ → Extensiones → Gestionar extensiones'}
            .
          </p>
        </>
      );
    case 'developer':
      return (
        <>
          <p>
            Activa <strong>Modo de desarrollador</strong>.{' '}
            {edge
              ? 'En Edge está en el panel de la izquierda, abajo.'
              : 'En Chrome está arriba a la derecha.'}{' '}
            Así puedes instalar extensiones que no vienen de la tienda.
          </p>
          <Mock label="Interruptor de modo de desarrollador activado">
            <div className={`ext-devmode ${edge ? 'ext-devmode--edge' : ''}`}>
              <span>Extensiones</span>
              <span className="ext-toggle">
                Modo de desarrollador <i />
              </span>
            </div>
          </Mock>
        </>
      );
    case 'load':
      return (
        <>
          <p>
            Pulsa <strong>Cargar descomprimida</strong> y elige la carpeta{' '}
            <code className="mono">{EXTENSION_FOLDER}</code> (la que contiene{' '}
            <code className="mono">manifest.json</code>).
          </p>
          <Mock label="Botón Cargar descomprimida y la extensión Chambapp cargada">
            <div className="ext-load">
              <span className="ext-load__button">
                <Icon name="up" size={13} /> Cargar descomprimida
              </span>
              <span className="ext-load__card">
                <img src="/brand/favicon.svg" alt="" width={22} height={22} />
                <span>
                  <strong>Chambapp</strong>
                  <small>Importa tareas de Odoo, envía partes y rellena contraseñas.</small>
                </span>
              </span>
            </div>
          </Mock>
          <Detected onReload={onReload} />
        </>
      );
    case 'firefox-install':
      return (
        <>
          <p>
            Firefox pregunta <strong>«¿Añadir Chambapp?»</strong> y muestra los permisos y los datos
            que la extensión envía a tu cuenta de Chambapp (acceso, correo y contenido de las tareas
            de Odoo). Pulsa <strong>Añadir</strong>.
          </p>
          <Mock label="Diálogo de Firefox para añadir la extensión Chambapp">
            <div className="ext-firefox-prompt">
              <span className="ext-firefox-prompt__title">
                <img src="/brand/favicon.svg" alt="" width={18} height={18} />
                ¿Añadir Chambapp?
              </span>
              <span className="dim">
                Necesita permiso para acceder a tus datos de algunos sitios…
              </span>
              <span className="ext-firefox-prompt__actions">
                <i>Cancelar</i>
                <b>Añadir</b>
              </span>
            </div>
          </Mock>
          <p className="field__hint">
            ¿Se descargó el archivo en vez de preguntar? Arrástralo a una ventana de Firefox, o en{' '}
            <code className="mono">about:addons</code> pulsa el engranaje → «Instalar complemento
            desde archivo…».
          </p>
          <Detected onReload={onReload} />
        </>
      );
    case 'firefox-temporary':
      return (
        <>
          <p>
            Abre esta dirección en una pestaña nueva, pulsa{' '}
            <strong>Cargar complemento temporal…</strong> y elige{' '}
            <code className="mono">chambapp-extension-firefox.xpi</code>.
          </p>
          <Copy text={FIREFOX_DEBUGGING} />
          <p className="ext-live" role="note">
            <span className="ext-live__dot" aria-hidden="true" />
            Un complemento temporal desaparece al cerrar Firefox. La versión firmada se instala de
            forma permanente con un clic.
          </p>
          <Detected onReload={onReload} />
        </>
      );
    case 'signin':
      return (
        <>
          <p>
            {firefox
              ? 'Pulsa el icono de la pieza de puzle de la barra, abre el engranaje de Chambapp y elige «Fijar a la barra de herramientas».'
              : 'Pulsa el icono de la pieza de puzle de la barra del navegador y fija Chambapp con la chincheta.'}{' '}
            {isLocalEdition ? (
              <>
                Después abre la extensión: se conecta sola con Chambapp local en{' '}
                <code className="mono">{DEFAULT_LOCAL_ORIGIN}</code>. Si usas otro puerto, cámbialo
                en <strong>⋯ → Ajustes → Conexión</strong>.
              </>
            ) : (
              <>
                Después abre la extensión e inicia sesión con <strong>la misma cuenta</strong> que
                usas aquí.
              </>
            )}
          </p>
          <Mock label="Icono de Chambapp fijado en la barra y pantalla de acceso">
            <div className="ext-pin">
              <span className="ext-pin__bar">
                <Icon name="search" size={12} />
                <span className="ext-pin__icons">
                  <img src="/brand/favicon.svg" alt="" width={16} height={16} />
                  <Icon name="kanban" size={14} />
                </span>
              </span>
              <span className="ext-pin__popup">
                <strong>Conecta tu cuenta</strong>
                <i />
                <i />
                <b>Iniciar sesión</b>
              </span>
            </div>
          </Mock>
          <Live
            ok={extension.connected}
            okText={isLocalEdition ? 'Conectada con Chambapp local.' : 'Conectada con tu cuenta.'}
            waitText={
              extension.available
                ? isLocalEdition
                  ? 'Instalada. Abre la extensión y comprueba en Ajustes → Conexión que apunta a esta dirección.'
                  : 'Instalada. Falta iniciar sesión en la extensión con esta cuenta.'
                : 'Primero instala la extensión (paso anterior).'
            }
          />
        </>
      );
    case 'odoo':
      return (
        <>
          <p>
            Para importar tareas y enviar partes, en la extensión abre el menú{' '}
            <strong>⋯ → Ajustes</strong>, escribe la dirección de tu Odoo (por ejemplo{' '}
            <code className="mono">https://empresa.odoo.com</code>) y pulsa{' '}
            <strong>Guardar y conceder permiso</strong>. Elige también el formato de fecha con el
            que tu Odoo muestra los partes.
          </p>
          <Live
            ok={!!extension.odooOrigin}
            okText={`Odoo conectado: ${extension.odooOrigin ?? ''}`}
            waitText="Odoo aún sin configurar. Si no usas Odoo puedes saltarte este paso."
          />
          <p className="field__hint">
            La extensión solo pide permiso para esa dirección. Las contraseñas funcionan sin Odoo.
          </p>
        </>
      );
    default:
      return (
        <>
          <p>Ya puedes usar la extensión desde el icono de la barra:</p>
          <div className="ext-summary">
            {[
              {
                icon: 'tasks' as const,
                title: 'Importa tareas',
                text: 'Abre una tarea en Odoo: el icono muestra «+» y la añades con un clic.',
              },
              {
                icon: 'send' as const,
                title: 'Envía partes',
                text: 'En Parte semanal, «Enviar a Odoo» crea la línea y la marca como imputada.',
              },
              {
                icon: 'key' as const,
                title: 'Rellena contraseñas',
                text: 'Desbloquea la bóveda con tu clave maestra y rellena los accesos.',
              },
            ].map((item) => (
              <div key={item.title} className="ext-summary__item">
                <Icon name={item.icon} size={18} />
                <strong>{item.title}</strong>
                <span className="dim">{item.text}</span>
              </div>
            ))}
          </div>
          <div className="actions">
            <Link className="button button--secondary" to={paths.timesheet} onClick={onClose}>
              <Icon name="grid" size={14} /> Ir a Parte semanal
            </Link>
            <Link className="button button--secondary" to={paths.passwords} onClick={onClose}>
              <Icon name="key" size={14} /> Ir a Contraseñas
            </Link>
          </div>
          <p className="field__hint">Puedes volver a ver este tutorial en Ajustes → Extensión.</p>
        </>
      );
  }
}

export function ExtensionTutorial({
  initialStep = 0,
  downloadOnOpen = false,
  onClose,
}: {
  initialStep?: number;
  /** Start the download as soon as it opens (the sidebar button). */
  downloadOnOpen?: boolean;
  onClose: () => void;
}) {
  const extension = useExtension();
  const [browser, setBrowser] = useState<BrowserKind>(() => browserKind(navigator.userAgent));
  const [info, setInfo] = useState<PackageInfo | null>(null);
  const [download, setDownload] = useState<DownloadState>({
    status: downloadOnOpen ? 'starting' : 'idle',
  });
  const steps = stepsFor(browser, info?.firefoxSigned ?? false);
  const [index, setIndex] = useState(initialStep);
  const current = steps[Math.min(index, steps.length - 1)]!;
  const position = steps.indexOf(current);
  const done: Partial<Record<StepId, boolean>> = {
    download: download.status === 'started' || extension.available,
    load: extension.available,
    'firefox-install': extension.available,
    'firefox-temporary': extension.available,
    signin: extension.connected,
    odoo: !!extension.odooOrigin,
  };

  function start(kind: BrowserKind, packageInfo: PackageInfo | null) {
    setDownload({ status: 'starting' });
    void downloadExtension(kind, packageInfo).then(setDownload);
  }

  // Package info first (is the Firefox file signed?), then the download if asked.
  const started = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void loadPackageInfo().then((value) => {
      if (cancelled) return;
      setInfo(value);
      if (downloadOnOpen && !started.current) {
        started.current = true;
        setDownload({ status: 'starting' });
        void downloadExtension(browserKind(navigator.userAgent), value).then((result) => {
          if (!cancelled) setDownload(result);
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [downloadOnOpen]);

  // While open, ask the extension every 2 s so each step reacts as soon as it is done.
  const { refresh } = extension;
  useEffect(() => {
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
  }, [refresh]);

  function go(next: number) {
    setIndex(Math.max(0, Math.min(steps.length - 1, next)));
  }
  function close() {
    rememberTutorialStep(null);
    onClose();
  }

  return (
    <Modal
      open
      onClose={close}
      title="Instala la extensión de Chambapp"
      description="Sigue los pasos; esta ventana detecta la extensión en cuanto la instalas."
      className="ext-tutorial"
    >
      <div className="segmented ext-browser" role="group" aria-label="Tu navegador">
        {(['chrome', 'edge', 'firefox'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={browser === kind}
            onClick={() => {
              if (kind === browser) return;
              setBrowser(kind);
              setIndex(0);
              setDownload({ status: 'idle' });
            }}
          >
            {browserNames[kind]}
          </button>
        ))}
      </div>
      <ol
        className="ext-steps"
        style={{ '--ext-steps': steps.length } as CSSProperties}
        aria-label="Pasos"
      >
        {steps.map((item, at) => (
          <li key={item.id}>
            <button
              type="button"
              className={`ext-steps__dot ${at === position ? 'ext-steps__dot--current' : ''} ${done[item.id] || at < position ? 'ext-steps__dot--done' : ''}`}
              aria-current={at === position ? 'step' : undefined}
              aria-label={`Paso ${at + 1}: ${item.title}`}
              title={item.title}
              onClick={() => go(at)}
            >
              {done[item.id] ? <Icon name="check" size={12} /> : at + 1}
            </button>
            <span className="ext-steps__label">{item.short}</span>
          </li>
        ))}
      </ol>
      <section className="ext-step" aria-live="polite" key={`${browser}-${current.id}`}>
        <header className="ext-step__header">
          <span className="ext-step__icon">
            <Icon name={current.icon} size={20} />
          </span>
          <div>
            <p className="eyebrow">
              Paso {position + 1} de {steps.length}
            </p>
            <h3>{current.title}</h3>
          </div>
        </header>
        <div className="ext-step__body">
          <StepBody
            id={current.id}
            browser={browser}
            info={info}
            download={download}
            onDownload={() => start(browser, info)}
            onReload={() => {
              rememberTutorialStep(position);
              window.location.reload();
            }}
            onClose={close}
          />
        </div>
      </section>
      <footer className="ext-tutorial__footer">
        <Button
          variant="ghost"
          icon="left"
          disabled={position === 0}
          onClick={() => go(position - 1)}
        >
          Atrás
        </Button>
        <span className="ext-tutorial__progress" aria-hidden="true">
          <span style={{ width: `${((position + 1) / steps.length) * 100}%` }} />
        </span>
        {position < steps.length - 1 ? (
          <Button variant="primary" onClick={() => go(position + 1)}>
            {current.id === 'odoo' && !done.odoo ? 'Saltar' : 'Siguiente'}
            <Icon name="right" size={14} />
          </Button>
        ) : (
          <Button variant="primary" icon="check" onClick={close}>
            Terminar
          </Button>
        )}
      </footer>
    </Modal>
  );
}
