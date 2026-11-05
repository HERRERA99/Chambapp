import { useExtension } from './useExtension';
import './extension.css';

/** Header chip: green when the browser extension answers in this tab, red otherwise. */
export function ExtensionStatusChip() {
  const extension = useExtension();
  const label = !extension.available
    ? 'Extensión no instalada'
    : extension.connected
      ? `Extensión instalada (v${extension.version}) y conectada`
      : `Extensión instalada (v${extension.version}) sin sesión con esta cuenta`;
  return (
    <button
      type="button"
      className={`ext-status ${extension.available ? 'ext-status--on' : ''}`}
      title={`${label}. Pulsa para ver cómo instalarla y configurarla.`}
      aria-label={`${label}. Ver tutorial de la extensión`}
      onClick={() => extension.openTutorial()}
    >
      <i aria-hidden="true" />
      Extensión
    </button>
  );
}
