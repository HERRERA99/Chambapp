import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InputField } from '../../../shared/ui/FormField';
import { Badge, Notice } from '../../../shared/ui/Panel';
import { Button } from '../../../shared/ui/Button';
import { configureOdoo } from '../odooCredentials';
import { useAuth } from '../../auth/useAuth';
import { SettingsSection } from './SettingRow';

export function OdooApiKeyField({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <InputField
      label="API key de Odoo"
      type="password"
      autoComplete="new-password"
      value={value}
      maxLength={4096}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Introduce tu API key"
      hint="Se guarda de forma privada. Puedes sustituirla o eliminarla desde Ajustes. La clave no activa la imputación automática."
    />
  );
}

export function OdooSettings({
  disabled = false,
  hidden = false,
}: {
  disabled?: boolean;
  hidden?: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ['odoo-credentials', user?.id];
  const status = useQuery({ queryKey, queryFn: () => configureOdoo(), enabled: !!user });
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const busy = disabled || saving;
  async function save(remove = false) {
    if (busy) return;
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const configured = await configureOdoo(remove ? '' : key, true);
      queryClient.setQueryData(queryKey, configured);
      setKey('');
      setMessage(configured ? 'API key guardada.' : 'API key eliminada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la clave.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <SettingsSection
      id="odoo"
      title="Odoo"
      description="Credencial para conectar con Odoo. La marca «Imputado en Odoo» de cada parte es manual y no depende de esta clave."
      hidden={hidden}
      badge={
        status.isPending ? (
          <Badge>Consultando…</Badge>
        ) : status.isError ? (
          <Badge tone="warning">Estado desconocido</Badge>
        ) : status.data ? (
          <Badge tone="success">Clave configurada</Badge>
        ) : (
          <Badge>Sin clave</Badge>
        )
      }
    >
      <Notice title="Se guarda por separado">
        Los botones de esta sección guardan o eliminan la clave al momento. No forman parte de
        «Guardar cambios».
      </Notice>
      <div className="settings-section__form">
        <OdooApiKeyField value={key} onChange={setKey} disabled={busy} />
        <div className="actions">
          <Button
            variant="primary"
            loading={saving}
            disabled={busy || !key.trim()}
            onClick={() => void save()}
          >
            {status.data ? 'Sustituir API key' : 'Guardar API key'}
          </Button>
          <Button variant="danger" disabled={busy || !status.data} onClick={() => void save(true)}>
            Eliminar API key
          </Button>
          {status.isError ? (
            <Button icon="refresh" disabled={busy} onClick={() => void status.refetch()}>
              Reintentar
            </Button>
          ) : null}
        </div>
        {status.isError ? (
          <p className="field__hint">No se pudo consultar si ya tienes una clave guardada.</p>
        ) : null}
        {error ? (
          <div role="alert">
            <Notice title="No se pudo guardar la clave" tone="danger">
              {error}
            </Notice>
          </div>
        ) : null}
        {message ? (
          <div role="status">
            <Notice title={message} tone="success" />
          </div>
        ) : null}
      </div>
    </SettingsSection>
  );
}
