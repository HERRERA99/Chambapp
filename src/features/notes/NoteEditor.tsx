import { useDeferredValue, useEffect, useRef, useState } from 'react';
import type { Note, Project, Task } from '../../domain/models';
import { Button } from '../../shared/ui/Button';
import { InputField } from '../../shared/ui/FormField';
import { Badge } from '../../shared/ui/Panel';
import { SegmentedControl } from '../../shared/ui/SegmentedControl';
import { ConfirmDialog } from '../../shared/ui/ConfirmDialog';
import { useCommand } from '../workspace/useCommand';
import { useFeedback } from '../../shared/feedback/FeedbackContext';
import { readableError } from '../../lib/supabase/errors';
import { MarkdownPreview } from './MarkdownPreview';
import { NoteAssociations } from './NoteAssociations';
import { MAX_NOTE_BYTES, MAX_NOTE_TITLE_LENGTH, noteFileName } from './notes.model';
import type { NoteSession } from './notesDraft';

function sameLinks(a: string[], b: string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export function NoteEditor({
  session,
  latest,
  projects,
  tasks,
  draftKey,
  onDirty,
  onBusy,
  locked,
  onSaved,
  onDeleted,
}: {
  session: NoteSession;
  latest: Note | undefined;
  projects: Project[];
  tasks: Task[];
  draftKey: string;
  onDirty: (dirty: boolean, session?: NoteSession) => void;
  onBusy: (busy: boolean) => void;
  locked: boolean;
  onSaved: (note: Note) => void;
  onDeleted: () => void;
}) {
  const [baseline, setBaseline] = useState(session.baseline);
  const [draft, setDraft] = useState(session.draft);
  const [mode, setMode] = useState<'edit' | 'split' | 'preview'>('split');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [reloading, setReloading] = useState(false);
  const { run, pending: saving } = useCommand();
  const pending = saving || locked;
  const notify = useFeedback();
  const form = useRef<HTMLFormElement>(null);
  const preview = useDeferredValue(draft.contenido_md);
  const dirty =
    baseline.version === 0 ||
    draft.titulo !== baseline.titulo ||
    draft.contenido_md !== baseline.contenido_md ||
    !sameLinks(draft.proyecto_ids, baseline.proyecto_ids) ||
    !sameLinks(draft.tarea_ids, baseline.tarea_ids);
  const conflict = baseline.version > 0 && (!latest || latest.version !== baseline.version);
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
  useEffect(() => {
    // Session drafts also survive browser Back and accidental route changes.
    try {
      if (dirty) sessionStorage.setItem(draftKey, JSON.stringify({ baseline, draft }));
      else sessionStorage.removeItem(draftKey);
    } catch {
      /* Editing and server saves remain available when browser storage is full. */
    }
  }, [baseline, draft, dirty, draftKey]);

  async function save() {
    if (pending || locked || !dirty || conflict || !form.current?.reportValidity()) return;
    setError('');
    if (!draft.titulo.trim()) {
      setError('Escribe un título para la nota.');
      return;
    }
    if (bytes > MAX_NOTE_BYTES) {
      setError('El contenido Markdown no puede superar 1 MB.');
      return;
    }
    try {
      const note = await run<Note>('guardar_nota', {
        id: draft.id,
        version: baseline.version || undefined,
        titulo: draft.titulo.trim(),
        contenido_md: draft.contenido_md,
        proyecto_ids: draft.proyecto_ids,
        tarea_ids: draft.tarea_ids,
      });
      setBaseline(note);
      setDraft(note);
      onSaved(note);
      notify('Nota guardada.', 'success');
    } catch (cause) {
      setError(readableError(cause));
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
      className="note-editor"
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
          <Badge>.md</Badge>
          <span className="field__hint" role="status">
            {pending ? 'Guardando…' : dirty ? 'Cambios sin guardar' : 'Guardada'}
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
            disabled={pending || !dirty || conflict || bytes > MAX_NOTE_BYTES}
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
              {!latest ? ' La nota ya no está disponible.' : ''}
            </p>
            {latest ? (
              <Button disabled={pending} onClick={() => setReloading(true)} icon="refresh">
                Cargar versión guardada
              </Button>
            ) : null}
          </div>
        </div>
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
      </div>
      <div className={`note-editor__panes note-editor__panes--${mode}`}>
        {mode !== 'preview' ? (
          <div className="note-editor__source">
            <label htmlFor="note-markdown" className="sr-only">
              Contenido de la nota en Markdown
            </label>
            <textarea
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
          <section className="note-editor__preview" aria-label="Vista previa Markdown">
            <MarkdownPreview content={preview} />
          </section>
        ) : null}
      </div>
      <div className="note-editor__footer">
        <span># Títulos · **negrita** · - listas · - [ ] tareas · ``` código</span>
        <span>{bytes.toLocaleString('es')} / 1.000.000 bytes · Ctrl / ⌘ + S</span>
      </div>
      <NoteAssociations
        projects={projects}
        tasks={tasks}
        projectIds={draft.proyecto_ids}
        taskIds={draft.tarea_ids}
        disabled={pending}
        onChange={(proyecto_ids, tarea_ids) => setDraft({ ...draft, proyecto_ids, tarea_ids })}
      />
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
          try {
            sessionStorage.removeItem(draftKey);
          } catch {
            /* Storage may be unavailable. */
          }
          onDirty(false);
          onDeleted();
          notify('Nota eliminada.', 'success');
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
            setBaseline(latest);
            setDraft(latest);
            setError('');
          }
        }}
      />
    </form>
  );
}
