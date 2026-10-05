import type { TimeEntry } from '../../../domain/models';
import { Icon } from '../../../shared/ui/Icon';
import './odoo-entry-status.css';

export function OdooEntryStatus({ entry }: { entry: TimeEntry }) {
  return (
    <span
      className={`odoo-entry-status ${entry.imputado_en_odoo ? 'odoo-entry-status--imputed' : 'odoo-entry-status--pending'}`}
      aria-label={entry.imputado_en_odoo ? 'Imputado en Odoo' : 'Pendiente de imputar en Odoo'}
    >
      <Icon name={entry.imputado_en_odoo ? 'check' : 'clock'} size={12} />
      <span>Odoo · {entry.imputado_en_odoo ? 'Imputado' : 'Pendiente'}</span>
    </span>
  );
}
