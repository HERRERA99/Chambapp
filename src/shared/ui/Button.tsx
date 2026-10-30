import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import type { IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';
type Appearance = {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  className?: string;
  children?: ReactNode;
};

function classes(variant: Variant, size: Size, className: string) {
  return `button button--${variant} ${size === 'sm' ? 'button--sm' : ''} ${className}`;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  className = '',
  children,
  type = 'button',
  loading = false,
  ...props
}: Appearance & ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      type={type}
      className={classes(variant, size, className)}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Icon name="loader" size={16} className="spin" />
      ) : icon ? (
        <Icon name={icon} size={16} />
      ) : null}
      {children}
    </button>
  );
}

export function ButtonLink({
  to,
  variant = 'secondary',
  size = 'md',
  icon,
  className = '',
  children,
}: Appearance & { to: string }) {
  return (
    <Link to={to} className={classes(variant, size, className)}>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </Link>
  );
}

export function IconButton({
  icon,
  label,
  tooltip = true,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon: IconName;
  label: string;
  tooltip?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`icon-button ${props.className ?? ''}`}
      aria-label={label}
      title={tooltip ? label : undefined}
    >
      <Icon name={icon} />
    </button>
  );
}
