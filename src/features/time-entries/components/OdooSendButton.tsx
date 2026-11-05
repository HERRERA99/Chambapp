import type { ReactNode } from 'react';
import { Icon } from '../../../shared/ui/Icon';
import './odoo-entry-status.css';

/**
 * Sends entries to Odoo through the Chambapp browser extension. When it cannot
 * (no extension, other account, task from another Odoo…) it stays disabled and
 * its title says why.
 */
export function OdooSendButton({
  label,
  children,
  disabledReason,
  title,
  onClick,
}: {
  label: string;
  children: ReactNode;
  /** Why it cannot send now; null when it can. */
  disabledReason: string | null;
  title?: string;
  onClick?: () => void;
}) {
  const description = disabledReason ?? title ?? 'Enviar a Odoo';
  return (
    <button
      type="button"
      className="button button--secondary odoo-send-button odoo-send-button--text"
      aria-disabled={disabledReason !== null}
      aria-label={`${description}: ${label}`}
      title={description}
      onClick={() => {
        if (disabledReason === null) onClick?.();
      }}
    >
      <Icon name="send" size={14} />
      {children}
    </button>
  );
}
