import type { TimeEntry } from '../../../domain/models';
import { Badge } from '../../../shared/ui/Panel';

export function OdooEntryStatus({ entry }: { entry: TimeEntry }) {
  return (
    <Badge tone={entry.imputado_en_odoo ? 'success' : 'neutral'}>
      {entry.imputado_en_odoo ? 'Imputado en Odoo' : 'Pendiente de imputar en Odoo'}
    </Badge>
  );
}
