import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CREDENTIAL_LIMITS,
  credentialProblem,
  defaultCredential,
  generatePassword,
  newField,
} from '../../../src/features/passwords/credentials.model';
import type {
  CredentialField,
  CredentialSecret,
} from '../../../src/features/passwords/credentials.model';
import { ask } from '../shared/messages';
import type { ProjectOption } from '../shared/messages';
import { Button, ErrorText, IconButton } from '../shared/ui';
import { copySecret, errorMessage } from '../shared/feedback';

type Opened = { id: string; version: number; proyectoId: string; secret: CredentialSecret };

function Generator({ onUse }: { onUse: (value: string) => void }) {
  const [size, setSize] = useState(20);
  const [value, setValue] = useState(() => generatePassword(20));
  return (
    <div className="panel stack stack--tight">
      <div className="row">
        <span className="label">Generador</span>
        <span className="spacer" />
        <span className="mono">{size} caracteres</span>
      </div>
      <input
        type="range"
        min={12}
        max={64}
        value={size}
        aria-label="Longitud"
        onChange={(event) => {
          const next = Number(event.target.value);
          setSize(next);
          setValue(generatePassword(next));
        }}
      />
      <div className="secret-field">
        <span className="secret-field__value mono">{value}</span>
        <IconButton
          icon="refresh"
          label="Generar otra"
          onClick={() => setValue(generatePassword(size))}
        />
        <IconButton icon="copy" label="Copiar" onClick={() => void copySecret(value)} />
      </div>
      <Button onClick={() => onUse(value)}>Usar esta contraseña</Button>
    </div>
  );
}

export function CredentialForm({
  id,
  projects,
  defaults,
  onCancel,
  onSaved,
}: {
  id: string | null;
  projects: ProjectOption[];
  defaults: { url: string; name: string };
  onCancel: () => void;
  onSaved: (id: string) => Promise<void> | void;
}) {
  const [opened, setOpened] = useState<Opened | null>(null);
  // A new entry keeps this id across retries, so a save whose answer was lost is not duplicated.
  const [newId] = useState(() => crypto.randomUUID());
  const [secret, setSecret] = useState<CredentialSecret | null>(
    id ? null : { ...defaultCredential(), nombre: defaults.name, url: defaults.url },
  );
  const [project, setProject] = useState(projects[0]?.id ?? '');
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [generatorFor, setGeneratorFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    ask<Opened>({ type: 'credential-open', id }).then(
      (value) => {
        setOpened(value);
        setSecret(value.secret);
        setProject(value.proyectoId);
      },
      (cause) => setError(errorMessage(cause)),
    );
  }, [id]);

  if (!secret) return error ? <ErrorText>{error}</ErrorText> : <p className="dim">Abriendo…</p>;

  function updateField(fieldId: string, change: Partial<CredentialField>) {
    setSecret((current) =>
      current
        ? {
            ...current,
            campos: current.campos.map((field) =>
              field.id === fieldId ? { ...field, ...change } : field,
            ),
          }
        : current,
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!secret) return;
    const problem = project ? credentialProblem(secret) : 'Elige el proyecto de la entrada.';
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await ask<{ id: string }>({
        type: 'credential-save',
        id: opened?.id ?? newId,
        version: opened?.version ?? null,
        proyectoId: project,
        secret,
      });
      await onSaved(saved.id);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <div className="row">
        <IconButton icon="left" label="Volver" onClick={onCancel} />
        <h2 style={{ fontSize: 15 }}>{id ? 'Editar entrada' : 'Nueva entrada'}</h2>
      </div>
      <div className="field">
        <label htmlFor="cred-name">Nombre</label>
        <input
          id="cred-name"
          value={secret.nombre}
          maxLength={CREDENTIAL_LIMITS.nombre}
          onChange={(event) => setSecret({ ...secret, nombre: event.target.value })}
          required
          disabled={busy}
        />
      </div>
      <div className="field">
        <label htmlFor="cred-url">Dirección web</label>
        <input
          id="cred-url"
          type="url"
          placeholder="https://"
          value={secret.url}
          maxLength={CREDENTIAL_LIMITS.url}
          onChange={(event) => setSecret({ ...secret, url: event.target.value })}
          disabled={busy}
        />
      </div>
      <div className="field">
        <label htmlFor="cred-project">Proyecto</label>
        <select
          id="cred-project"
          value={project}
          onChange={(event) => setProject(event.target.value)}
          required
          disabled={busy}
        >
          <option value="" disabled>
            Elige un proyecto
          </option>
          {projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nombre}
            </option>
          ))}
        </select>
      </div>
      <div className="stack stack--tight">
        <span className="label">Campos</span>
        {secret.campos.map((field) => (
          <div key={field.id} className="field-row">
            <div className="stack stack--tight">
              <input
                aria-label="Nombre del campo"
                placeholder="Nombre del campo"
                value={field.etiqueta}
                maxLength={CREDENTIAL_LIMITS.etiqueta}
                onChange={(event) => updateField(field.id, { etiqueta: event.target.value })}
                disabled={busy}
              />
              <input
                aria-label={`Valor de ${field.etiqueta || 'campo'}`}
                type={field.secreto && !visible.has(field.id) ? 'password' : 'text'}
                autoComplete="off"
                className="mono"
                value={field.valor}
                maxLength={CREDENTIAL_LIMITS.valor}
                onChange={(event) => updateField(field.id, { valor: event.target.value })}
                disabled={busy}
              />
              <label className="row dim">
                <input
                  type="checkbox"
                  checked={field.secreto}
                  onChange={(event) => updateField(field.id, { secreto: event.target.checked })}
                  disabled={busy}
                />
                Secreto
              </label>
              {generatorFor === field.id ? (
                <Generator
                  onUse={(value) => {
                    updateField(field.id, { valor: value });
                    setGeneratorFor(null);
                  }}
                />
              ) : null}
            </div>
            <div className="stack stack--tight">
              {field.secreto ? (
                <IconButton
                  icon={visible.has(field.id) ? 'eyeOff' : 'eye'}
                  label={visible.has(field.id) ? 'Ocultar' : 'Mostrar'}
                  onClick={() => {
                    const next = new Set(visible);
                    if (next.has(field.id)) next.delete(field.id);
                    else next.add(field.id);
                    setVisible(next);
                  }}
                />
              ) : null}
              {field.secreto ? (
                <IconButton
                  icon="generate"
                  label="Generar contraseña"
                  onClick={() => setGeneratorFor(generatorFor === field.id ? null : field.id)}
                />
              ) : null}
              <IconButton
                icon="trash"
                label={`Quitar ${field.etiqueta || 'campo'}`}
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
        ))}
        <Button
          variant="ghost"
          icon="plus"
          disabled={busy || secret.campos.length >= CREDENTIAL_LIMITS.campos}
          onClick={() => setSecret({ ...secret, campos: [...secret.campos, newField()] })}
        >
          Añadir campo
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="row row--end">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}
