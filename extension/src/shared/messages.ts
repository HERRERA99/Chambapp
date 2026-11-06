import type { CredentialSecret } from '../../../src/features/passwords/credentials.model';
import type {
  OdooRequest,
  QueueAction,
  QueueStatus,
} from '../../../src/features/extension/protocol';
import type { DetectedTask } from './odooTask';
import type { ImportChoice } from './importTask';
import type { QueuePhase } from './queue';
import type { DateFormat } from './automation';

export type VaultStatus = 'signed-out' | 'none' | 'locked' | 'unlocked';

/** 0 = lock only when the browser closes. */
export const AUTO_LOCK_OPTIONS = [5, 15, 30, 60, 0] as const;
export type AutoLock = (typeof AUTO_LOCK_OPTIONS)[number];

export type Settings = {
  odooOrigin: string | null;
  odooDateFormat: DateFormat;
  autoLockMinutes: AutoLock;
};

export type ExtensionState = {
  version: string;
  user: { id: string; email: string | null } | null;
  vault: VaultStatus;
  settings: Settings;
  odooPermission: boolean;
};

export type ProjectOption = { id: string; nombre: string; origen?: 'nube' | 'local' };

/** Credential as the popup sees it: secret values stay in the worker until asked for. */
export type CredentialView = {
  id: string;
  version: number;
  proyectoId: string;
  proyecto: string;
  readable: boolean;
  nombre: string;
  url: string;
  campos: { id: string; etiqueta: string; secreto: boolean; valor: string | null }[];
};

export type TabContext = {
  tabId: number;
  url: string | null;
  detected: DetectedTask | null;
  existing: { kind: 'same' | 'possible'; titulo: string; proyecto: string } | null;
  suggestedProjectId: string | null;
  projects: ProjectOption[];
};

export type QueueView = {
  requestId: string;
  status: QueueStatus;
  phase: QueuePhase;
  error: string;
  request: Pick<OdooRequest, 'fecha' | 'descripcion' | 'horasFormato' | 'odooUrl'> & {
    partes: number;
  };
  updatedAt: number;
};

export type AutofillResult =
  | { kind: 'filled'; username: boolean; password: boolean }
  | {
      kind: 'confirm';
      pageHost: string;
      pageOrigin: string;
      insecure: boolean;
      credentialHost: string | null;
    }
  | { kind: 'not-found' };

export type PopupRequest =
  | { type: 'state' }
  | { type: 'sign-in-password'; email: string; password: string }
  | { type: 'sign-in-oauth'; provider: string }
  | { type: 'sign-out' }
  | { type: 'settings-set'; autoLockMinutes: AutoLock }
  | { type: 'date-format-set'; format: DateFormat }
  | { type: 'odoo-origin-set'; origin: string | null }
  | { type: 'vault-unlock'; password: string }
  | { type: 'vault-lock' }
  | { type: 'credentials-list' }
  | { type: 'credential-open'; id: string }
  | { type: 'credential-value'; id: string; fieldId: string }
  | {
      type: 'credential-save';
      /** Always set: new entries get their id once, in the form. */
      id: string;
      /** null for a new entry. */
      version: number | null;
      proyectoId: string;
      secret: CredentialSecret;
    }
  | { type: 'autofill'; tabId: number; credentialId: string; confirmedOrigin: string | null }
  | { type: 'tab-context'; tabId: number }
  | {
      type: 'import-task';
      tabId: number;
      title: string;
      choice: ImportChoice;
      allowPossibleDuplicate: boolean;
    }
  | { type: 'queue-list' }
  | { type: 'queue-action'; requestId: string; action: QueueAction };

export type PopupResponse<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** Sends a request to the service worker from an extension page. */
export async function ask<T>(request: PopupRequest): Promise<T> {
  const response = (await chrome.runtime.sendMessage({ channel: 'page', request })) as
    PopupResponse<T> | undefined;
  if (!response) throw new Error('La extensión no ha respondido. Vuelve a abrirla.');
  if (!response.ok) throw new Error(response.error);
  return response.data;
}
