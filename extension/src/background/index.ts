import { EXTENSION_SOURCE, isAppMessage } from '../../../src/features/extension/protocol';
import type { AppMessage, ExtensionMessage } from '../../../src/features/extension/protocol';
import { ATTEMPT_PORT_PREFIX } from '../shared/automation';
import type { ExtensionState, PopupRequest, PopupResponse } from '../shared/messages';
import { accountChange, signInWithPassword, signInWithProvider, signOut } from './auth';
import { autofill } from './autofill';
import {
  clearCredentialCache,
  credentialValue,
  findCredential,
  listCredentials,
  saveCredential,
} from './credentials';
import {
  clearSessionWork,
  enqueue,
  forgetOtherAccounts,
  handleAttemptPort,
  onQueueChange,
  onTabClosed,
  onWorkspaceChanged,
  processQueue,
  queueAction,
  queueSummary,
  queueViews,
  resolveOrphans,
} from './odooQueue';
import { forgetTab, importDetected, setDetected, tabContext } from './odooTasks';
import {
  getSettings,
  hasOdooPermission,
  originPattern,
  setAutoLock,
  setDateFormat,
  setOdooOrigin,
  syncDetector,
} from './settings';
import { currentSession, message } from './supabase';
import { applyAutoLock, lock, lockIfExpired, onLock, unlock, vaultStatus } from './vault';

// Every lock drops decrypted entries and closes secret views in open extension pages.
onLock(() => {
  clearCredentialCache();
  void chrome.runtime.sendMessage({ channel: 'vault-locked' }).catch(() => undefined);
});

const APP_ORIGINS = ['https://chambapp-tracker.vercel.app', 'http://127.0.0.1:5173'];
const TICK = 'chambapp-tick';

/** Origin of the page that sent a message (Firefox has no `sender.origin`: use its URL). */
function senderOrigin(sender: chrome.runtime.MessageSender): string | null {
  if (sender.origin) return sender.origin;
  try {
    return sender.url ? new URL(sender.url).origin : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- account

/** Clears what belonged to another account whenever the signed-in user changes. */
async function syncAccount() {
  const change = await accountChange();
  if (change.changed) {
    await lock();
    clearCredentialCache();
    if (change.userId) await forgetOtherAccounts(change.userId);
  }
  return change;
}

async function state(): Promise<ExtensionState> {
  const { userId, email } = await syncAccount();
  const settings = await getSettings();
  return {
    version: chrome.runtime.getManifest().version,
    user: userId ? { id: userId, email } : null,
    vault: userId ? await vaultStatus(userId).catch(() => 'locked' as const) : 'signed-out',
    settings,
    odooPermission: await hasOdooPermission(settings.odooOrigin),
  };
}

// ---------------------------------------------------------------- app tabs

async function appTabs() {
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

async function toApp(message: ExtensionMessage, tabId?: number) {
  const targets = tabId !== undefined ? [{ id: tabId }] : await appTabs();
  for (const tab of targets)
    await chrome.tabs.sendMessage(tab.id!, { channel: 'to-app', message }).catch(() => undefined);
}

async function hello(): Promise<ExtensionMessage> {
  const session = await currentSession();
  const { odooOrigin } = await getSettings();
  return {
    source: EXTENSION_SOURCE,
    type: 'hello',
    version: chrome.runtime.getManifest().version,
    userId: session?.user.id ?? null,
    odooOrigin: (await hasOdooPermission(odooOrigin)) ? odooOrigin : null,
  };
}

async function broadcastQueue() {
  await toApp({ source: EXTENSION_SOURCE, type: 'queue', items: await queueSummary() });
  await chrome.runtime.sendMessage({ channel: 'queue-changed' }).catch(() => undefined);
}

onQueueChange(() => void broadcastQueue());
onWorkspaceChanged(() => void toApp({ source: EXTENSION_SOURCE, type: 'workspace-changed' }));

async function handleApp(message: AppMessage, tabId: number): Promise<ExtensionMessage | null> {
  if (message.type === 'ping') {
    await toApp({ source: EXTENSION_SOURCE, type: 'queue', items: await queueSummary() }, tabId);
    return hello();
  }
  if (message.type === 'send-odoo') {
    try {
      const item = await enqueue(message.request);
      return {
        source: EXTENSION_SOURCE,
        type: 'send-result',
        requestId: message.request.requestId,
        ok: true,
        error: item.id === message.request.requestId ? '' : 'Esos partes ya se están enviando.',
      };
    } catch (cause) {
      return {
        source: EXTENSION_SOURCE,
        type: 'send-result',
        requestId: message.request.requestId,
        ok: false,
        error: messageOf(cause),
      };
    }
  }
  try {
    await queueAction(message.requestId, message.action);
    return {
      source: EXTENSION_SOURCE,
      type: 'send-result',
      requestId: message.requestId,
      ok: true,
      error: '',
    };
  } catch (cause) {
    return {
      source: EXTENSION_SOURCE,
      type: 'send-result',
      requestId: message.requestId,
      ok: false,
      error: messageOf(cause),
    };
  }
}

const messageOf = (cause: unknown) => message(cause);

// ---------------------------------------------------------------- popup and options

function isExtensionPage(sender: chrome.runtime.MessageSender) {
  return sender.id === chrome.runtime.id && !!sender.url?.startsWith(chrome.runtime.getURL(''));
}

async function handlePage(request: PopupRequest): Promise<unknown> {
  switch (request.type) {
    case 'state':
      return state();
    case 'sign-in-password':
      await signInWithPassword(String(request.email), String(request.password));
      await syncAccount();
      void processQueue();
      void broadcastHello();
      return state();
    case 'sign-in-oauth':
      await signInWithProvider(String(request.provider));
      await syncAccount();
      void processQueue();
      void broadcastHello();
      return state();
    case 'sign-out': {
      const session = await currentSession();
      await lock();
      if (session) await clearSessionWork(session.user.id);
      await signOut();
      void broadcastHello();
      return state();
    }
    case 'settings-set':
      await setAutoLock(request.autoLockMinutes);
      await applyAutoLock();
      return state();
    case 'date-format-set':
      await setDateFormat(request.format);
      return state();
    case 'odoo-origin-set':
      await setOdooOrigin(request.origin);
      void broadcastHello();
      return state();
    case 'vault-unlock':
      await unlock(String(request.password));
      return state();
    case 'vault-lock':
      await lock();
      return state();
    case 'credentials-list':
      return listCredentials();
    case 'credential-open': {
      const { row, secret } = await findCredential(String(request.id));
      return { id: row.id, version: row.version, proyectoId: row.proyecto_id, secret };
    }
    case 'credential-value':
      return credentialValue(String(request.id), String(request.fieldId));
    case 'credential-save':
      return saveCredential(request);
    case 'autofill':
      return autofill(Number(request.tabId), String(request.credentialId), request.confirmedOrigin);
    case 'tab-context':
      return tabContext(Number(request.tabId));
    case 'import-task': {
      const result = await importDetected(request);
      if (result.kind === 'created')
        void toApp({ source: EXTENSION_SOURCE, type: 'workspace-changed' });
      return result;
    }
    case 'queue-list':
      return queueViews();
    case 'queue-action':
      await queueAction(String(request.requestId), request.action);
      return queueViews();
    default:
      throw new Error('Petición no reconocida.');
  }
}

async function broadcastHello() {
  await toApp(await hello());
  await broadcastQueue();
}

// ---------------------------------------------------------------- listeners

chrome.runtime.onMessage.addListener((raw, sender, respond) => {
  const envelope = raw as {
    channel?: string;
    request?: PopupRequest;
    message?: unknown;
    task?: unknown;
  };
  if (envelope?.channel === 'page') {
    if (!isExtensionPage(sender) || !envelope.request) return false;
    handlePage(envelope.request).then(
      (data) => respond({ ok: true, data } satisfies PopupResponse),
      (cause) => respond({ ok: false, error: message(cause) } satisfies PopupResponse),
    );
    return true;
  }
  if (envelope?.channel === 'app') {
    // Only the bridge script, in the top frame of a Chambapp tab.
    if (
      sender.id !== chrome.runtime.id ||
      sender.tab?.id === undefined ||
      sender.frameId !== 0 ||
      !APP_ORIGINS.includes(senderOrigin(sender) ?? '') ||
      !isAppMessage(envelope.message)
    )
      return false;
    handleApp(envelope.message, sender.tab.id).then(respond, () => respond(null));
    return true;
  }
  if (envelope?.channel === 'odoo-detect') {
    if (sender.id !== chrome.runtime.id || sender.tab?.id === undefined || sender.frameId !== 0)
      return false;
    void setDetected(sender.tab.id, envelope.task ?? null, sender.url);
    return false;
  }
  return false;
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name.startsWith(ATTEMPT_PORT_PREFIX) && port.sender?.id === chrome.runtime.id)
    handleAttemptPort(port);
  else port.disconnect();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void forgetTab(tabId);
  void onTabClosed(tabId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== TICK) return;
  void lockIfExpired();
  void resolveOrphans().then(() => processQueue());
});

async function startup() {
  await chrome.storage.session
    .setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
    .catch(() => undefined);
  if (!(await chrome.alarms.get(TICK))) await chrome.alarms.create(TICK, { periodInMinutes: 1 });
  await syncDetector().catch(() => undefined);
  await lockIfExpired();
  await resolveOrphans();
  void processQueue();
}

/** Tabs of Chambapp opened before the install get the bridge now: no reload needed. */
async function injectBridge() {
  for (const tab of await appTabs())
    await chrome.scripting
      .executeScript({
        target: { tabId: tab.id!, frameIds: [0] },
        files: ['/content/app-bridge.js'],
      })
      .catch(() => undefined);
}

chrome.runtime.onInstalled.addListener(() => {
  void startup();
  void injectBridge();
});
chrome.runtime.onStartup.addListener(() => void startup());
void startup();
