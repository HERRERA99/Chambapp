// Runs only on the Chambapp web app. Relays validated messages between the page and the worker.
import { isAppMessage, isExtensionMessage } from '../../../src/features/extension/protocol';
import type { ExtensionMessage } from '../../../src/features/extension/protocol';

declare global {
  /** Tells whether the bridge already running in this page still talks to a live extension. */
  var __chambappBridge: (() => boolean) | undefined;
}

// Injected by the manifest on page load and again by the worker right after an
// install or update (into tabs that were already open). A bridge left by a previous
// version of the extension is dead (no runtime id), so a new one takes over.
if (!globalThis.__chambappBridge?.()) {
  globalThis.__chambappBridge = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };
  function toPage(message: ExtensionMessage) {
    window.postMessage(message, location.origin);
  }

  let alive = true;

  function send(message: unknown) {
    if (!alive) return;
    try {
      chrome.runtime.sendMessage({ channel: 'app', message }).then(
        (reply: unknown) => {
          if (isExtensionMessage(reply)) toPage(reply);
        },
        () => undefined,
      );
    } catch (cause) {
      // After an update Chrome invalidates this script: the page must be reloaded.
      if (String(cause).includes('Extension context invalidated')) alive = false;
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return;
    if (!isAppMessage(event.data)) return;
    send(event.data);
  });

  chrome.runtime.onMessage.addListener((raw: { channel?: string; message?: unknown }) => {
    if (raw?.channel === 'to-app' && isExtensionMessage(raw.message)) toPage(raw.message);
    return false;
  });

  // Announce ourselves in case the page asked before this script loaded.
  send({ source: 'chambapp-app', type: 'ping' });
}

export {};
