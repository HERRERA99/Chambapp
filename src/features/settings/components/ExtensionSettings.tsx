import { Panel } from '../../../shared/ui/Panel';
import { Button } from '../../../shared/ui/Button';
import { useExtension } from '../../extension/useExtension';
import '../../extension/extension.css';

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className={`ext-live ${ok ? 'ext-live--ok' : ''}`}>
      <span className="ext-live__dot" aria-hidden="true" />
      {text}
    </p>
  );
}

/** Installation status of the browser extension, its tutorial and the download. */
export function ExtensionSettings() {
  const extension = useExtension();
  return (
    <section id="extension">
      <Panel title="Extensión de navegador" icon="zap">
        <p className="muted">
          Importa tareas de Odoo, envía los partes de Parte semanal a Odoo y rellena tus contraseñas
          desde Chrome, Edge o Firefox.
        </p>
        <div className="ext-settings__checks" role="status" aria-live="polite">
          <Check
            ok={extension.available}
            text={
              extension.available
                ? `Instalada en este navegador (versión ${extension.version}).`
                : 'No se detecta en este navegador.'
            }
          />
          <Check
            ok={extension.connected}
            text={
              extension.connected
                ? 'Conectada con esta cuenta.'
                : 'Sin sesión con esta cuenta: inicia sesión desde el icono de la extensión.'
            }
          />
          <Check
            ok={!!extension.odooOrigin}
            text={
              extension.odooOrigin
                ? `Odoo configurado: ${extension.odooOrigin}.`
                : 'Odoo sin configurar en la extensión (solo hace falta para los partes).'
            }
          />
        </div>
        <div className="actions">
          <Button variant="primary" icon="info" onClick={() => extension.openTutorial()}>
            Ver tutorial de instalación
          </Button>
          <Button icon="download" onClick={() => extension.openTutorial({ download: true })}>
            {extension.available ? 'Descargar la última versión' : 'Descargar extensión'}
          </Button>
        </div>
      </Panel>
    </section>
  );
}
