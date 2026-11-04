import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CredentialRow, Project } from '../../domain/models';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Button, ButtonLink, IconButton } from '../../shared/ui/Button';
import { InputField, SelectField } from '../../shared/ui/FormField';
import { Badge, Notice } from '../../shared/ui/Panel';
import { Icon } from '../../shared/ui/Icon';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { readableError } from '../../lib/supabase/errors';
import { executeCommand } from '../../lib/supabase/workspace.repository';
import { paths } from '../../app/paths';
import { useAuth } from '../auth/useAuth';
import { useWorkspace } from '../workspace/useWorkspace';
import { VaultGate } from '../vault/VaultGate';
import { useVault } from '../vault/useVault';
import { CredentialEditor } from './CredentialEditor';
import { credentialMatches, defaultCredential, safeUrl } from './credentials.model';
import type { CredentialField, CredentialSecret } from './credentials.model';
import { useCredentials } from './useCredentials';
import type { OpenCredential } from './useCredentials';
import './passwords.css';

const CLIPBOARD_CLEAR_MS = 30_000;

export default function PasswordsPage() {
  const { user } = useAuth();
  return (
    <VaultGate purpose="Tus contraseñas">
      <PasswordsWorkspace key={user?.id} />
    </VaultGate>
  );
}

type Editing = { secret: CredentialSecret; row?: CredentialRow };

function PasswordsWorkspace() {
  const { user } = useAuth();
  const vault = useVault();
  const notify = useFeedback();
  const queryClient = useQueryClient();
  const { data, error: workspaceError, reload } = useWorkspace();
  const { query, items, ready } = useCredentials();
  const [projectId, setProjectId] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<OpenCredential | null>(null);

  const projects = (data?.projects ?? []).filter((project) => !project.eliminado_en);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ['credenciales', user?.id] }).catch(() => undefined);

  if (!data || (!ready && !query.error))
    return workspaceError ? (
      <Notice title="No se pudieron cargar los proyectos">
        <p>{readableError(workspaceError)}</p>
        <Button onClick={() => void reload()}>Reintentar</Button>
      </Notice>
    ) : (
      <div className="empty-state" role="status">
        Descifrando tus contraseñas…
      </div>
    );

  const byProject = new Map<string, Project>(projects.map((project) => [project.id, project]));
  const visible = items.filter(
    (item) =>
      byProject.has(item.row.proyecto_id) &&
      (!projectId || item.row.proyecto_id === projectId) &&
      (item.secret ? credentialMatches(item.secret, search) : !search.trim()),
  );
  const groups = projects
    .map((project) => ({
      project,
      entries: visible
        .filter((item) => item.row.proyecto_id === project.id)
        .sort((a, b) =>
          (a.secret?.nombre ?? '').localeCompare(b.secret?.nombre ?? '', 'es', {
            sensitivity: 'base',
          }),
        ),
    }))
    .filter((group) => group.entries.length);
  const unreadable = items.filter((item) => !item.secret).length;

  return (
    <div className="page-stack passwords-page">
      <PageHeader
        eyebrow="Trabajo / Seguridad"
        title="Contraseñas"
        description="Accesos de cada proyecto, cifrados con tu clave maestra."
        actions={
          <>
            <Button icon="lock" variant="ghost" onClick={vault.lock}>
              Bloquear
            </Button>
            <Button
              variant="primary"
              icon="plus"
              disabled={!projects.length}
              onClick={() => setEditing({ secret: defaultCredential() })}
            >
              Nueva entrada
            </Button>
          </>
        }
      />
      {query.error ? (
        <Notice title="No se pudieron cargar las contraseñas">
          <p>{readableError(query.error)}</p>
          <Button onClick={() => void query.refetch()}>Reintentar</Button>
        </Notice>
      ) : null}
      {!projects.length ? (
        <Notice title="Crea un proyecto para guardar sus accesos">
          <p>Cada entrada pertenece a un proyecto.</p>
          <ButtonLink to={paths.projects} icon="plus">
            Abrir proyectos
          </ButtonLink>
        </Notice>
      ) : (
        <div className="passwords-toolbar">
          <InputField
            label="Buscar"
            type="search"
            value={search}
            placeholder="Nombre, dirección o usuario…"
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
          />
          <SelectField
            label="Proyecto"
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">Todos los proyectos</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.nombre}
                {project.archivado_en ? ' (archivado)' : ''}
              </option>
            ))}
          </SelectField>
          <Badge>
            {visible.length} {visible.length === 1 ? 'entrada' : 'entradas'}
          </Badge>
        </div>
      )}
      {unreadable ? (
        <Notice
          title={`${unreadable} ${unreadable === 1 ? 'entrada no legible' : 'entradas no legibles'}`}
          icon="lock"
        >
          No se pueden descifrar con tu clave maestra actual.
        </Notice>
      ) : null}
      {projects.length && !groups.length && !unreadable ? (
        <section className="passwords-empty">
          <Icon name="key" size={40} />
          <p className="eyebrow">Todo en un sitio, cifrado</p>
          <h2>{items.length ? 'Ninguna entrada coincide' : 'Guarda tu primer acceso'}</h2>
          <p className="muted">
            Cada entrada incluye usuario y contraseña, y puedes añadir los campos que necesite el
            acceso (dominio, PIN, código de cliente…).
          </p>
          {items.length ? null : (
            <Button
              icon="plus"
              variant="primary"
              onClick={() => setEditing({ secret: defaultCredential() })}
            >
              Crear la primera entrada
            </Button>
          )}
        </section>
      ) : null}
      {groups.map(({ project, entries }) => (
        <section key={project.id} className="passwords-group" aria-label={project.nombre}>
          <header className="passwords-group__header">
            <h2>
              <Icon name="folder" size={18} />
              {project.nombre}
            </h2>
            {project.archivado_en ? <Badge tone="warning">Archivado</Badge> : null}
            <span className="dim mono">{entries.length}</span>
          </header>
          <div className="passwords-grid">
            {entries.map((item) => (
              <CredentialCard
                key={item.row.id}
                item={item}
                onEdit={() => item.secret && setEditing({ secret: item.secret, row: item.row })}
                onDelete={() => setDeleting(item)}
                onCopied={(label) => notify(`${label} copiado.`)}
              />
            ))}
          </div>
        </section>
      ))}
      {editing && user ? (
        <CredentialEditor
          userId={user.id}
          projects={projects}
          initial={editing.secret}
          row={editing.row}
          defaultProject={projectId || (projects.length === 1 ? projects[0]!.id : '')}
          onClose={() => {
            setEditing(null);
            // A save whose reply was lost may still have been stored.
            void refresh();
          }}
          onSaved={(message) => {
            setEditing(null);
            notify(message);
            void refresh();
          }}
        />
      ) : null}
      <ConfirmDialog
        open={!!deleting}
        danger
        title="Eliminar entrada"
        description={`Se eliminará «${deleting?.secret?.nombre ?? 'esta entrada'}» con todos sus campos. No se puede deshacer.`}
        confirmLabel="Eliminar entrada"
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting || !user) return;
          try {
            await executeCommand(
              'eliminar_credencial',
              { id: deleting.row.id, version: deleting.row.version },
              undefined,
              user.id,
            );
            notify('Entrada eliminada.');
          } finally {
            await refresh();
          }
        }}
      />
    </div>
  );
}

function CredentialCard({
  item,
  onEdit,
  onDelete,
  onCopied,
}: {
  item: OpenCredential;
  onEdit: () => void;
  onDelete: () => void;
  onCopied: (label: string) => void;
}) {
  const { secret } = item;
  if (!secret)
    return (
      <article className="credential-card credential-card--unreadable">
        <header className="credential-card__header">
          <Icon name="lock" size={18} />
          <h3>Entrada no legible</h3>
        </header>
        <div className="actions">
          <IconButton icon="trash" label="Eliminar entrada" onClick={onDelete} />
        </div>
      </article>
    );
  const link = secret.url ? safeUrl(secret.url) : null;
  return (
    <article className="credential-card">
      <header className="credential-card__header">
        <span className="credential-card__mark" aria-hidden="true">
          <Icon name="key" size={16} />
        </span>
        <div className="credential-card__title">
          <h3>{secret.nombre}</h3>
          {link ? (
            <a href={link} target="_blank" rel="noopener noreferrer" className="mono dim">
              {new URL(link).host}
              <Icon name="external" size={12} />
            </a>
          ) : secret.url ? (
            <span className="mono dim">{secret.url}</span>
          ) : null}
        </div>
        <div className="actions">
          <IconButton icon="edit" label={`Editar ${secret.nombre}`} onClick={onEdit} />
          <IconButton icon="trash" label={`Eliminar ${secret.nombre}`} onClick={onDelete} />
        </div>
      </header>
      <dl className="credential-card__fields">
        {secret.campos.map((field) => (
          <FieldValue key={field.id} field={field} onCopied={onCopied} />
        ))}
      </dl>
    </article>
  );
}

function FieldValue({
  field,
  onCopied,
}: {
  field: CredentialField;
  onCopied: (label: string) => void;
}) {
  const [shown, setShown] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const hidden = field.secreto && !shown;
  async function copy() {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(field.valor);
      onCopied(field.etiqueta);
      if (field.secreto)
        window.setTimeout(() => {
          // Clear the clipboard only if it still holds this secret.
          void navigator.clipboard
            .readText()
            .then((text) => (text === field.valor ? navigator.clipboard.writeText('') : undefined))
            .catch(() => undefined);
        }, CLIPBOARD_CLEAR_MS);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <div className="credential-card__field">
      <dt>{field.etiqueta}</dt>
      <dd>
        <span
          className={`mono credential-card__value ${hidden ? 'credential-card__value--hidden' : ''}`}
        >
          {field.valor ? hidden ? '••••••••••' : field.valor : <span className="dim">—</span>}
        </span>
        {field.secreto && field.valor ? (
          <IconButton
            icon={shown ? 'eyeOff' : 'eye'}
            label={shown ? `Ocultar ${field.etiqueta}` : `Mostrar ${field.etiqueta}`}
            onClick={() => setShown(!shown)}
          />
        ) : null}
        {field.valor ? (
          <IconButton icon="copy" label={`Copiar ${field.etiqueta}`} onClick={() => void copy()} />
        ) : null}
      </dd>
      {copyError ? (
        <p className="field__hint accent" role="alert">
          No se pudo copiar. Selecciona el valor manualmente.
        </p>
      ) : null}
    </div>
  );
}
