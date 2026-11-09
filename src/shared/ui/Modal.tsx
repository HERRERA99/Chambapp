import { useEffect, useRef, useId } from 'react';
import type { ReactNode } from 'react';
import { IconButton } from './Button';

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'default',
  className = '',
  aside,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: 'default' | 'wide';
  className?: string;
  /**
   * Side column next to the content (e.g. the day context of the time-entry forms).
   * `undefined`: a plain modal; `null`: the side column is hidden right now.
   */
  aside?: ReactNode;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const withAside = aside !== undefined;
  return (
    <dialog
      ref={ref}
      className={`modal ${size === 'wide' ? 'modal--wide' : ''} ${withAside && aside ? 'modal--aside' : ''} ${className}`}
      aria-labelledby={id}
      aria-describedby={description ? `${id}-description` : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal__header">
        <div>
          <p className="eyebrow">Chambapp</p>
          <h2 id={id}>{title}</h2>
        </div>
        <IconButton icon="close" label="Cerrar diálogo" onClick={onClose} />
      </div>
      {description ? (
        <p className="muted" id={`${id}-description`}>
          {description}
        </p>
      ) : null}
      {withAside ? (
        <div className={`modal__layout ${aside ? '' : 'modal__layout--single'}`}>
          <div className="page-stack">{children}</div>
          {aside}
        </div>
      ) : (
        children
      )}
    </dialog>
  );
}
