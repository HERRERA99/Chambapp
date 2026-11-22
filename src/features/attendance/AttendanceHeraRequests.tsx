import type { HeraChangeRequest, HeraRequestClock } from '../extension/heraRequests';

const statusLabel = {
  concedida: 'Solicitud concedida',
  pendiente: 'Solicitud pendiente',
  denegada: 'Solicitud denegada',
  desconocido: 'Estado desconocido',
} as const;

const statusTone = {
  concedida: 'success',
  pendiente: 'warning',
  denegada: 'danger',
  desconocido: 'neutral',
} as const;

const statusOrder = ['pendiente', 'denegada', 'desconocido', 'concedida'] as const;

function clock({ kind, time }: HeraRequestClock) {
  return `${kind === 'entrada' ? 'E' : 'S'} ${time}`;
}

function requestedChange({ original, operation, change }: HeraChangeRequest) {
  return `${original ? `Fichaje ${clock(original)}` : 'Sin fichaje original'} → ${operation}${change ? ` ${clock(change)}` : ''}`;
}

function summary(item: HeraChangeRequest) {
  return [requestedChange(item), item.reason].filter(Boolean).join(' · ');
}

function statusClass(status: HeraChangeRequest['status']) {
  return `badge badge--${statusTone[status]}`;
}

export function HeraDayBadge({ items }: { items: HeraChangeRequest[] }) {
  const status = statusOrder.find((status) => items.some((item) => item.status === status));
  if (!status) return null;
  return (
    <span className={statusClass(status)} title={items.map(summary).join('\n')}>
      {statusLabel[status]}
    </span>
  );
}

export function HeraDayDetails({
  items,
  workedSeconds,
}: {
  items: HeraChangeRequest[];
  workedSeconds: number;
}) {
  if (!items.length) return null;
  const minutes = Math.floor(workedSeconds / 60);
  return (
    <section className="attendance-hera">
      <h3>Solicitudes en Hera</h3>
      <ul className="attendance-hera__list">
        {items.map((item, index) => (
          <li key={index}>
            <span className={statusClass(item.status)}>{statusLabel[item.status]}</span>{' '}
            {item.status === 'desconocido' ? <span>{item.statusText}</span> : null}
            <p>{requestedChange(item)}</p>
            {item.reason ? <p className="muted">{item.reason}</p> : null}
          </li>
        ))}
      </ul>
      {items.some((item) => item.status !== 'concedida') ? (
        <p className="attendance-hera__warning">
          Mientras no la acepten cuentan {Math.floor(minutes / 60)} h {minutes % 60} min este día.
        </p>
      ) : null}
    </section>
  );
}
