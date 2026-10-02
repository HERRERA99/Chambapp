import { Link } from 'react-router-dom';

export function Brand({
  compact = false,
  to = '/',
  label = 'Chambapp · Inicio',
}: {
  compact?: boolean;
  to?: string;
  label?: string;
}) {
  return (
    <Link to={to} className={`brand ${compact ? 'brand--compact' : ''}`} aria-label={label}>
      <img src="/brand/chambapp.svg" alt="Chambapp" width="160" height="40" />
      {compact ? <span className="eyebrow">Operations</span> : null}
    </Link>
  );
}
