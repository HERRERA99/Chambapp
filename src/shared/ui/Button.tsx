import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import type { IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Appearance = { variant?: Variant; icon?: IconName; className?: string; children?: ReactNode };

export function Button({ variant = 'secondary', icon, className = '', children, type = 'button', ...props }: Appearance & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={`button button--${variant} ${className}`} {...props}>{icon ? <Icon name={icon} size={16} /> : null}{children}</button>;
}

export function ButtonLink({ to, variant = 'secondary', icon, className = '', children }: Appearance & { to: string }) {
  return <Link to={to} className={`button button--${variant} ${className}`}>{icon ? <Icon name={icon} size={16} /> : null}{children}</Link>;
}

export function IconButton({ icon, label, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: IconName; label: string }) {
  return <button type="button" {...props} className={`icon-button ${props.className ?? ''}`} aria-label={label} title={label}><Icon name={icon} /></button>;
}
