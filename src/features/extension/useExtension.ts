import { createContext, useContext } from 'react';
import type { OdooRequest, QueueAction, QueueSummaryItem } from './protocol';

export type ExtensionStatus = {
  /** The Chambapp extension answered in this tab. */
  available: boolean;
  /** Signed in to the extension with the same account as the app. */
  connected: boolean;
  /** Extension signed in with another account (or none) while installed. */
  otherAccount: boolean;
  /** Configured Odoo origin with its permission granted; null otherwise. */
  odooOrigin: string | null;
  /** Installed extension version, when it answered. */
  version: string | null;
  /** Asks the extension again (the tutorial polls while it is open). */
  refresh: () => void;
  /** Opens the installation tutorial; with `download`, it starts the download first. */
  openTutorial: (options?: { download?: boolean }) => void;
  queue: QueueSummaryItem[];
  send: (request: OdooRequest) => Promise<{ ok: boolean; error: string }>;
  act: (requestId: string, action: QueueAction) => Promise<{ ok: boolean; error: string }>;
  /** Reason why these entries or tasks cannot change now (being sent to Odoo); null if free. */
  lockReason: (target: {
    entryIds?: readonly string[];
    taskIds?: readonly string[];
  }) => string | null;
};

export const SENDING_TO_ODOO =
  'Se está enviando a Odoo: espera a que termine o resuélvelo en Parte semanal.';

const offline: ExtensionStatus = {
  available: false,
  connected: false,
  otherAccount: false,
  odooOrigin: null,
  version: null,
  refresh: () => {},
  openTutorial: () => {},
  queue: [],
  send: async () => ({ ok: false, error: 'La extensión de Chambapp no está disponible.' }),
  act: async () => ({ ok: false, error: 'La extensión de Chambapp no está disponible.' }),
  lockReason: () => null,
};

export const ExtensionContext = createContext<ExtensionStatus>(offline);

export function useExtension() {
  return useContext(ExtensionContext);
}
