import { Link } from 'react-router-dom';

/** Chambapp mark: an open clock dial with a live Signal Orange centre. */
export function BrandMark({ className = 'brand__mark' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M20.5 12a8.5 8.5 0 1 1-2.49-6.01"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="square"
      />
      <path d="M12 7.5V12l3 1.75" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
      <circle cx="12" cy="12" r="2" fill="#ee6018" />
    </svg>
  );
}

export function Brand({
  compact = false,
  iconOnly = false,
  to = '/',
  label = 'Chambapp · Inicio',
}: {
  compact?: boolean;
  iconOnly?: boolean;
  to?: string;
  label?: string;
}) {
  return (
    <Link
      to={to}
      className={`brand ${compact ? 'brand--compact' : ''} ${iconOnly ? 'brand--icon' : ''}`}
      aria-label={label}
    >
      <BrandMark />
      {!iconOnly && (
        <span className="brand__word" aria-hidden="true">
          Chambapp
        </span>
      )}
    </Link>
  );
}
