import type { ReactNode } from 'react';
import { Icon } from '../../../shared/ui/Icon';
import './odoo-entry-status.css';

/** Placeholder: automatic logging in Odoo is not implemented yet. */
export function OdooSendButton({ label, children }: { label: string; children?: ReactNode }) {
  const title = 'Imputar automáticamente en Odoo (próximamente)';
  if (children)
    return (
      <button
        type="button"
        className="button button--secondary odoo-send-button odoo-send-button--text"
        aria-disabled="true"
        aria-label={`${title}: ${label}`}
        title={title}
      >
        <Icon name="send" size={14} />
        {children}
      </button>
    );
  return (
    <button
      type="button"
      className="icon-button odoo-send-button"
      aria-disabled="true"
      aria-label={`${title}: ${label}`}
      title={title}
    >
      <Icon name="send" size={14} />
    </button>
  );
}
