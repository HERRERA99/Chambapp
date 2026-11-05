import {
  cleanOdooRequest,
  odooRequestProblem,
  sameOrigin,
} from '../../../src/features/extension/protocol';
import type { OdooRequest, QueueAction } from '../../../src/features/extension/protocol';
import {
  applyQueueAction,
  enqueueDecision,
  failureStatus,
  interruptedStatus,
  mayHaveWritten,
  purgeQueue,
  revalidationProblem,
  summarizeQueue,
  taskChangedProblem,
  verificationStatus,
} from '../shared/queue';
import { parseOdooTaskUrl } from '../shared/odooTask';
import type { QueueItem, QueuePhase } from '../shared/queue';
import { ATTEMPT_PORT_PREFIX } from '../shared/automation';
import type { AttemptConfig, DateFormat, ScriptMessage, WorkerMessage } from '../shared/automation';
import type { QueueView } from '../shared/messages';
import { getSettings, hasOdooPermission } from './settings';
import { command, currentSession, message } from './supabase';
import { loadEntryRows, loadTaskAndProject } from './workspace';

const QUEUE_KEY = 'chambapp_odoo_queue_v1';
const ATTEMPT_MS = 90_000;
const VERIFY_MS = 60_000;
const ACK_GRACE_MS = 5_000;

type Listener = () => void;
const listeners = new Set<Listener>();
export const onQueueChange = (listener: Listener) => listeners.add(listener);

// ---------------------------------------------------------------- storage

let lock: Promise<unknown> = Promise.resolve();

/** Every read-modify-write of the queue runs one after another. */
function withQueue<T>(change: (queue: QueueItem[]) => Promise<T> | T): Promise<T> {
  const next = lock.then(async () => {
    const queue = ((await chrome.storage.local.get(QUEUE_KEY))[QUEUE_KEY] as QueueItem[]) ?? [];
    const result = await change(queue);
    await chrome.storage.local.set({ [QUEUE_KEY]: purgeQueue(queue, Date.now()) });
    return result;
  });
  lock = next.catch(() => undefined);
  void next.then(() => listeners.forEach((listener) => listener())).catch(() => undefined);
  return next;
}

export async function readQueue(): Promise<QueueItem[]> {
  await lock.catch(() => undefined);
  return ((await chrome.storage.local.get(QUEUE_KEY))[QUEUE_KEY] as QueueItem[]) ?? [];
}

function update(id: string, patch: Partial<QueueItem>) {
  return withQueue((queue) => {
    const item = queue.find((entry) => entry.id === id);
    if (item) Object.assign(item, patch, { updatedAt: Date.now() });
    return item ? { ...item } : null;
  });
}

export async function queueSummary() {
  const session = await currentSession();
  return summarizeQueue(await readQueue(), session?.user.id ?? null);
}

export async function queueViews(): Promise<QueueView[]> {
  const session = await currentSession();
  return (await readQueue())
    .filter((item) => item.request.userId === session?.user.id)
    .map((item) => ({
      requestId: item.id,
      status: item.status,
      phase: item.phase,
      error: item.error,
      updatedAt: item.updatedAt,
      request: {
        fecha: item.request.fecha,
        descripcion: item.request.descripcion,
        horasFormato: item.request.horasFormato,
        odooUrl: item.request.odooUrl,
        partes: item.request.partes.length,
      },
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Drops what a previous account left waiting; its uncertain items stay hidden for review. */
export function forgetOtherAccounts(userId: string) {
  return withQueue((queue) => {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const item = queue[index]!;
      if (item.request.userId !== userId && ['pending', 'error'].includes(item.status))
        queue.splice(index, 1);
    }
  });
}

// ---------------------------------------------------------------- requests

export async function enqueue(raw: unknown): Promise<QueueItem> {
  const problem = odooRequestProblem(raw);
  if (problem) throw new Error(problem);
  const request = cleanOdooRequest(raw as OdooRequest);
  const session = await currentSession();
  if (!session || session.user.id !== request.userId)
    throw new Error('La extensión está conectada con otra cuenta. Inicia sesión con esta cuenta.');
  const { odooOrigin } = await getSettings();
  if (!odooOrigin)
    throw new Error('Configura la dirección de Odoo en los ajustes de la extensión.');
  if (!sameOrigin(request.odooUrl, odooOrigin))
    throw new Error(`La tarea no pertenece al Odoo configurado (${odooOrigin}).`);
  if (!(await hasOdooPermission(odooOrigin)))
    throw new Error(
      'Falta el permiso para acceder a tu Odoo: revísalo en los ajustes de la extensión.',
    );
  const item = await withQueue((queue) => {
    const decision = enqueueDecision(queue, request, Date.now());
    if (decision.kind === 'existing') return { ...decision.item };
    for (const id of decision.replaced) {
      const index = queue.findIndex((entry) => entry.id === id);
      if (index >= 0) queue.splice(index, 1);
    }
    queue.push(decision.item);
    return { ...decision.item };
  });
  void processQueue();
  return item;
}

export async function queueAction(requestId: string, action: QueueAction) {
  const session = await currentSession();
  if (!session) throw new Error('Inicia sesión en la extensión.');
  const token = crypto.randomUUID();
  const outcome = await withQueue((queue) => {
    const index = queue.findIndex(
      (entry) => entry.id === requestId && entry.request.userId === session.user.id,
    );
    if (index < 0) throw new Error('El envío ya no existe.');
    const result = applyQueueAction(queue[index]!, action, Date.now(), token);
    if (result.kind === 'invalid') throw new Error('Esa acción no está disponible ahora.');
    if (result.kind === 'remove') {
      queue.splice(index, 1);
      return { kind: result.kind, item: null };
    }
    queue[index] = result.item;
    return { kind: result.kind, item: { ...result.item } };
  });
  if (outcome.kind === 'mark' && outcome.item) {
    liveMarkings.add(token);
    try {
      await markEntries(outcome.item, token);
    } finally {
      liveMarkings.delete(token);
    }
  }
  void processQueue();
}

// ---------------------------------------------------------------- attempts

type Attempt = {
  itemId: string;
  tabId: number;
  config: AttemptConfig;
  port: chrome.runtime.Port | null;
  /** The old document's port closes on purpose while we reload for verification. */
  expectDisconnect: boolean;
  /** Settled: no further write may be acknowledged. */
  done: boolean;
  settle: (result: AttemptResult) => void;
};

type AttemptResult =
  | { kind: 'form-saved' }
  | { kind: 'failed'; error: string }
  | { kind: 'interrupted'; error: string };

const attempts = new Map<string, Attempt>();
let running = false;

function postToScript(attempt: Attempt, message: WorkerMessage) {
  try {
    attempt.port?.postMessage(message);
  } catch {
    // The page is gone; the timeout or disconnect handler settles the attempt.
  }
}

/** Port opened by content/odoo-timesheet.js for one attempt. */
export function handleAttemptPort(port: chrome.runtime.Port) {
  const attemptId = port.name.slice(ATTEMPT_PORT_PREFIX.length);
  const attempt = attempts.get(attemptId);
  const sender = port.sender;
  if (
    !attempt ||
    attempt.port ||
    sender?.tab?.id !== attempt.tabId ||
    sender.frameId !== 0 ||
    !sender.url ||
    !sameOrigin(sender.url, attempt.config.origin)
  ) {
    port.disconnect();
    return;
  }
  attempt.port = port;
  port.onMessage.addListener((raw: ScriptMessage) => {
    if (!raw || raw.attemptId !== attemptId) return;
    void onScriptMessage(attempt, raw);
  });
  port.onDisconnect.addListener(() => {
    attempt.port = null;
    if (!attempt.expectDisconnect)
      attempt.settle({
        kind: 'interrupted',
        error: 'Se perdió la conexión con la pestaña de Odoo.',
      });
  });
}

async function onScriptMessage(attempt: Attempt, message: ScriptMessage) {
  switch (message.type) {
    case 'heartbeat':
      return;
    case 'phase':
      await update(attempt.itemId, { phase: message.phase });
      return;
    case 'counted':
      if (Number.isSafeInteger(message.count) && message.count >= 0)
        await update(attempt.itemId, { before: message.count });
      return;
    case 'about-to-write': {
      if (attempt.done) return;
      // Persist first: after this point a restart can never treat the attempt as safe to retry.
      const saved = await update(attempt.itemId, { phase: 'may-have-written' });
      if (
        !attempt.done &&
        saved?.attemptId === attempt.config.attemptId &&
        saved.status === 'processing'
      )
        postToScript(attempt, { type: 'write-ack', attemptId: attempt.config.attemptId });
      return;
    }
    case 'form-saved':
      await update(attempt.itemId, { phase: 'form-saved' });
      attempt.settle({ kind: 'form-saved' });
      return;
    case 'failed':
      attempt.settle({ kind: 'failed', error: String(message.error).slice(0, 500) });
      return;
  }
}

function waitForLoad(tabId: number, timeout: number) {
  return new Promise<chrome.tabs.Tab>((resolve, reject) => {
    const started = Date.now();
    const check = () =>
      chrome.tabs.get(tabId).then(
        (tab) => {
          if (tab.status === 'complete') return resolve(tab);
          if (Date.now() - started > timeout)
            return reject(new Error('La página de Odoo no terminó de cargar.'));
          setTimeout(check, 250);
        },
        () => reject(new Error('Se cerró la pestaña de Odoo.')),
      );
    check();
  });
}

async function closeWindow(item: QueueItem) {
  if (item.windowId !== null) await chrome.windows.remove(item.windowId).catch(() => undefined);
  else if (item.tabId !== null) await chrome.tabs.remove(item.tabId).catch(() => undefined);
}

async function cancelInTab(tabId: number | null) {
  if (tabId === null) return;
  await chrome.scripting
    .executeScript({
      target: { tabId, frameIds: [0] },
      func: () => globalThis.__chambappOdoo?.cancel(),
    })
    .catch(() => undefined);
}

/** Stops an attempt that did not finish: safe to retry only before the write boundary. */
async function interrupt(itemId: string, reason: string) {
  const item = (await readQueue()).find((entry) => entry.id === itemId);
  if (!item || item.status !== 'processing') return;
  await cancelInTab(item.tabId);
  const status = interruptedStatus(item.phase);
  if (status === 'error') await closeWindow(item);
  await update(itemId, {
    status,
    error:
      status === 'error'
        ? `${reason} No se llegó a guardar nada en Odoo; puedes reintentarlo.`
        : `${reason} Revisa en Odoo si la línea se creó antes de decidir.`,
    attemptId: null,
    ...(status === 'error' ? { tabId: null, windowId: null } : {}),
  });
}

/** Markings running in this worker; a claim not listed here was left by a dead worker. */
const liveMarkings = new Set<string>();

/** Final update of a marking, applied only if `token` still holds the item (null: no claim). */
function finishMarking(id: string, token: string | null, patch: Partial<QueueItem>) {
  return withQueue((queue) => {
    const item = queue.find((entry) => entry.id === id);
    if (!item || (item.marking ?? null) !== token) return;
    Object.assign(item, patch, { marking: null, updatedAt: Date.now() });
  });
}

async function markEntries(item: QueueItem, token: string | null = null) {
  try {
    const { task, project } = await loadTaskAndProject(item.request.taskId, item.request.userId);
    const changed = taskChangedProblem(item.request, task, project);
    if (changed) {
      await finishMarking(item.id, token, { status: 'sent-unmarked', error: changed });
      return;
    }
    await command('imputar_partes', { partes: item.request.partes }, item.request.userId);
    await finishMarking(item.id, token, { status: 'success', phase: 'done', error: '' });
  } catch (cause) {
    await finishMarking(item.id, token, {
      status: 'sent-unmarked',
      error: `Se envió a Odoo pero no se pudo marcar en Chambapp: ${message(cause)}`,
    });
  }
  notifyWorkspaceChanged();
}

let workspaceListener: (() => void) | null = null;
export const onWorkspaceChanged = (listener: () => void) => {
  workspaceListener = listener;
};
const notifyWorkspaceChanged = () => workspaceListener?.();

async function runAttempt(item: QueueItem): Promise<void> {
  const { odooOrigin, odooDateFormat } = await getSettings();
  const fail = (error: string) => update(item.id, { status: 'error', phase: 'idle', error });
  if (
    !odooOrigin ||
    !sameOrigin(item.request.odooUrl, odooOrigin) ||
    !(await hasOdooPermission(odooOrigin))
  )
    return void (await fail('El Odoo configurado ha cambiado o falta su permiso.'));

  // 1. Nothing is written to Odoo unless the entries are exactly as when "Enviar" was pressed.
  try {
    const [rows, { task, project }] = await Promise.all([
      loadEntryRows(
        item.request.partes.map((part) => part.id),
        item.request.userId,
      ),
      loadTaskAndProject(item.request.taskId, item.request.userId),
    ]);
    const stale = revalidationProblem(item.request, rows, task, project);
    if (stale) return void (await fail(stale));
  } catch (cause) {
    return void (await fail(`No se pudieron comprobar los partes: ${message(cause)}`));
  }

  const record = parseOdooTaskUrl(item.request.odooUrl, { assumeTask: true });
  if (!record || record.origin !== odooOrigin)
    return void (await fail('No se reconoce la tarea en el enlace de Odoo de esta tarea.'));
  const attemptId = crypto.randomUUID();
  const config: AttemptConfig = {
    attemptId,
    deadline: Date.now() + ATTEMPT_MS,
    origin: odooOrigin,
    recordId: record.recordId,
    fecha: item.request.fecha,
    dateFormat: odooDateFormat,
    descripcion: item.request.descripcion,
    horasFormato: item.request.horasFormato,
  };
  let window: chrome.windows.Window | undefined;
  try {
    window = await chrome.windows.create({
      url: item.request.odooUrl,
      focused: false,
      type: 'normal',
    });
  } catch {
    // Some browsers (Firefox) refuse an unfocused new window: open it normally.
    window = await chrome.windows
      .create({ url: item.request.odooUrl, type: 'normal' })
      .catch(() => undefined);
  }
  const tabId = window?.tabs?.[0]?.id;
  if (tabId === undefined) return void (await fail('No se pudo abrir Odoo.'));
  await update(item.id, {
    status: 'processing',
    phase: 'opening',
    error: '',
    attempts: item.attempts + 1,
    attemptId,
    tabId,
    windowId: window?.id ?? null,
    before: null,
  });

  const result = await new Promise<AttemptResult>((resolve) => {
    let settled = false;
    const attempt: Attempt = {
      itemId: item.id,
      tabId,
      config,
      port: null,
      expectDisconnect: false,
      done: false,
      settle: (value) => {
        if (settled) return;
        settled = true;
        attempt.done = true;
        clearTimeout(timer);
        attempt.expectDisconnect = true;
        resolve(value);
      },
    };
    const timer = setTimeout(
      () => attempt.settle({ kind: 'interrupted', error: 'Odoo tardó demasiado.' }),
      ATTEMPT_MS + ACK_GRACE_MS,
    );
    attempts.set(attemptId, attempt);
    void (async () => {
      try {
        const tab = await waitForLoad(tabId, ATTEMPT_MS);
        if (
          !tab.url ||
          !sameOrigin(tab.url, odooOrigin) ||
          parseOdooTaskUrl(tab.url, { assumeTask: true })?.recordId !== record.recordId
        )
          return attempt.settle({
            kind: 'failed',
            error: 'Odoo no abrió la tarea: comprueba que has iniciado sesión en Odoo.',
          });
        await chrome.scripting.executeScript({
          target: { tabId, frameIds: [0] },
          files: ['/content/odoo-timesheet.js'],
        });
        const [started] = await chrome.scripting.executeScript({
          target: { tabId, frameIds: [0] },
          func: (value: AttemptConfig) => globalThis.__chambappOdoo?.start(value) ?? false,
          args: [config],
        });
        if (started?.result !== true)
          attempt.settle({ kind: 'failed', error: 'No se pudo preparar la página de Odoo.' });
      } catch (cause) {
        attempt.settle({ kind: 'failed', error: message(cause) });
      }
    })();
  });

  const current = (await readQueue()).find((entry) => entry.id === item.id);
  if (!current || current.attemptId !== attemptId) {
    attempts.delete(attemptId);
    return;
  }
  if (result.kind === 'interrupted') {
    attempts.delete(attemptId);
    return void (await interrupt(item.id, result.error));
  }
  if (result.kind === 'failed') {
    attempts.delete(attemptId);
    await cancelInTab(tabId);
    const status = interruptedStatus(current.phase);
    // The window stays open so the user can see what Odoo showed.
    return void (await update(item.id, {
      status,
      error:
        status === 'error'
          ? `${result.error} No se guardó nada en Odoo; puedes reintentarlo.`
          : `${result.error} Revisa en Odoo si la línea se creó antes de decidir.`,
      attemptId: null,
    }));
  }

  // 2. Verification after a reload: exactly one more matching line, across every page.
  let after: number | null = null;
  try {
    await update(item.id, { phase: 'reloading' });
    await chrome.tabs.reload(tabId);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const tab = await waitForLoad(tabId, VERIFY_MS);
    if (tab.url && sameOrigin(tab.url, odooOrigin)) {
      await update(item.id, { phase: 'verifying' });
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        files: ['/content/odoo-timesheet.js'],
      });
      const [counted] = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        func: (
          recordId: number,
          fecha: string,
          format: DateFormat,
          descripcion: string,
          horas: string,
        ) => globalThis.__chambappOdoo?.count(recordId, fecha, format, descripcion, horas) ?? null,
        args: [
          record.recordId,
          item.request.fecha,
          odooDateFormat,
          item.request.descripcion,
          item.request.horasFormato,
        ],
      });
      after = typeof counted?.result === 'number' ? counted.result : null;
    }
  } catch {
    after = null;
  } finally {
    attempts.delete(attemptId);
  }
  const verified = (await readQueue()).find((entry) => entry.id === item.id);
  if (!verified || verified.attemptId !== attemptId) return;
  if (verificationStatus(verified.before, after) !== 'success') {
    return void (await update(item.id, {
      status: 'uncertain',
      attemptId: null,
      error:
        'No se pudo comprobar que la línea quedó guardada en Odoo. Revisa la tarea en Odoo antes de decidir.',
    }));
  }
  await update(item.id, { phase: 'done', attemptId: null });
  await closeWindow(verified);
  await update(item.id, { tabId: null, windowId: null });
  await markEntries(verified);
}

/**
 * An error outside the expected paths: the persisted phase decides. Before the
 * write boundary it is a plain error; after it the line may be in Odoo.
 */
async function failUnexpectedly(id: string, reason: string) {
  const item = (await readQueue().catch(() => [])).find((entry) => entry.id === id);
  if (!item || item.status !== 'processing') return;
  for (const attempt of attempts.values())
    if (attempt.itemId === id) attempt.settle({ kind: 'interrupted', error: reason });
  await cancelInTab(item.tabId);
  const status = failureStatus(item.phase);
  if (status === 'error') await closeWindow(item);
  await update(id, {
    status,
    attemptId: null,
    error:
      status === 'error'
        ? `${reason} No se guardó nada en Odoo; puedes reintentarlo.`
        : status === 'uncertain'
          ? `${reason} Revisa en Odoo si la línea se creó antes de decidir.`
          : `La línea se guardó en Odoo, pero no se pudo marcar aquí: ${reason}`,
  });
}

/**
 * Sign-out: unstarted work of that account is dropped and running attempts are
 * stopped through the write boundary (after it they stay "uncertain" for review).
 */
export async function clearSessionWork(userId: string) {
  for (const attempt of attempts.values())
    attempt.settle({ kind: 'interrupted', error: 'Se cerró la sesión de la extensión.' });
  await resolveOrphans();
  await withQueue((queue) => {
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const item = queue[index]!;
      if (item.request.userId === userId && ['pending', 'error'].includes(item.status))
        queue.splice(index, 1);
    }
  });
}

/** One request at a time, only for the signed-in account. */
export async function processQueue() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const session = await currentSession();
      if (!session) return;
      const queue = await readQueue();
      if (queue.some((entry) => entry.status === 'processing')) return;
      const next = queue.find(
        (entry) => entry.status === 'pending' && entry.request.userId === session.user.id,
      );
      if (!next) return;
      try {
        await runAttempt(next);
      } catch (cause) {
        await failUnexpectedly(next.id, message(cause));
      }
    }
  } finally {
    running = false;
  }
}

/**
 * Attempts this worker does not know about (it restarted) or that ran out of
 * time are stopped; past the write boundary they become "uncertain".
 */
export async function resolveOrphans() {
  const queue = await readQueue();
  for (const item of queue)
    if (item.marking && !liveMarkings.has(item.marking))
      await finishMarking(item.id, item.marking, {});
  for (const item of queue) {
    if (item.status !== 'processing') continue;
    const live = item.attemptId ? attempts.get(item.attemptId) : undefined;
    const overdue = Date.now() - item.updatedAt > ATTEMPT_MS + VERIFY_MS;
    if (!live || overdue) {
      if (live) live.settle({ kind: 'interrupted', error: 'Odoo tardó demasiado.' });
      else await interrupt(item.id, 'El envío se interrumpió.');
    }
  }
}

/** A tab closed while its attempt was running. */
export async function onTabClosed(tabId: number) {
  for (const attempt of attempts.values())
    if (attempt.tabId === tabId)
      attempt.settle({ kind: 'interrupted', error: 'Se cerró la pestaña de Odoo.' });
  const queue = await readQueue();
  for (const item of queue)
    if (item.tabId === tabId && item.status !== 'processing')
      await update(item.id, { tabId: null, windowId: null });
}

export const phaseLabel: Record<QueuePhase, string> = {
  idle: 'En cola',
  opening: 'Abriendo Odoo',
  counting: 'Leyendo la tarea',
  filling: 'Rellenando la línea',
  'may-have-written': 'Guardando en Odoo',
  'form-saved': 'Guardado',
  reloading: 'Comprobando',
  verifying: 'Comprobando',
  done: 'Hecho',
};

export { mayHaveWritten };
