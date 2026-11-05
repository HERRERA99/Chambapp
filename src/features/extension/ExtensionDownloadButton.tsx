import { Icon } from '../../shared/ui/Icon';
import { useExtension } from './useExtension';
import './extension.css';

/** Sidebar entry: downloads the extension and opens the installation tutorial. */
export function ExtensionDownloadButton({ onClick }: { onClick?: () => void }) {
  const extension = useExtension();
  return (
    <button
      type="button"
      className="sidebar-download"
      title="Descargar la extensión de navegador y ver cómo instalarla"
      onClick={() => {
        onClick?.();
        extension.openTutorial({ download: true });
      }}
    >
      <Icon name="download" size={15} />
      <span>
        Descargar extensión
        <small>
          {extension.available ? `Instalada · v${extension.version}` : 'Chrome, Edge y Firefox'}
        </small>
      </span>
    </button>
  );
}
