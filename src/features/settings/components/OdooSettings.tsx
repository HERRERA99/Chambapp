import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InputField } from '../../../shared/ui/FormField';
import { Panel } from '../../../shared/ui/Panel';
import { Button } from '../../../shared/ui/Button';
import { configureOdoo } from '../odooCredentials';
import { useAuth } from '../../auth/useAuth';

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

export function OdooSettings({ disabled = false }: { disabled?: boolean }) {
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
    <section id="odoo">
      <Panel title="Odoo" icon="settings">
        <p className="muted">
          {status.isPending
            ? 'Consultando configuración…'
            : status.isError
              ? 'No se pudo consultar la configuración.'
              : status.data
                ? 'Tienes una API key configurada. Introduce otra para sustituirla.'
                : 'Añade tu API key de Odoo.'}
        </p>
        <OdooApiKeyField value={key} onChange={setKey} disabled={busy} />
        <div className="actions">
          <Button disabled={busy || !key.trim()} onClick={() => void save()}>
            {saving ? 'Guardando…' : 'Guardar API key'}
          </Button>
          <Button variant="danger" disabled={busy || !status.data} onClick={() => void save(true)}>
            Eliminar API key
          </Button>
          {status.isError ? (
            <Button disabled={busy} onClick={() => void status.refetch()}>
              Reintentar
            </Button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="warning">
            {error}
          </p>
        ) : null}
        {message ? <p role="status">{message}</p> : null}
      </Panel>
    </section>
  );
}
