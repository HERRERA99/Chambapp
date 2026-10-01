import { Link } from 'react-router-dom';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      className={`brand ${compact ? 'brand--compact' : ''}`}
      aria-label="Chambapp · Inicio"
    >
      <img src="/brand/chambapp.svg" alt="Chambapp" width="160" height="40" />
      {compact ? <span className="eyebrow">Operations</span> : null}
    </Link>
  );
}
