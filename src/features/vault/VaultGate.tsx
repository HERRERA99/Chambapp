import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { Notice } from '../../shared/ui/Panel';
import { Icon } from '../../shared/ui/Icon';
import { readableError } from '../../lib/supabase/errors';
import { MIN_MASTER_PASSWORD_LENGTH } from '../../lib/crypto/vault';
import { paths } from '../../app/paths';
import { useVault } from './useVault';
import './vault.css';

/** PostgREST reports an unknown table when the migration has not been applied. */
function missingMigration(error: unknown) {
  const text =
    error && typeof error === 'object'
      ? `${(error as { code?: unknown }).code ?? ''} ${(error as { rawMessage?: unknown }).rawMessage ?? ''}`
      : '';
  return /PGRST205|bovedas/.test(text);
}

/** Renders `children` only while the vault is unlocked; otherwise asks for the master password. */
export function VaultGate({ children, purpose }: { children: ReactNode; purpose: string }) {
  const vault = useVault();
  if (vault.status === 'unlocked') return <>{children}</>;
  if (vault.status === 'loading')
    return (
      <div className="empty-state" role="status">
        Comprobando el cifrado…
      </div>
    );
  if (vault.status === 'error')
    return (
      <Notice title="No se pudo comprobar el cifrado">
        <p>
          {missingMigration(vault.error)
            ? 'Falta aplicar en Supabase la migración del cifrado (npm run db:migrate).'
            : readableError(vault.error)}
        </p>
        <Button onClick={() => void vault.reload()}>Reintentar</Button>
      </Notice>
    );
  return <VaultUnlockCard purpose={purpose} />;
}

/** Create or unlock form, also used inline (for example in a task's notes). */
export function VaultUnlockCard({
  purpose,
  compact = false,
}: {
  purpose: string;
  compact?: boolean;
}) {
  const vault = useVault();
  const creating = vault.status === 'missing';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (creating) {
      if ([...password].length < MIN_MASTER_PASSWORD_LENGTH) {
        setError(`La clave maestra debe tener al menos ${MIN_MASTER_PASSWORD_LENGTH} caracteres.`);
        return;
      }
      if (password !== confirmation) {
        setError('Las dos claves no coinciden.');
        return;
      }
    }
    setBusy(true);
    try {
      if (creating) await vault.create(password);
      else await vault.unlock(password);
    } catch (cause) {
      setError(readableError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`vault-card ${compact ? 'vault-card--compact' : ''}`}>
      <div className="vault-card__mark" aria-hidden="true">
        <Icon name={creating ? 'shield' : 'lock'} size={compact ? 20 : 28} />
      </div>
      <div className="vault-card__body">
        <p className="eyebrow">Cifrado de extremo a extremo</p>
        <h2>{creating ? 'Crea tu clave maestra' : 'Desbloquea con tu clave maestra'}</h2>
        <p className="muted">
          {creating
            ? `${purpose} se cifran en este navegador antes de guardarse. Ni Chambapp ni Supabase pueden leerlos.`
            : `${purpose} están cifrados. Introduce tu clave maestra para verlos; se bloquearán tras 15 minutos sin actividad.`}
        </p>
        {creating ? (
          <p className="vault-card__warning">
            <Icon name="info" size={15} />
            Si olvidas la clave maestra no hay forma de recuperar los datos cifrados.
          </p>
        ) : null}
        <form className="vault-card__form" onSubmit={submit}>
          <InputField
            label="Clave maestra"
            type="password"
            autoComplete={creating ? 'new-password' : 'current-password'}
            value={password}
            minLength={creating ? MIN_MASTER_PASSWORD_LENGTH : undefined}
            required
            disabled={busy}
            onChange={(event) => setPassword(event.target.value)}
            hint={creating ? `Mínimo ${MIN_MASTER_PASSWORD_LENGTH} caracteres.` : undefined}
          />
          {creating ? (
            <InputField
              label="Repite la clave maestra"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              required
              disabled={busy}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          ) : null}
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="actions">
            <Button
              type="submit"
              variant="primary"
              icon={creating ? 'shield' : 'unlock'}
              disabled={busy}
            >
              {busy
                ? creating
                  ? 'Creando…'
                  : 'Desbloqueando…'
                : creating
                  ? 'Crear clave maestra'
                  : 'Desbloquear'}
            </Button>
            {!creating && !compact ? (
              <ButtonLink to={`${paths.settings}#seguridad`} variant="ghost">
                ¿La has olvidado?
              </ButtonLink>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
