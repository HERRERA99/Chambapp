import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Note } from '../../domain/models';
import { Button, IconButton } from '../../shared/ui/Button';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Notice, Badge } from '../../shared/ui/Panel';
import { SelectField } from '../../shared/ui/FormField';
import { SearchSuggest } from '../../shared/ui/SearchSuggest';
import { paginate } from '../../lib/paginate';
import { TaskPagination } from '../tasks/components/TaskPagination';
import { Icon } from '../../shared/ui/Icon';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { useWorkspace } from '../workspace/useWorkspace';
import { useAuth } from '../auth/useAuth';
import { readableError } from '../../lib/supabase/errors';
import { NoteEditor } from './NoteEditor';
import { readNoteSession } from './notesDraft';
import type { NoteSession } from './notesDraft';
import { noteMatchesSearch, readMarkdownFile } from './notes.model';
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

export default function NotesPage() {
  const { user } = useAuth();
  return <NotesWorkspace key={user?.id} />;
}

function NotesWorkspace() {
  const { data, isLoading, error, reload } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [libraryPage, setLibraryPage] = useState({ key: '', page: 1 });
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [fullscreen, setFullscreen] = useState(false);
  const [handledRequest, setHandledRequest] = useState<string | null>(null);
  const draftKey = `chambapp:notes-draft:${user?.id}`;
  const [restoredDraft] = useState(() => !!readNoteSession(draftKey));
  const [selection, setSelection] = useState<NoteSession | null>(() => {
    const saved = readNoteSession(draftKey);
    return saved?.draft.usuario_id === user?.id ? saved : null;
  });
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
    const note = data.notes.find((item) => item.id === requestedId);
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

  const notes = data.notes;
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
    detail: note.contenido_md.trim().slice(0, 90) || 'Sin contenido todavía',
  }));

  return (
    <div className={`page-stack ${fullscreen ? 'notes-page--fullscreen' : ''}`}>
      {fullscreen ? null : (
        <PageHeader
          eyebrow="Mi espacio / Documentación"
          title="Notas"
          description="Ideas, decisiones y documentación en Markdown, conectadas con tu trabajo."
          actions={
            <>
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
                    {note.contenido_md.trim().slice(0, 100) || 'Sin contenido todavía'}
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
              {!visible.length ? (
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
          try {
            sessionStorage.removeItem(draftKey);
          } catch {
            /* Storage may be unavailable. */
          }
          setDirty(false);
          discardAction?.();
        }}
      />
    </div>
  );
}
