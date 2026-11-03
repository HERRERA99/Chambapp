import { Icon } from '../../../shared/ui/Icon';
import './odoo-entry-status.css';

/** Placeholder: automatic logging of an entry in Odoo is not implemented yet. */
export function OdooSendButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="icon-button odoo-send-button"
      aria-disabled="true"
      aria-label={`Imputar automáticamente en Odoo (próximamente): ${label}`}
      title="Imputar automáticamente en Odoo (próximamente)"
    >
      <Icon name="send" size={14} />
    </button>
  );
}
