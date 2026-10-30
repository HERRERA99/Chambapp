import type { ReactNode } from 'react';
import { Icon } from './Icon';
import type { IconName } from './Icon';

export function Panel({
  title,
  eyebrow,
  icon,
  action,
  children,
  className = '',
  id,
}: {
  title?: string;
  eyebrow?: string;
  icon?: IconName;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`panel ${className}`}>
      {title ? (
        <div className="panel__header">
          <div>
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2>
              {icon ? <Icon name={icon} /> : null}
              {title}
            </h2>
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function Progress({
  value,
  label,
  tone = 'accent',
}: {
  value: number;
  label: string;
  tone?: 'accent' | 'soft' | 'warning';
}) {
  return (
    <div
      className={`progress progress--${tone}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.max(0, Math.min(value, 100)))}
    >
      <span style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
    </div>
  );
}

const noticeIcons = {
  info: 'info',
  success: 'success',
  warning: 'alert',
  danger: 'alert',
} as const;

export function Notice({
  title,
  children,
  icon,
  tone = 'info',
  className = '',
}: {
  title: string;
  children?: ReactNode;
  icon?: IconName;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  className?: string;
}) {
  return (
    <div className={`notice notice--${tone} ${className}`}>
      <Icon name={icon ?? noticeIcons[tone]} />
      <div>
        <strong>{title}</strong>
        {children ? <div className="muted">{children}</div> : null}
      </div>
    </div>
  );
}
