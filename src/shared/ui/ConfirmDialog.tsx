import { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { readableError } from '../../lib/supabase/errors';

export function ConfirmDialog({
  open,
  title,
  description,
  onClose,
  onConfirm,
  confirmLabel = 'Confirmar',
  danger = false,
  busy = false,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    setError('');
    setPending(true);
    try {
      await onConfirm();
      onClose();
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!pending && !busy) {
          setError('');
          onClose();
        }
      }}
      title={title}
      description={description}
    >
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : null}
      <div className="form-actions">
        <Button variant="ghost" disabled={pending || busy} onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant={danger ? 'danger' : 'primary'}
          disabled={pending || busy}
          onClick={() => void confirm()}
        >
          {pending || busy ? 'Guardando…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
