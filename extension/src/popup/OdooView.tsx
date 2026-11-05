import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { QueueAction } from '../../../src/features/extension/protocol';
import { ask } from '../shared/messages';
import type { ExtensionState, QueueView, TabContext } from '../shared/messages';
import { Button, ErrorText, Notice } from '../shared/ui';
import { errorMessage } from '../shared/feedback';

const statusLabel: Record<QueueView['status'], { text: string; tone: string }> = {
  pending: { text: 'En cola', tone: '' },
  processing: { text: 'Enviando', tone: 'badge--accent' },
  success: { text: 'Imputado', tone: 'badge--success' },
  error: { text: 'Error', tone: 'badge--danger' },
  uncertain: { text: 'Revisa Odoo', tone: 'badge--warning' },
  'sent-unmarked': { text: 'Sin marcar', tone: 'badge--warning' },
};

const NEW_PROJECT = '__new__';

function TaskImport({ context, onDone }: { context: TabContext; onDone: () => void }) {
  const detected = context.detected!;
  const [title, setTitle] = useState(detected.title);
  const [project, setProject] = useState(
    context.suggestedProjectId ?? (detected.projectName ? NEW_PROJECT : ''),
  );
  const [newName, setNewName] = useState(detected.projectName);
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  if (context.existing?.kind === 'same')
    return (
      <section className="panel task-card stack--tight stack">
        <p className="eyebrow">Tarea de Odoo</p>
        <h2>{detected.title}</h2>
        <p className="form-ok">
          Ya está en Chambapp como «{context.existing.titulo}» en {context.existing.proyecto}.
        </p>
      </section>
    );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await ask<{ kind: string; titulo: string }>({
        type: 'import-task',
        tabId: context.tabId,
        title,
        choice:
          project === NEW_PROJECT
            ? { kind: 'new-project', name: newName }
            : { kind: 'project', projectId: project },
        allowPossibleDuplicate: allowDuplicate,
      });
      if (result.kind === 'possible-duplicate')
        setError('Ya existe una tarea con ese ID. Marca «Crear de todos modos» si es otra.');
      else {
        setDone(
          result.kind === 'existing' ? 'Ya estaba en Chambapp.' : 'Tarea añadida a Chambapp.',
        );
        onDone();
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel task-card stack" onSubmit={submit}>
      <div className="stack stack--tight">
        <div className="row">
          <p className="eyebrow">Tarea de Odoo detectada</p>
          <span className="spacer" />
          {detected.code ? <span className="badge">{detected.code}</span> : null}
        </div>
        <h2>{detected.title}</h2>
        {detected.projectName ? (
          <p className="dim">Proyecto en Odoo: {detected.projectName}</p>
        ) : null}
      </div>
      {context.existing?.kind === 'possible' ? (
        <Notice icon="info" title="Posible duplicado">
          <p>
            Ya hay una tarea con el ID {detected.code} («{context.existing.titulo}»,{' '}
            {context.existing.proyecto}). Puede ser de otra instancia de Odoo.
          </p>
          <label className="row" style={{ marginTop: 6 }}>
            <input
              type="checkbox"
              checked={allowDuplicate}
              onChange={(event) => setAllowDuplicate(event.target.checked)}
            />
            Crear de todos modos
          </label>
        </Notice>
      ) : null}
      <div className="field">
        <label htmlFor="task-title">Nombre en Chambapp</label>
        <input
          id="task-title"
          value={title}
          maxLength={300}
          onChange={(event) => setTitle(event.target.value)}
          required
          disabled={busy}
        />
      </div>
      <div className="field">
        <label htmlFor="task-project">Proyecto</label>
        <select
          id="task-project"
          value={project}
          onChange={(event) => setProject(event.target.value)}
          required
          disabled={busy}
        >
          <option value="" disabled>
            Elige un proyecto
          </option>
          {context.projects.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nombre}
            </option>
          ))}
          <option value={NEW_PROJECT}>+ Crear proyecto nuevo…</option>
        </select>
        {project === NEW_PROJECT ? (
          <input
            aria-label="Nombre del proyecto nuevo"
            value={newName}
            maxLength={200}
            onChange={(event) => setNewName(event.target.value)}
            required
            disabled={busy}
          />
        ) : null}
      </div>
      <ErrorText>{error}</ErrorText>
      {done ? <p className="form-ok">{done}</p> : null}
      <Button
        type="submit"
        variant="primary"
        icon="plus"
        block
        disabled={busy || (context.existing?.kind === 'possible' && !allowDuplicate)}
      >
        {busy ? 'Añadiendo…' : 'Añadir a Chambapp'}
      </Button>
    </form>
  );
}

function QueueList({
  items,
  onAction,
  busy,
}: {
  items: QueueView[];
  onAction: (id: string, action: QueueAction) => void;
  busy: boolean;
}) {
  if (!items.length)
    return <p className="dim">Los partes que envíes desde Parte semanal aparecerán aquí.</p>;
  return (
    <ul className="list">
      {items.map((item) => {
        const label = statusLabel[item.status];
        return (
          <li key={item.requestId} className="list-item queue-item">
            <div className="row" style={{ width: '100%' }}>
              <span className="mono">{item.request.fecha}</span>
              <span className="mono">{item.request.horasFormato}</span>
              <span className="spacer" />
              <span className={`badge ${label.tone}`}>{label.text}</span>
            </div>
            <span
              className="truncate muted"
              style={{ width: '100%' }}
              title={item.request.descripcion}
            >
              {item.request.descripcion}
            </span>
            {item.error ? <span className="field__hint">{item.error}</span> : null}
            <div className="row row--wrap">
              {item.status === 'error' ? (
                <Button disabled={busy} onClick={() => onAction(item.requestId, 'retry')}>
                  Reintentar
                </Button>
              ) : null}
              {item.status === 'uncertain' ? (
                <>
                  <Button
                    disabled={busy}
                    onClick={() => onAction(item.requestId, 'confirm-not-created')}
                  >
                    No se creó: reintentar
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => onAction(item.requestId, 'confirm-created')}
                  >
                    Sí se creó: marcar
                  </Button>
                </>
              ) : null}
              {['pending', 'error', 'sent-unmarked', 'success'].includes(item.status) ? (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onAction(item.requestId, 'discard')}
                >
                  {item.status === 'success' ? 'Quitar' : 'Descartar'}
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function OdooView({ state, tab }: { state: ExtensionState; tab: chrome.tabs.Tab | null }) {
  const [context, setContext] = useState<TabContext | null>(null);
  const [queue, setQueue] = useState<QueueView[]>([]);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const origin = state.settings.odooOrigin;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      tab?.id !== undefined && origin
        ? ask<TabContext>({ type: 'tab-context', tabId: tab.id })
        : Promise.resolve(null),
      ask<QueueView[]>({ type: 'queue-list' }),
    ]).then(
      ([nextContext, nextQueue]) => {
        if (cancelled) return;
        setContext(nextContext);
        setQueue(nextQueue);
      },
      (cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [tab, origin, version]);

  useEffect(() => {
    const listener = (message: { channel?: string }) => {
      if (message?.channel === 'queue-changed')
        void ask<QueueView[]>({ type: 'queue-list' }).then(setQueue, () => undefined);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const [acting, setActing] = useState(false);
  async function act(requestId: string, action: QueueAction) {
    if (acting) return;
    setError('');
    setActing(true);
    try {
      setQueue(await ask<QueueView[]>({ type: 'queue-action', requestId, action }));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setActing(false);
    }
  }

  if (!state.settings.odooOrigin || !state.odooPermission)
    return (
      <Notice icon="settings" title="Configura tu Odoo">
        <p>Indica la dirección de tu Odoo en los ajustes para detectar tareas y enviar partes.</p>
        <Button style={{ marginTop: 8 }} onClick={() => void chrome.runtime.openOptionsPage()}>
          Abrir ajustes
        </Button>
      </Notice>
    );

  return (
    <div className="stack">
      <ErrorText>{error}</ErrorText>
      {context?.detected ? (
        <TaskImport
          key={context.detected.url}
          context={context}
          onDone={() => setVersion((value) => value + 1)}
        />
      ) : (
        <Notice icon="external" title="Abre una tarea en Odoo">
          <p>
            En la ficha de una tarea de <span className="mono">{state.settings.odooOrigin}</span> el
            icono muestra «+» y aquí podrás añadirla a Chambapp.
          </p>
        </Notice>
      )}
      <div className="section-title">
        <p className="eyebrow">Envíos a Odoo</p>
      </div>
      <QueueList items={queue} busy={acting} onAction={(id, action) => void act(id, action)} />
    </div>
  );
}
