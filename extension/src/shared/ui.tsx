import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Icon } from '../../../src/shared/ui/Icon';
import type { IconName } from '../../../src/shared/ui/Icon';

export { Icon };
export type { IconName };

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'secondary',
  icon,
  block,
  children,
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: IconName;
  block?: boolean;
}) {
  return (
    <button
      type={type}
      className={`button button--${variant} ${block ? 'button--block' : ''} ${className}`}
      {...props}
    >
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button type="button" className="icon-button" aria-label={label} title={label} {...props}>
      <Icon name={icon} size={15} />
    </button>
  );
}

export function Notice({
  icon = 'info',
  title,
  children,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="notice">
      <Icon name={icon} size={16} />
      <div>
        <strong>{title}</strong>
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return children ? (
    <p className="form-error" role="alert">
      {children}
    </p>
  ) : null;
}
