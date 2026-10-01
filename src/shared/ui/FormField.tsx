import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

type FieldProps = { label: string; hint?: string; className?: string };

export function InputField({ label, hint, className = '', id: suppliedId, ...props }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return <div className={`field ${className}`}><label htmlFor={id}>{label}</label><input id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props} />{hint ? <span id={`${id}-hint`} className="field__hint">{hint}</span> : null}</div>;
}

export function SelectField({ label, hint, children, className = '', ...props }: FieldProps & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const id = useId();
  return <div className={`field ${className}`}><label htmlFor={id}>{label}</label><select id={id} aria-describedby={hint ? `${id}-hint` : undefined} {...props}>{children}</select>{hint ? <span id={`${id}-hint`} className="field__hint">{hint}</span> : null}</div>;
}

export function Toggle({ label, description, checked, onChange, disabled = false }: { label: string; description?: string; checked: boolean; onChange?: (checked: boolean) => void; disabled?: boolean }) {
  return <label className="toggle-row"><span><strong>{label}</strong>{description ? <span className="muted toggle-row__description">{description}</span> : null}</span><input type="checkbox" role="switch" checked={checked} onChange={event => onChange?.(event.target.checked)} disabled={disabled} /><span aria-hidden="true" className="toggle-track" /></label>;
}
