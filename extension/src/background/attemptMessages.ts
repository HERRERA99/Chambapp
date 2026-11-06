// Worker side of one attempt's port: what each message from content/odoo-timesheet.js
// does. Kept free of chrome.* calls so the ordering rules can be tested.
import type { AttemptConfig, ScriptMessage, WorkerMessage } from '../shared/automation';
import type { QueueItem } from '../shared/queue';

export type AttemptResult =
  | { kind: 'form-saved' }
  | { kind: 'failed'; error: string }
  | { kind: 'interrupted'; error: string };

export type Attempt = {
  itemId: string;
  tabId: number;
  config: AttemptConfig;
  port: { postMessage(message: WorkerMessage): void; disconnect(): void } | null;
  /** The port may close without interrupting: final message received, or reload on purpose. */
  expectDisconnect: boolean;
  /** Settled: no further write may be acknowledged. */
  done: boolean;
  stopFocus: () => void;
  settle: (result: AttemptResult) => void;
};

export type AttemptDeps = {
  /** Persists a patch of the queue item; resolves to the updated copy (null if gone). */
  update: (id: string, patch: Partial<QueueItem>) => Promise<QueueItem | null>;
};

function postToScript(attempt: Attempt, message: WorkerMessage) {
  try {
    attempt.port?.postMessage(message);
  } catch {
    // The page is gone; the timeout or disconnect handler settles the attempt.
  }
}

export async function onScriptMessage(
  attempt: Attempt,
  message: ScriptMessage,
  { update }: AttemptDeps,
) {
  switch (message.type) {
    case 'heartbeat':
      return;
    case 'phase':
      // The task form has rendered: the window no longer needs to stay in front.
      if (message.phase === 'counting') attempt.stopFocus();
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
      // Synchronously, before any await: a disconnect while storage is busy must not
      // turn a saved line into "interrupted". The reload check decides the outcome.
      attempt.expectDisconnect = true;
      try {
        await update(attempt.itemId, { phase: 'form-saved' });
      } catch {
        // The persisted phase stays "may have written"; the verification still runs.
      }
      attempt.settle({ kind: 'form-saved' });
      return;
    case 'failed':
      attempt.expectDisconnect = true;
      attempt.settle({ kind: 'failed', error: String(message.error).slice(0, 500) });
      return;
  }
}

/** The script's port closed. */
export function onAttemptDisconnect(attempt: Attempt) {
  attempt.port = null;
  if (!attempt.expectDisconnect)
    attempt.settle({
      kind: 'interrupted',
      error: 'Se perdió la conexión con la pestaña de Odoo.',
    });
}
