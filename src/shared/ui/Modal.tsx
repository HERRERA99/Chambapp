import { useEffect, useRef, useId } from 'react';
import type { ReactNode } from 'react';
import { IconButton } from './Button';

export function Modal({ open, onClose, title, description, children }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="modal" aria-labelledby={id} aria-describedby={description ? `${id}-description` : undefined} onCancel={event => { event.preventDefault(); onClose(); }}><div className="modal__header"><div><p className="eyebrow">Vista previa · Sin persistencia</p><h2 id={id}>{title}</h2></div><IconButton icon="close" label="Cerrar diálogo" onClick={onClose} /></div>{description ? <p className="muted" id={`${id}-description`}>{description}</p> : null}{children}</dialog>;
}
