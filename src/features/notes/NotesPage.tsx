import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Note, NoteRow } from '../../domain/models';
import { Button, IconButton } from '../../shared/ui/Button';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Notice, Badge, Progress } from '../../shared/ui/Panel';
import { SelectField } from '../../shared/ui/FormField';
import { SearchSuggest } from '../../shared/ui/SearchSuggest';
import { paginate } from '../../lib/paginate';
import { TaskPagination } from '../tasks/components/TaskPagination';
import { Icon } from '../../shared/ui/Icon';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { useWorkspace } from '../workspace/useWorkspace';
import { useAuth } from '../auth/useAuth';
import { readableError } from '../../lib/supabase/errors';
import { storageScope } from '../../lib/localGeneration';
import { NoteEditor } from './NoteEditor';
import { clearNoteDraft, encryptNoteSession, restoreNoteSession } from './notesDraft';
import type { NoteSession, RestoredDraft } from './notesDraft';
import { useNotes } from './useNotes';
import type { DecryptedNotes } from './useNotes';
import { VaultGate } from '../vault/VaultGate';
import { useVault } from '../vault/useVault';
import { noteMatchesSearch, noteSearchExcerpt, readMarkdownFile } from './notes.model';
import './notes.css';

const NOTES_PAGE_SIZE = 8;
const COLLAPSED_KEY = 'chambapp:notes-library-collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Body excerpt; with a search, centred on the first match and highlighted. */
function NoteExcerpt({
  content,
  query,
  length = 100,
}: {
  content: string;
  query: string;
  length?: number;
}) {
  const parts = noteSearchExcerpt(content, query, length);
  if (!parts.length) return <>Sin contenido todavía</>;
  return (
    <>
      {parts.map((part, index) =>
        part.match ? (
          <mark key={index} className="notes-match">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}

export default function NotesPage() {
  const { user } = useAuth();
  return (
    <VaultGate purpose="Tus notas">
      <NotesLoader key={user?.id} />
    </VaultGate>
  );
}

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

/** Waits for decryption, the encryption of old notes and the stored draft. */
function NotesLoader() {
  const { user } = useAuth();
  const vault = useVault();
  const decrypted = useNotes();
  const { data: workspace } = useWorkspace();
  // Per data generation in the local edition: a restore never brings back an old draft.
  const draftKey = `chambapp:notes-draft:${storageScope(user?.id, workspace?.dataGeneration) ?? 'cargando'}`;
  const [restored, setRestored] = useState<RestoredDraft | null>(null);
  const [legacyDraftKept, setLegacyDraftKept] = useState(false);
  const key = vault.key;
  useEffect(() => {
    if (!key || !user) return;
    let cancelled = false;
    void restoreNoteSession(draftKey, key, user.id).then(async (value) => {
      // A plaintext draft from an earlier version is replaced by its encrypted copy now.
      if (value.kind === 'restored' && value.legacy) {
        try {
          sessionStorage.setItem(draftKey, await encryptNoteSession(key, user.id, value.session));
        } catch {
          if (!cancelled) setLegacyDraftKept(true);
        }
      }
      if (!cancelled) setRestored(value);
    });
    return () => {
      cancelled = true;
    };
  }, [draftKey, key, user]);

  const { migration } = vault;
  if (migration.running)
    return (
      <Notice
        title={`Cifrando ${migration.total} ${migration.total === 1 ? 'nota' : 'notas'}…`}
        icon="lock"
      >
        <p>Tus notas anteriores se están cifrando con tu clave maestra. No cierres esta pestaña.</p>
        <Progress
          value={(100 * (migration.done + migration.failed)) / Math.max(1, migration.total)}
          label="Progreso del cifrado de notas"
        />
      </Notice>
    );
  if (!restored || decrypted.status !== 'ready')
    return (
      <div className="empty-state" role="status">
        Descifrando tus notas…
      </div>
    );
  if (restored.kind === 'unreadable')
    return (
      <Notice title="No se pudo recuperar un borrador anterior" icon="info">
        <p>
          Hay un borrador guardado en esta pestaña que no se puede leer con tu clave maestra actual.
          Si lo descartas, se perderá.
        </p>
        <Button
          variant="danger"
          icon="trash"
          onClick={() => {
            clearNoteDraft(draftKey);
            setRestored({ kind: 'none' });
          }}
        >
          Descartar borrador
        </Button>
      </Notice>
    );
  let initial: NoteSession | null = null;
  if (restored.kind === 'restored') {
    initial = restored.session;
    // A plaintext draft of a note that was just encrypted: same content, newer version.
    const latest = decrypted.notes.find((note) => note.id === initial!.baseline.id);
    const base = initial.baseline;
    if (
      restored.legacy &&
      latest &&
      latest.version > base.version &&
      latest.titulo === base.titulo &&
      latest.contenido_md === base.contenido_md &&
      sameIds(latest.proyecto_ids, base.proyecto_ids) &&
      sameIds(latest.tarea_ids, base.tarea_ids)
    )
      initial = { baseline: latest, draft: { ...initial.draft, version: latest.version } };
  }
  return (
    <NotesWorkspace
      legacyDraftKept={legacyDraftKept}
      decrypted={decrypted}
      initialSession={initial}
      restoredDraft={restored.kind === 'restored'}
      draftKey={draftKey}
      cryptoKey={key!}
    />
  );
}

function NotesWorkspace({
  legacyDraftKept,
  decrypted,
  initialSession,
  restoredDraft,
  draftKey,
  cryptoKey,
}: {
  legacyDraftKept: boolean;
  decrypted: DecryptedNotes;
  initialSession: NoteSession | null;
  restoredDraft: boolean;
  draftKey: string;
  cryptoKey: CryptoKey;
}) {
  const { data, isLoading, error, reload } = useWorkspace();
  const { user } = useAuth();
  const vault = useVault();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [libraryPage, setLibraryPage] = useState({ key: '', page: 1 });
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [fullscreen, setFullscreen] = useState(false);
  const [handledRequest, setHandledRequest] = useState<string | null>(null);
  const [selection, setSelection] = useState<NoteSession | null>(() =>
    initialSession?.draft.usuario_id === user?.id ? initialSession : null,
  );
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [discardAction, setDiscardAction] = useState<(() => void) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Id of the note shown in the editor, read by late save/delete callbacks.
  const currentNoteId = useRef<string | undefined>(undefined);
  const handleDirty = useCallback((value: boolean, session?: NoteSession) => {
    // The mounted editor reports its note on mount and on every change.
    if (session) currentNoteId.current = session.baseline.id;
    setDirty(value);
    if (value && session) setSelection((previous) => previous ?? session);
  }, []);

  useEffect(() => {
    if (!dirty && !busy) return;
    function intercept(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (
        !anchor ||
        anchor.hasAttribute('download') ||
        (anchor.target && anchor.target !== '_self')
      )
        return;
      const url = new URL(anchor.href, location.href);
      if (
        url.origin !== location.origin ||
        (url.pathname === location.pathname && url.search === location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      setDiscardAction(() => () => navigate(url.pathname + url.search + url.hash));
    }
    document.addEventListener('click', intercept, true);
    return () => document.removeEventListener('click', intercept, true);
  }, [dirty, busy, navigate]);

  function leaveDraft(action: () => void) {
    if (busy || importing) return;
    if (dirty) setDiscardAction(() => action);
    else action();
  }
  function openNew(imported?: { titulo: string; contenido_md: string }) {
    const now = new Date().toISOString();
    const note: Note = {
      id: crypto.randomUUID(),
      usuario_id: user!.id,
      titulo: imported?.titulo ?? '',
      contenido_md: imported?.contenido_md ?? '',
      proyecto_ids: projectId ? [projectId] : [],
      tarea_ids: [],
      version: 0,
      creado_en: now,
      actualizado_en: now,
    };
    setSelection({ baseline: note, draft: note });
  }
  async function importFile(file: File) {
    setImportError('');
    setImporting(true);
    try {
      const imported = await readMarkdownFile(file);
      leaveDraft(() => openNew(imported));
    } catch (cause) {
      setImportError(readableError(cause));
    } finally {
      setImporting(false);
    }
  }

  function toggleCollapsed() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* The preference just is not remembered. */
    }
  }
  function openNote(note: Note) {
    leaveDraft(() => setSelection({ baseline: note, draft: note }));
  }

  // `?nota=<id>` (e.g. from a task popup) opens that note once. A restored or
  // unsaved draft of another note goes through the discard confirmation.
  const requestedId = searchParams.get('nota');
  // Wait while a save or import is running; the request is handled afterwards.
  if (requestedId && data && !busy && !importing && handledRequest !== requestedId) {
    setHandledRequest(requestedId);
    const note = decrypted.notes.find((item) => item.id === requestedId);
    if (note && selection?.baseline.id !== note.id) {
      const open = () => setSelection({ baseline: note, draft: note });
      if (dirty || restoredDraft) setDiscardAction(() => open);
      else open();
    }
  }

  if (!data)
    return (
      <Notice title={isLoading ? 'Cargando notas…' : 'No se pudieron cargar las notas'}>
        {error ? (
          <>
            <p>{readableError(error)}</p>
            <Button onClick={() => void reload()}>Reintentar</Button>
          </>
        ) : (
          <p>Preparando tu espacio de trabajo.</p>
        )}
      </Notice>
    );

  const notes = decrypted.notes;
  const unreadable: NoteRow[] = decrypted.unreadable;
  const rows = new Map(data.notes.map((row) => [row.id, row]));
  // Shown once the migration of this unlock has finished (not before it starts).
  const plaintextLeft =
    vault.migration.running || !vault.migration.total
      ? 0
      : data.notes.filter((row) => row.cifrado === null).length;
  const projects = data.projects.filter((project) => !project.eliminado_en);
  const tasks = data.tasks.filter((task) => !task.eliminado_en);
  const taskProjects = new Map(tasks.map((task) => [task.id, task.proyecto_id]));
  const visible = notes
    .filter(
      (note) =>
        noteMatchesSearch(note, query) &&
        (!projectId ||
          note.proyecto_ids.includes(projectId) ||
          note.tarea_ids.some((id) => taskProjects.get(id) === projectId)),
    )
    .sort((a, b) => b.actualizado_en.localeCompare(a.actualizado_en) || a.id.localeCompare(b.id));
  const first = visible[0];
  const active = selection ?? (first ? { baseline: first, draft: first } : null);
  const latest = notes.find((note) => note.id === active?.baseline.id);
  const editorNoteId = active?.baseline.id;
  const filterKey = JSON.stringify([query, projectId]);
  // Any change of search or project returns the library to its first page.
  if (libraryPage.key !== filterKey) setLibraryPage({ key: filterKey, page: 1 });
  const library = paginate(
    visible,
    libraryPage.key === filterKey ? libraryPage.page : 1,
    NOTES_PAGE_SIZE,
  );
  const suggestions = visible.map((note) => ({
    id: note.id,
    title: note.titulo || 'Sin título',
    detail: <NoteExcerpt content={note.contenido_md} query={query} length={90} />,
  }));

  return (
    <div className={`page-stack ${fullscreen ? 'notes-page--fullscreen' : ''}`}>
      {fullscreen ? null : (
        <PageHeader
          eyebrow="Mi espacio / Documentación"
          title="Notas"
          description="Ideas, decisiones y documentación en Markdown, cifradas con tu clave maestra."
          actions={
            <>
              <Button icon="lock" variant="ghost" disabled={busy} onClick={vault.lock}>
                Bloquear
              </Button>
              <Button
                icon="file"
                disabled={importing || busy}
                onClick={() => fileInput.current?.click()}
              >
                {importing ? 'Importando…' : 'Importar .md'}
              </Button>
              <Button
                variant="primary"
                icon="plus"
                disabled={importing || busy}
                onClick={() => leaveDraft(() => openNew())}
              >
                Nueva nota
              </Button>
            </>
          }
        />
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".md,text/markdown"
        className="sr-only"
        aria-label="Importar archivo Markdown"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void importFile(file);
        }}
      />
      {plaintextLeft ? (
        <Notice
          title={`${plaintextLeft} ${plaintextLeft === 1 ? 'nota sigue' : 'notas siguen'} sin cifrar`}
          icon="lock"
        >
          <p>
            No se pudieron cifrar todas tus notas anteriores; su texto aún es legible en el
            servidor. Guardar una de ellas también la cifra.
          </p>
          <Button
            icon="refresh"
            disabled={busy || dirty || vault.migration.running}
            title={dirty ? 'Guarda o descarta los cambios antes de reintentar' : undefined}
            onClick={vault.retryMigration}
          >
            Reintentar cifrado
          </Button>
        </Notice>
      ) : null}
      {legacyDraftKept ? (
        <Notice title="Tu borrador anterior sigue sin cifrar en esta pestaña" icon="info">
          No se pudo sustituir por una copia cifrada. Guarda la nota o descarta el borrador.
        </Notice>
      ) : null}
      {importError ? (
        <p className="form-error" role="alert">
          {importError}
        </p>
      ) : null}
      <div
        className={`notes-workspace ${collapsed && !fullscreen ? 'notes-workspace--collapsed' : ''}`}
      >
        {fullscreen ? null : collapsed ? (
          <aside
            className="notes-library notes-library--collapsed"
            aria-label="Biblioteca de notas"
          >
            <IconButton icon="sidebarOpen" label="Mostrar biblioteca" onClick={toggleCollapsed} />
            <Badge>{notes.length}</Badge>
          </aside>
        ) : (
          <aside className="notes-library" aria-label="Biblioteca de notas">
            <div className="notes-library__heading">
              <h2>Tu biblioteca</h2>
              <div className="actions">
                <Badge>{notes.length}</Badge>
                <IconButton
                  icon="sidebarClose"
                  label="Minimizar biblioteca"
                  onClick={toggleCollapsed}
                />
              </div>
            </div>
            <SearchSuggest
              label="Buscar notas"
              value={query}
              placeholder="Título o contenido…"
              onChange={setQuery}
              suggestions={suggestions}
              emptyText="Ninguna nota coincide."
              onPick={(suggestion) => {
                const note = notes.find((item) => item.id === suggestion.id);
                if (note && note.id !== active?.baseline.id) openNote(note);
              }}
            />
            <SelectField
              label="Filtrar por proyecto"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
            >
              <option value="">Todos los proyectos</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.nombre}
                  {project.archivado_en ? ' (archivado)' : ''}
                  {project.origen === 'local' ? ' · Local' : ''}
                </option>
              ))}
            </SelectField>
            <div className="notes-library__list">
              {library.items.map((note) => (
                <button
                  type="button"
                  disabled={busy || importing}
                  key={note.id}
                  className={`notes-library__note ${active?.baseline.id === note.id ? 'notes-library__note--active' : ''}`}
                  aria-pressed={active?.baseline.id === note.id}
                  onClick={() => {
                    if (note.id !== active?.baseline.id) openNote(note);
                  }}
                >
                  <span className="notes-library__note-title">
                    <Icon name="file" size={16} />
                    <strong>{note.titulo}</strong>
                    <span className="mono dim">.md</span>
                  </span>
                  <span className="notes-library__excerpt">
                    <NoteExcerpt content={note.contenido_md} query={query} />
                  </span>
                  <span className="notes-library__metadata">
                    <time dateTime={note.actualizado_en}>
                      {new Date(note.actualizado_en).toLocaleDateString('es', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </time>
                    <span>
                      {note.proyecto_ids.length}{' '}
                      {note.proyecto_ids.length === 1 ? 'proyecto' : 'proyectos'} ·{' '}
                      {note.tarea_ids.length} {note.tarea_ids.length === 1 ? 'tarea' : 'tareas'}
                    </span>
                  </span>
                </button>
              ))}
              {unreadable.map((row) => (
                <button
                  type="button"
                  key={row.id}
                  disabled
                  className="notes-library__note notes-library__note--unreadable"
                >
                  <span className="notes-library__note-title">
                    <Icon name="lock" size={16} />
                    <strong>Nota no legible</strong>
                  </span>
                  <span className="notes-library__excerpt">
                    No se puede descifrar con tu clave maestra actual.
                  </span>
                </button>
              ))}
              {!visible.length && !unreadable.length ? (
                <p className="notes-library__empty muted">
                  {notes.length
                    ? 'No hay notas con estos filtros.'
                    : 'Tu primera idea empieza aquí. Crea una nota o importa un archivo .md.'}
                </p>
              ) : null}
            </div>
            {library.pages > 1 ? (
              <TaskPagination
                page={library.page}
                pages={library.pages}
                total={visible.length}
                pageSize={NOTES_PAGE_SIZE}
                noun="notas"
                onChange={(page) => setLibraryPage({ key: filterKey, page })}
              />
            ) : null}
          </aside>
        )}
        {active ? (
          <NoteEditor
            key={active.baseline.id}
            session={active}
            latest={latest}
            latestVersion={rows.get(active.baseline.id)?.version ?? null}
            encrypted={rows.get(active.baseline.id)?.cifrado != null}
            cryptoKey={cryptoKey}
            userId={user!.id}
            projects={projects}
            tasks={tasks}
            draftKey={draftKey}
            onDirty={handleDirty}
            onBusy={setBusy}
            locked={importing}
            onSaved={(note) => {
              // A late save from an editor that is no longer shown must not reselect it.
              if (currentNoteId.current === note.id) setSelection({ baseline: note, draft: note });
            }}
            fullscreen={fullscreen}
            onFullscreen={setFullscreen}
            onDeleted={() => {
              if (currentNoteId.current !== editorNoteId) return;
              setDirty(false);
              setBusy(false);
              setSelection(null);
              setFullscreen(false);
            }}
          />
        ) : (
          <section className="notes-empty">
            <Icon name="file" size={40} />
            <p className="eyebrow">Un espacio para tus ideas</p>
            <h2>De una nota al próximo paso</h2>
            <p className="muted">
              Escribe en Markdown, revisa la vista previa y asocia proyectos y tareas cuando lo
              necesites.
            </p>
            <Button icon="plus" variant="primary" onClick={() => openNew()}>
              Crear mi primera nota
            </Button>
          </section>
        )}
      </div>
      <ConfirmDialog
        open={!!discardAction}
        busy={busy || importing}
        title="Tienes cambios sin guardar"
        description="Puedes cancelar para guardar tu nota antes de continuar. Si continúas, se descartará este borrador."
        confirmLabel="Descartar y continuar"
        onClose={() => setDiscardAction(null)}
        onConfirm={async () => {
          clearNoteDraft(draftKey);
          setDirty(false);
          discardAction?.();
        }}
      />
    </div>
  );
}
