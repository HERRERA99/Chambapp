import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import { APP_SOURCE, isExtensionMessage, lockedIds } from './protocol';
import type {
  AppMessage,
  ExtensionHello,
  OdooRequest,
  QueueAction,
  QueueSummaryItem,
} from './protocol';
import { ExtensionContext, SENDING_TO_ODOO } from './useExtension';
import { ExtensionTutorial } from './ExtensionTutorial';
import { readTutorialStep } from './extensionDownload';
import type { ExtensionStatus } from './useExtension';

type Pending = Map<string, (result: { ok: boolean; error: string }) => void>;

function post(message: AppMessage) {
  window.postMessage(message, window.location.origin);
}

/**
 * Talks to the Chambapp browser extension through its bridge script (only
 * present on Chambapp's own origins). Without the extension everything stays
 * disabled and nothing is sent.
 */
export function ExtensionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [hello, setHello] = useState<ExtensionHello | null>(null);
  // A step saved before reloading the page reopens the tutorial where it was.
  const [tutorial, setTutorial] = useState<{ step: number; download: boolean } | null>(() => {
    const step = readTutorialStep();
    return step === null ? null : { step, download: false };
  });
  /** Pings without an answer: after an uninstall the bridge stops replying. */
  const unanswered = useRef(0);
  const [queue, setQueue] = useState<QueueSummaryItem[]>([]);
  const pending = useRef<Pending>(new Map());

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data as unknown;
      if (!isExtensionMessage(message)) return;
      if (message.type === 'hello') {
        unanswered.current = 0;
        setHello({
          version: message.version,
          userId: message.userId,
          odooOrigin: message.odooOrigin,
        });
      } else if (message.type === 'queue') setQueue(message.items);
      else if (message.type === 'workspace-changed') {
        if (user)
          void queryClient
            .invalidateQueries({ queryKey: ['workspace', user.id] })
            .catch(() => undefined);
      } else {
        const resolve = pending.current.get(message.requestId);
        if (resolve) {
          pending.current.delete(message.requestId);
          resolve({ ok: message.ok, error: message.error });
        }
      }
    }
    window.addEventListener('message', onMessage);
    // The bridge may load after the app: ask a few times, and again on focus.
    const ping = () => post({ source: APP_SOURCE, type: 'ping' });
    ping();
    const retries = [500, 1500, 3000].map((delay) => setTimeout(ping, delay));
    window.addEventListener('focus', ping);
    // Heartbeat: two unanswered pings in a row mean the extension is gone.
    const heartbeat = setInterval(() => {
      unanswered.current += 1;
      if (unanswered.current > 2) setHello(null);
      ping();
    }, 10_000);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('focus', ping);
      retries.forEach(clearTimeout);
      clearInterval(heartbeat);
    };
  }, [queryClient, user]);

  const request = useCallback((requestId: string, message: AppMessage) => {
    return new Promise<{ ok: boolean; error: string }>((resolve) => {
      const timer = setTimeout(() => {
        pending.current.delete(requestId);
        resolve({ ok: false, error: 'La extensión no ha respondido. Recarga la página.' });
      }, 15_000);
      pending.current.set(requestId, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      post(message);
    });
  }, []);

  const value = useMemo<ExtensionStatus>(() => {
    const connected = !!hello && !!user && hello.userId === user.id;
    const mine = connected ? queue : [];
    const locked = lockedIds(mine);
    return {
      available: !!hello,
      connected,
      otherAccount: !!hello && !connected,
      odooOrigin: connected ? hello.odooOrigin : null,
      version: hello?.version ?? null,
      refresh: () => post({ source: APP_SOURCE, type: 'ping' }),
      openTutorial: ({ download = false } = {}) => setTutorial({ step: 0, download }),
      queue: mine,
      send: (odooRequest: OdooRequest) =>
        request(odooRequest.requestId, {
          source: APP_SOURCE,
          type: 'send-odoo',
          request: odooRequest,
        }),
      act: (requestId: string, action: QueueAction) =>
        request(requestId, { source: APP_SOURCE, type: 'queue-action', requestId, action }),
      lockReason: ({ entryIds = [], taskIds = [] }) =>
        entryIds.some((id) => locked.entries.has(id)) || taskIds.some((id) => locked.tasks.has(id))
          ? SENDING_TO_ODOO
          : null,
    };
  }, [hello, queue, request, user]);

  return (
    <ExtensionContext.Provider value={value}>
      {children}
      {tutorial ? (
        <ExtensionTutorial
          initialStep={tutorial.step}
          downloadOnOpen={tutorial.download}
          onClose={() => setTutorial(null)}
        />
      ) : null}
    </ExtensionContext.Provider>
  );
}
