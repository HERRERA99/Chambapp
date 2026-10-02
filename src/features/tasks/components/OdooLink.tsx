import type { Task } from '../../../domain/models';
import { isOdooUrl } from '../../../domain/odoo';
import { Icon } from '../../../shared/ui/Icon';
import '../odoo.css';

export function OdooLink({
  task,
  className = '',
}: {
  task?: Pick<Task, 'odoo_id' | 'odoo_url' | 'titulo'>;
  className?: string;
}) {
  if (!task?.odoo_id && !task?.odoo_url) return null;
  const label = task.odoo_id ? `${task.odoo_id} · Odoo` : 'Abrir en Odoo';
  if (!isOdooUrl(task.odoo_url)) {
    return task.odoo_id ? (
      <span className={`odoo-reference mono ${className}`}>{label}</span>
    ) : null;
  }
  return (
    <a
      className={`odoo-reference odoo-reference--link ${className}`}
      href={task.odoo_url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Abrir ${task.odoo_id ?? task.titulo} en Odoo (nueva pestaña)`}
      title={`Abrir ${task.titulo} en Odoo`}
    >
      <span>{label}</span>
      <Icon name="up" size={14} />
    </a>
  );
}
