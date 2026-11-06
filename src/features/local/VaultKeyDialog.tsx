import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useVault } from '../vault/useVault';
import { Modal } from '../../shared/ui/Modal';
import { VaultUnlockCard } from '../vault/VaultGate';

/**
 * Create or unlock the vault from inside another form (Settings, onboarding): the card
 * has its own <form>, so it is rendered outside the page and its submit events do not
 * reach the outer form.
 */
export function VaultKeyDialog({
  open,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  onClose: () => void;
  onUnlocked?: () => void;
}) {
  const vault = useVault();
  // Done as soon as the key is in this tab.
  useEffect(() => {
    if (open && vault.status === 'unlocked') {
      onUnlocked?.();
      onClose();
    }
  }, [open, vault.status, onClose, onUnlocked]);
  if (!open || vault.status === 'unlocked') return null;
  return createPortal(
    <div onSubmit={(event) => event.stopPropagation()}>
      <Modal open title="Clave maestra" onClose={onClose}>
        <VaultUnlockCard purpose="Tus proyectos, tareas y partes locales" compact />
      </Modal>
    </div>,
    document.body,
  );
}
