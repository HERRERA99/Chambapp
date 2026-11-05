import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { CredentialRow, Project } from '../../domain/models';
import { Modal } from '../../shared/ui/Modal';
import { Button, IconButton } from '../../shared/ui/Button';
import { InputField, SelectField } from '../../shared/ui/FormField';
import { DataError, readableError } from '../../lib/supabase/errors';
import { executeCommand } from '../../lib/supabase/workspace.repository';
import { fetchCredentialRow } from '../../lib/supabase/vault.repository';
import { reconcilePending } from '../notes/notesDraft';
import { useVault } from '../vault/useVault';
import {
  CREDENTIAL_LIMITS,
  MAX_CREDENTIAL_ENVELOPE,
  credentialProblem,
  generatePassword,
  newField,
  normalizeCredential,
} from './credentials.model';
import type { CredentialField, CredentialSecret } from './credentials.model';
import { encryptCredential, openCredential } from './credentials.model';

type Pending = {
  id: string;
  version?: number;
  proyecto_id: string;
  cifrado: string;
  boveda_generacion: string;
  /** Form state the request was built from. */
  snapshot: string;
};

export function CredentialEditor({
  userId,
  projects,
  initial,
  row,
  defaultProject,
  onClose,
  onSaved,
}: {
  userId: string;
  projects: Project[];
  initial: CredentialSecret;
  /** Stored entry being edited; absent for a new one. */
  row?: CredentialRow;
  defaultProject: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const vault = useVault();
  const [id] = useState(() => row?.id ?? crypto.randomUUID());
  const [base, setBase] = useState(row);
  const [projectId, setProjectId] = useState(row?.proyecto_id ?? defaultProject);
  const [secret, setSecret] = useState(initial);
  const [visible, setVisible] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  // Request with an unknown outcome: retried byte for byte after checking the stored row.
  const pending = useRef<Pending | null>(null);
  const [initialSnapshot] = useState(() =>
    JSON.stringify([row?.proyecto_id ?? defaultProject, initial]),
  );
  const snapshot = JSON.stringify([projectId, secret]);
  const dirty = snapshot !== initialSnapshot;

  function updateField(fieldId: string, change: Partial<CredentialField>) {
    setSecret((current) => ({
      ...current,
      campos: current.campos.map((field) =>
        field.id === fieldId ? { ...field, ...change } : field,
      ),
    }));
  }
  function toggleVisible(fieldId: string) {
    setVisible((current) => {
      const next = new Set(current);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }
  function close() {
    if (busy) return;
    if (dirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose();
  }

  async function send(request: Pending) {
    const { snapshot: _snapshot, ...payload } = request;
    void _snapshot;
    return executeCommand<CredentialRow>('guardar_credencial', payload, undefined, userId);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setConfirmClose(false);
    const problem = projectId ? credentialProblem(secret) : 'Elige el proyecto de la entrada.';
    if (problem) {
      setError(problem);
      return;
    }
    if (!vault.key || !vault.generation) {
      setError('Desbloquea la bóveda para guardar.');
      return;
    }
    setBusy(true);
    try {
      let current = base;
      const previous = pending.current;
      if (previous) {
        const stored = await fetchCredentialRow(userId, id);
        const outcome = reconcilePending(previous, stored);
        if (outcome === 'conflict') {
          pending.current = null;
          throw new Error(
            'La entrada ha cambiado en otra sesión mientras se guardaba. Cierra y vuelve a abrirla.',
          );
        }
        current = outcome === 'confirmed' ? stored! : await send(previous);
        pending.current = null;
        setBase(current);
        if (previous.snapshot === snapshot) {
          onSaved('Entrada guardada.');
          return;
        }
      }
      const normalized = normalizeCredential(secret);
      const cifrado = await encryptCredential(vault.key, userId, id, normalized);
      if (cifrado.length > MAX_CREDENTIAL_ENVELOPE)
        throw new Error('La entrada es demasiado grande. Reduce el texto de sus campos.');
      const request: Pending = {
        id,
        version: current?.version,
        proyecto_id: projectId,
        cifrado,
        boveda_generacion: vault.generation,
        snapshot,
      };
      pending.current = request;
      const saved = await send(request);
      pending.current = null;
      setBase(saved);
      // Confirms that the stored envelope opens with the current key.
      const opened = await openCredential(vault.key, userId, vault.generation, saved);
      onSaved(opened.secret ? 'Entrada guardada.' : 'Entrada guardada, pero no se pudo verificar.');
    } catch (cause) {
      if (cause instanceof DataError && !cause.retryable) pending.current = null;
      vault.handleError(cause);
      setError(readableError(cause));
    } finally {
      setBusy(false);
    }
  }

  const liveProjects = projects.filter(
    (project) => !project.archivado_en || project.id === projectId,
  );
  return (
    <Modal
      open
      size="wide"
      onClose={close}
      title={row ? 'Editar entrada' : 'Nueva entrada'}
      description="Todo el contenido se cifra con tu clave maestra antes de guardarse."
    >
      <form className="credential-editor" onSubmit={submit} noValidate>
        <div className="credential-editor__main">
          <SelectField
            label="Proyecto"
            value={projectId}
            required
            disabled={busy}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="" disabled>
              Elige un proyecto
            </option>
            {liveProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.nombre}
                {project.archivado_en ? ' (archivado)' : ''}
              </option>
            ))}
          </SelectField>
          <InputField
            label="Nombre"
            value={secret.nombre}
            required
            maxLength={CREDENTIAL_LIMITS.nombre}
            placeholder="Por ejemplo, Panel de administración"
            disabled={busy}
            autoComplete="off"
            onChange={(event) => setSecret({ ...secret, nombre: event.target.value })}
          />
          <InputField
            label="Dirección (opcional)"
            type="url"
            value={secret.url}
            maxLength={CREDENTIAL_LIMITS.url}
            placeholder="https://"
            disabled={busy}
            autoComplete="off"
            onChange={(event) => setSecret({ ...secret, url: event.target.value })}
          />
        </div>
        <div className="credential-editor__fields">
          <div className="credential-editor__fields-heading">
            <h3>Campos</h3>
            <span className="dim">
              {secret.campos.length} / {CREDENTIAL_LIMITS.campos}
            </span>
          </div>
          {secret.campos.map((field, index) => {
            const shown = !field.secreto || visible.has(field.id);
            return (
              <div className="credential-field-row" key={field.id}>
                <InputField
                  label={`Nombre del campo ${index + 1}`}
                  value={field.etiqueta}
                  maxLength={CREDENTIAL_LIMITS.etiqueta}
                  placeholder="Usuario, Contraseña, Dominio…"
                  disabled={busy}
                  autoComplete="off"
                  onChange={(event) => updateField(field.id, { etiqueta: event.target.value })}
                />
                <InputField
                  label={field.etiqueta.trim() || `Valor ${index + 1}`}
                  className="credential-field-row__value"
                  type={shown ? 'text' : 'password'}
                  value={field.valor}
                  maxLength={CREDENTIAL_LIMITS.valor}
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => updateField(field.id, { valor: event.target.value })}
                />
                <div className="credential-field-row__actions">
                  <label className="credential-field-row__secret">
                    <input
                      type="checkbox"
                      checked={field.secreto}
                      disabled={busy}
                      onChange={(event) => updateField(field.id, { secreto: event.target.checked })}
                    />
                    Oculto
                  </label>
                  {field.secreto ? (
                    <>
                      <IconButton
                        icon={shown ? 'eyeOff' : 'eye'}
                        label={shown ? 'Ocultar valor' : 'Mostrar valor'}
                        onClick={() => toggleVisible(field.id)}
                      />
                      <IconButton
                        icon="generate"
                        label="Generar contraseña segura"
                        disabled={busy}
                        onClick={() => {
                          updateField(field.id, { valor: generatePassword() });
                          setVisible((current) => new Set(current).add(field.id));
                        }}
                      />
                    </>
                  ) : null}
                  <IconButton
                    icon="trash"
                    label={`Quitar el campo ${field.etiqueta.trim() || index + 1}`}
                    disabled={busy || secret.campos.length <= 1}
                    onClick={() =>
                      setSecret({
                        ...secret,
                        campos: secret.campos.filter((item) => item.id !== field.id),
                      })
                    }
                  />
                </div>
              </div>
            );
          })}
          <Button
            icon="plus"
            variant="ghost"
            disabled={busy || secret.campos.length >= CREDENTIAL_LIMITS.campos}
            onClick={() => setSecret({ ...secret, campos: [...secret.campos, newField()] })}
          >
            Añadir campo
          </Button>
        </div>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        {confirmClose ? (
          <p className="form-error" role="alert">
            Tienes cambios sin guardar. Pulsa Cancelar otra vez para descartarlos.
          </p>
        ) : null}
        <div className="actions credential-editor__footer">
          <Button disabled={busy} onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" icon="lock" disabled={busy}>
            {busy ? 'Cifrando y guardando…' : 'Guardar entrada'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
