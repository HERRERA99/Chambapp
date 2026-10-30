import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

type FieldProps = { label: string; hint?: ReactNode; error?: string; className?: string };

function describedBy(id: string, hint: unknown, error: unknown) {
  return (
    [error ? `${id}-error` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined
  );
}

function FieldMessages({ id, hint, error }: { id: string; hint?: ReactNode; error?: string }) {
  return (
    <>
      {error ? (
        <span id={`${id}-error`} className="field__error">
          {error}
        </span>
      ) : null}
      {hint ? (
        <span id={`${id}-hint`} className="field__hint">
          {hint}
        </span>
      ) : null}
    </>
  );
}

export function InputField({
  label,
  hint,
  error,
  className = '',
  id: suppliedId,
  ...props
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-describedby={describedBy(id, hint, error)}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  className = '',
  ...props
}: FieldProps & SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const id = useId();
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        aria-describedby={describedBy(id, hint, error)}
        aria-invalid={error ? true : undefined}
        {...props}
      >
        {children}
      </select>
      <FieldMessages id={id} hint={hint} error={error} />
    </div>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        {description ? <span className="muted toggle-row__description">{description}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange?.(event.target.checked)}
        disabled={disabled}
      />
      <span aria-hidden="true" className="toggle-track" />
    </label>
  );
}
