import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Note, NoteRow, Project, Task } from '../../domain/models';
import { Button } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { Badge } from '../../shared/ui/Panel';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { useCommand } from '../workspace/useCommand';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { DataError, readableError } from '../../lib/supabase/errors';
import { fetchNoteRow } from '../../lib/supabase/vault.repository';
import { encryptNote } from '../../lib/crypto/vault';
import { useVault } from '../vault/useVault';
import { openNoteRow } from './useNotes';
import { MarkdownPreview } from './MarkdownPreview';
import { NoteAssociations } from './NoteAssociations';
import {
  MAX_NOTE_BYTES,
  MAX_NOTE_TITLE_LENGTH,
  noteFileName,
  syncScrollTarget,
} from './notes.model';
import {
  clearNoteDraft,
  draftWriteMark,
  encryptNoteSession,
  nextDraftWrite,
  reconcilePending,
} from './notesDraft';
import type { NoteSession, PendingNoteSave } from './notesDraft';

function sameLinks(a: string[], b: string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export function NoteEditor({
  session,
  encrypted,
  latest,
  latestVersion,
  cryptoKey,
  userId,
  projects,
  tasks,
  draftKey,
  onDirty,
  onBusy,
  locked,
  onSaved,
  onDeleted,
  fullscreen,
  onFullscreen,
}: {
  session: NoteSession;
  /** Whether the stored row is already encrypted (legacy rows are plaintext). */
  encrypted: boolean;
  /** Decrypted saved note, used to reload it after a conflict. */
  latest: Note | undefined;
  /** Version of the stored row (null when it no longer exists). */
  latestVersion: number | null;
  cryptoKey: CryptoKey;
  userId: string;
  projects: Project[];
  tasks: Task[];
  draftKey: string;
  onDirty: (dirty: boolean, session?: NoteSession) => void;
  onBusy: (busy: boolean) => void;
  locked: boolean;
  onSaved: (note: Note) => void;
  onDeleted: () => void;
  /** Section fullscreen: the editor fills the content area (menu and top bar stay visible). */
  fullscreen: boolean;
  onFullscreen: (value: boolean) => void;
}) {
  const [baseline, setBaseline] = useState(session.baseline);
  const [draft, setDraft] = useState(session.draft);
  const [mode, setMode] = useState<'edit' | 'split' | 'preview'>('split');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const { run, pending: saving } = useCommand();
  const vault = useVault();
  const [resolving, setResolving] = useState(false);
  // Request sent with an unknown outcome; kept apart from later edits of the draft.
  const [pendiente, setPendienteState] = useState<PendingNoteSave | null>(
    session.pendiente ?? null,
  );
  const pendingRef = useRef<PendingNoteSave | null>(session.pendiente ?? null);
  // Latest committed values for async save steps.
  const draftRef = useRef(draft);
  const baselineRef = useRef(baseline);
  useLayoutEffect(() => {
    draftRef.current = draft;
    baselineRef.current = baseline;
  }, [draft, baseline]);
  const [storageFailed, setStorageFailed] = useState(false);
  const pending = saving || locked || resolving;
  const notify = useFeedback();
  const form = useRef<HTMLFormElement>(null);
  const source = useRef<HTMLTextAreaElement>(null);
  const previewPane = useRef<HTMLElement>(null);
  // Programmatic scrolls echo a scroll event; ignore it on the pane we just moved.
  const ignoreUntil = useRef({ source: 0, preview: 0 });
  const preview = useDeferredValue(draft.contenido_md);
  const dirty =
    baseline.version === 0 ||
    draft.titulo !== baseline.titulo ||
    draft.contenido_md !== baseline.contenido_md ||
    !sameLinks(draft.proyecto_ids, baseline.proyecto_ids) ||
    !sameLinks(draft.tarea_ids, baseline.tarea_ids);
  const conflict = baseline.version > 0 && latestVersion !== baseline.version;
  const bytes = new TextEncoder().encode(draft.contenido_md).byteLength;

  useEffect(() => {
    onDirty(dirty, { baseline, draft });
  }, [dirty, baseline, draft, onDirty]);
  useEffect(() => {
    onBusy(pending);
  }, [pending, onBusy]);
  useEffect(() => {
    if (!dirty) return;
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  // Session drafts also survive browser Back and accidental route changes. They are
  // stored encrypted, together with any request whose outcome is still unknown.
  async function persist(next: NoteSession, keep: boolean) {
    const sequence = nextDraftWrite(draftKey);
    try {
      if (!keep) {
        sessionStorage.removeItem(draftKey);
      } else {
        const value = await encryptNoteSession(cryptoKey, userId, next);
        if (sequence !== draftWriteMark(draftKey)) return;
        sessionStorage.setItem(draftKey, value);
      }
      setStorageFailed(false);
    } catch {
      // Editing and server saves remain available when browser storage is full.
      setStorageFailed(true);
    }
  }
  // Locking unmounts the editor: write the very latest draft first.
  const latestSession = useRef({
    next: { baseline, draft, pendiente } as NoteSession,
    keep: false,
  });
  useLayoutEffect(() => {
    latestSession.current = { next: { baseline, draft, pendiente }, keep: dirty || !!pendiente };
  }, [baseline, draft, pendiente, dirty]);
  useEffect(
    () =>
      vault.registerFlush(() => {
        const { next, keep } = latestSession.current;
        void persist(next, keep);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist reads stable props
    [vault.registerFlush],
  );
  // Write mark when the latest change was scheduled; null once it has been written.
  const unflushed = useRef<number | null>(null);
  useEffect(() => {
    unflushed.current = draftWriteMark(draftKey);
    const timer = window.setTimeout(() => {
      unflushed.current = null;
      void persist({ baseline, draft, pendiente }, dirty || !!pendiente);
    }, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist reads stable props
  }, [baseline, draft, dirty, pendiente, draftKey]);
  // Leaving the editor (browser Back, another route) writes a change still waiting
  // for the debounce, unless the draft was explicitly discarded in the meantime.
  useEffect(
    () => () => {
      if (unflushed.current === null || unflushed.current !== draftWriteMark(draftKey)) return;
      const { next, keep } = latestSession.current;
      void persist(next, keep);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on unmount only
    [],
  );

  function setPendiente(value: PendingNoteSave | null) {
    pendingRef.current = value;
    setPendienteState(value);
  }
  /** Applies a confirmed save; later edits of the draft stay as unsaved changes. */
  function accept(note: Note, sentDraft?: Note) {
    setPendiente(null);
    const current = draftRef.current;
    const unchanged = sentDraft
      ? current === sentDraft
      : current.titulo.trim() === note.titulo &&
        current.contenido_md === note.contenido_md &&
        sameLinks(current.proyecto_ids, note.proyecto_ids) &&
        sameLinks(current.tarea_ids, note.tarea_ids);
    const nextDraft = unchanged
      ? note
      : {
          ...current,
          version: note.version,
          creado_en: note.creado_en,
          actualizado_en: note.actualizado_en,
        };
    // A save that follows a reconciliation reads these refs before the next render.
    baselineRef.current = note;
    draftRef.current = nextDraft;
    setBaseline(note);
    setDraft(nextDraft);
    onSaved(note);
  }
  async function send(payload: PendingNoteSave) {
    const row = await run<NoteRow>('guardar_nota', payload);
    return openNoteRow(cryptoKey, userId, row);
  }
  /** Resolves the pending request: confirmed, resent with the same bytes, or a conflict. */
  async function resolvePending(): Promise<boolean> {
    const request = pendingRef.current;
    if (!request) return true;
    const row = await fetchNoteRow(userId, request.id);
    const outcome = reconcilePending(request, row);
    if (outcome === 'confirmed') accept(await openNoteRow(cryptoKey, userId, row!));
    else if (outcome === 'resend') accept(await send(request));
    else {
      setPendiente(null);
      setError(
        'La nota ha cambiado en otra sesión mientras se guardaba. Tu borrador se conserva; descárgalo si lo necesitas.',
      );
      return false;
    }
    return true;
  }
  function failed(cause: unknown) {
    // A definite rejection will not succeed by resending the same request.
    if (cause instanceof DataError && !cause.retryable) setPendiente(null);
    vault.handleError(cause);
    setError(readableError(cause));
  }
  // A restored session with an unconfirmed save is resolved before anything else.
  const resolvedOnMount = useRef(false);
  useEffect(() => {
    if (resolvedOnMount.current || !pendingRef.current) return;
    resolvedOnMount.current = true;
    setResolving(true);
    resolvePending()
      .then((ok) => {
        if (ok) notify('Se ha confirmado el último guardado de la nota.');
      })
      .catch(failed)
      .finally(() => setResolving(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the restored session
  }, []);

  function mirror(from: 'source' | 'preview') {
    const origin = from === 'source' ? source.current : previewPane.current;
    const target = from === 'source' ? previewPane.current : source.current;
    if (mode !== 'split' || !origin || !target) return;
    if (performance.now() < ignoreUntil.current[from]) return;
    const top = syncScrollTarget(origin, target);
    if (Math.abs(target.scrollTop - top) < 1) return;
    ignoreUntil.current[from === 'source' ? 'preview' : 'source'] = performance.now() + 80;
    target.scrollTop = top;
  }
  // Keep the preview aligned while typing (its height changes after rendering).
  useEffect(() => {
    const origin = source.current;
    const target = previewPane.current;
    if (mode !== 'split' || !origin || !target) return;
    ignoreUntil.current.preview = performance.now() + 80;
    target.scrollTop = syncScrollTarget(origin, target);
  }, [preview, mode]);
  useEffect(() => {
    if (!fullscreen) return;
    function exit(event: KeyboardEvent) {
      // An open dialog handles Escape itself.
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) onFullscreen(false);
    }
    document.addEventListener('keydown', exit);
    return () => document.removeEventListener('keydown', exit);
  }, [fullscreen, onFullscreen]);

  async function save() {
    if (
      pending ||
      locked ||
      (!dirty && !pendingRef.current) ||
      // A pending request is reconciled first; it may be the cause of the conflict.
      (conflict && !pendingRef.current) ||
      !form.current?.reportValidity()
    )
      return;
    setError('');
    if (!draft.titulo.trim()) {
      setError('Escribe un título para la nota.');
      return;
    }
    if (bytes > MAX_NOTE_BYTES) {
      setError('El contenido Markdown no puede superar 1 MB.');
      return;
    }
    if (!vault.generation) {
      setError('Desbloquea la bóveda para guardar.');
      return;
    }
    setResolving(true);
    try {
      if (pendingRef.current) {
        if (!(await resolvePending())) return;
        const saved = baselineRef.current;
        const current = draftRef.current;
        if (
          current.titulo.trim() === saved.titulo &&
          current.contenido_md === saved.contenido_md &&
          sameLinks(current.proyecto_ids, saved.proyecto_ids) &&
          sameLinks(current.tarea_ids, saved.tarea_ids)
        ) {
          notify('Nota guardada.');
          return;
        }
      }
      const current = draftRef.current;
      const base = baselineRef.current;
      const titulo = current.titulo.trim();
      const request: PendingNoteSave = {
        id: current.id,
        version: base.version || undefined,
        cifrado: await encryptNote(cryptoKey, userId, current.id, {
          titulo,
          contenido_md: current.contenido_md,
        }),
        boveda_generacion: vault.generation,
        proyecto_ids: current.proyecto_ids,
        tarea_ids: current.tarea_ids,
      };
      setPendiente(request);
      // Keep the exact request before sending it, so a reload can resolve it.
      await persist({ baseline: base, draft: current, pendiente: request }, true);
      accept(await send(request), current);
      notify('Nota guardada.');
    } catch (cause) {
      failed(cause);
    } finally {
      setResolving(false);
    }
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([draft.contenido_md], { type: 'text/markdown;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = noteFileName(draft.titulo);
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <form
      ref={form}
      className={`note-editor ${fullscreen ? 'note-editor--fullscreen' : ''}`}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          void save();
        }
      }}
    >
      <div className="note-editor__header">
        <div className="actions">
          <Badge tone="accent">.md</Badge>
          <span className="field__hint" role="status">
            {pending
              ? 'Guardando…'
              : pendiente
                ? 'Guardado sin confirmar · vuelve a guardar'
                : dirty
                  ? 'Cambios sin guardar'
                  : encrypted
                    ? 'Guardada · cifrada'
                    : 'Guardada · sin cifrar todavía'}
          </span>
        </div>
        <div className="actions">
          <Button icon="download" onClick={download}>
            Descargar .md
          </Button>
          {baseline.version > 0 ? (
            <Button
              icon="trash"
              variant="ghost"
              disabled={pending}
              onClick={() => setDeleting(true)}
            >
              Eliminar
            </Button>
          ) : null}
          <Button
            type="submit"
            icon="check"
            variant="primary"
            disabled={
              pending ||
              (!dirty && !pendiente) ||
              (conflict && !pendiente) ||
              bytes > MAX_NOTE_BYTES
            }
          >
            Guardar nota
          </Button>
        </div>
      </div>
      {conflict ? (
        <div className="notice">
          <div>
            <strong>Esta nota ha cambiado en otra sesión.</strong>
            <p className="muted">
              Tu borrador se conserva. Descarga tus cambios antes de cargar la versión guardada.
              {latestVersion === null ? ' La nota ya no está disponible.' : ''}
            </p>
            {latest && latest.version === latestVersion ? (
              <Button disabled={pending} onClick={() => setReloading(true)} icon="refresh">
                Cargar versión guardada
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {storageFailed ? (
        <p className="field__hint accent" role="status">
          No se ha podido guardar el borrador en esta pestaña. Guarda la nota para no perder los
          cambios.
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <InputField
        label="Título de la nota"
        value={draft.titulo}
        maxLength={MAX_NOTE_TITLE_LENGTH}
        required
        disabled={pending}
        placeholder="Por ejemplo, Reunión de planificación"
        onChange={(event) => setDraft({ ...draft, titulo: event.target.value })}
      />
      <div className="note-editor__toolbar">
        <span className="eyebrow">Contenido Markdown</span>
        <div className="actions">
          <SegmentedControl
            label="Vista de la nota"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'edit', label: 'Editar' },
              { value: 'split', label: 'Dividida' },
              { value: 'preview', label: 'Vista previa' },
            ]}
          />
          <Button
            icon={fullscreen ? 'minimize' : 'maximize'}
            variant="ghost"
            aria-pressed={fullscreen}
            title={fullscreen ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa'}
            onClick={() => onFullscreen(!fullscreen)}
          >
            {fullscreen ? 'Salir' : 'Pantalla completa'}
          </Button>
        </div>
      </div>
      <div className={`note-editor__panes note-editor__panes--${mode}`}>
        {mode !== 'preview' ? (
          <div className="note-editor__source">
            <label htmlFor="note-markdown" className="sr-only">
              Contenido de la nota en Markdown
            </label>
            <textarea
              ref={source}
              onScroll={() => mirror('source')}
              id="note-markdown"
              value={draft.contenido_md}
              disabled={pending}
              spellCheck={false}
              placeholder={
                '# Tus ideas, conectadas\n\nEscribe aquí tus notas…\n\n- [ ] Próximo paso'
              }
              onChange={(event) => setDraft({ ...draft, contenido_md: event.target.value })}
            />
          </div>
        ) : null}
        {mode !== 'edit' ? (
          <section
            ref={previewPane}
            onScroll={() => mirror('preview')}
            className="note-editor__preview"
            aria-label="Vista previa Markdown"
          >
            <MarkdownPreview content={preview} />
          </section>
        ) : null}
      </div>
      <div className="note-editor__footer">
        <span># Títulos · **negrita** · - listas · - [ ] tareas · ``` código</span>
        <span>{bytes.toLocaleString('es')} / 1.000.000 bytes · Ctrl / ⌘ + S</span>
      </div>
      {fullscreen ? null : (
        <NoteAssociations
          projects={projects}
          tasks={tasks}
          projectIds={draft.proyecto_ids}
          taskIds={draft.tarea_ids}
          disabled={pending}
          onChange={(proyecto_ids, tarea_ids) => setDraft({ ...draft, proyecto_ids, tarea_ids })}
        />
      )}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Eliminar nota"
        danger
        busy={pending}
        description={`Se eliminará «${baseline.titulo}» y sus asociaciones. Los proyectos y las tareas se conservarán.`}
        confirmLabel="Eliminar nota"
        onConfirm={async () => {
          await run('eliminar_nota', { id: baseline.id, version: baseline.version });
          clearNoteDraft(draftKey);
          onDirty(false);
          onDeleted();
          notify('Nota eliminada.');
        }}
      />
      <ConfirmDialog
        open={reloading}
        onClose={() => setReloading(false)}
        title="Cargar versión guardada"
        description="Se descartará este borrador y se cargará la versión guardada de la nota."
        confirmLabel="Cargar versión"
        onConfirm={async () => {
          if (latest) {
            setPendiente(null);
            setBaseline(latest);
            setDraft(latest);
            setError('');
          }
        }}
      />
    </form>
  );
}
