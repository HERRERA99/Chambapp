import type { ReactNode } from 'react';
import { Button } from '../ui/Button';
import { usePreviewNotice } from './PreviewContext';

export function PreviewForm({ children, onClose, submitLabel = 'Previsualizar cambios' }: { children: ReactNode; onClose?: () => void; submitLabel?: string }) {
  const notify = usePreviewNotice();
  return <form className="form-stack" onSubmit={event => { event.preventDefault(); notify('Vista previa: los datos no se han guardado ni enviado.'); onClose?.(); }}>{children}<p className="field__hint">Formulario de demostración. No guarda ni envía información.</p><div className="form-actions">{onClose ? <Button variant="ghost" onClick={onClose}>Cancelar</Button> : null}<Button type="submit" variant="primary" icon="check">{submitLabel}</Button></div></form>;
}
