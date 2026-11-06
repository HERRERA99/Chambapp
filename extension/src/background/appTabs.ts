// Chambapp tabs and the messages the worker sends them, including the questions about
// the data kept in that browser (Plan 11): the worker cannot read the app's IndexedDB,
// so it asks an open Chambapp tab of the same account.
import { EXTENSION_SOURCE } from '../../../src/features/extension/protocol.ts';
import type { ExtensionMessage, LocalOperation } from '../../../src/features/extension/protocol.ts';
import { originPattern } from '../shared/patterns.ts';

export const APP_ORIGINS = ['https://chambapp-tracker.vercel.app', 'http://127.0.0.1:5173'];

export async function appTabs() {
  // Patterns without ports (Firefox ignores ported ones); the exact origin is checked here.
  const tabs = await chrome.tabs.query({ url: APP_ORIGINS.map(originPattern) });
  return tabs.filter((tab) => {
    try {
      return tab.id !== undefined && !!tab.url && APP_ORIGINS.includes(new URL(tab.url).origin);
    } catch {
      return false;
    }
  });
}

export async function toApp(message: ExtensionMessage, tabId?: number) {
  const targets = tabId !== undefined ? [{ id: tabId }] : await appTabs();
  for (const tab of targets)
    await chrome.tabs.sendMessage(tab.id!, { channel: 'to-app', message }).catch(() => undefined);
}

type Waiting = {
  tabs: Set<number>;
  errors: string[];
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
};
const waiting = new Map<string, Waiting>();

export const NO_APP_TAB =
  'Abre Chambapp en una pestaña de este navegador y desbloquea tus datos locales.';

/**
 * Asks the open Chambapp tabs; the first one that can answer wins. Fails when there
 * is no tab, every tab refuses (data locked) or none answers in time.
 */
export async function askApp<T>(userId: string, op: LocalOperation, timeout = 10_000): Promise<T> {
  const tabs = await appTabs();
  if (!tabs.length) throw new Error(NO_APP_TAB);
  const requestId = crypto.randomUUID();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      waiting.delete(requestId);
      reject(new Error(NO_APP_TAB));
    }, timeout);
    waiting.set(requestId, {
      tabs: new Set(tabs.map((tab) => tab.id!)),
      errors: [],
      resolve: (data) => {
        clearTimeout(timer);
        resolve(data as T);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    void toApp({ source: EXTENSION_SOURCE, type: 'local-request', requestId, userId, op }).catch(
      () => undefined,
    );
  });
}

/** A Chambapp tab answered (validated by the caller: top frame of an app tab). */
export function onLocalReply(
  reply: { requestId: string; ok: boolean; error: string; data?: unknown },
  tabId: number,
) {
  const entry = waiting.get(reply.requestId);
  if (!entry || !entry.tabs.has(tabId)) return;
  entry.tabs.delete(tabId);
  if (reply.ok) {
    waiting.delete(reply.requestId);
    entry.resolve(reply.data);
    return;
  }
  entry.errors.push(reply.error);
  if (!entry.tabs.size) {
    waiting.delete(reply.requestId);
    entry.reject(new Error(entry.errors[0] || NO_APP_TAB));
  }
}
