/** Messages on the port between the service worker and the script that fills Odoo. */

export const ATTEMPT_PORT_PREFIX = 'chambapp-odoo:';

/** How the Odoo user's language writes dates (set in the extension settings). */
export type DateFormat = 'dmy' | 'mdy' | 'ymd';
export const DATE_FORMATS: readonly DateFormat[] = ['dmy', 'mdy', 'ymd'];

/** ISO date written the way Odoo shows and accepts it. */
export function formatOdooDate(fecha: string, format: DateFormat): string {
  const [year, month, day] = fecha.split('-');
  if (format === 'mdy') return `${month}/${day}/${year}`;
  if (format === 'ymd') return `${year}-${month}-${day}`;
  return `${day}/${month}/${year}`;
}

export type AttemptConfig = {
  attemptId: string;
  deadline: number;
  origin: string;
  /** Odoo project.task id the line belongs to: the tab must keep showing it. */
  recordId: number;
  fecha: string;
  dateFormat: DateFormat;
  descripcion: string;
  horasFormato: string;
};

export type ScriptMessage =
  | { type: 'heartbeat'; attemptId: string }
  | { type: 'phase'; attemptId: string; phase: 'counting' | 'filling' }
  | { type: 'counted'; attemptId: string; count: number }
  | { type: 'about-to-write'; attemptId: string }
  | { type: 'form-saved'; attemptId: string }
  | { type: 'failed'; attemptId: string; error: string };

export type WorkerMessage =
  { type: 'write-ack'; attemptId: string } | { type: 'cancel'; attemptId: string };

export type OdooPageApi = {
  start(config: AttemptConfig): boolean;
  cancel(): void;
  /** Waits until the tab shows that task's form; false when it does not appear in time. */
  ready(recordId: number, timeoutMs: number): Promise<boolean>;
  /** Matching lines across every page, or null (also once `deadline`, epoch ms, passes). */
  count(
    recordId: number,
    fecha: string,
    format: DateFormat,
    descripcion: string,
    horasFormato: string,
    deadline: number,
  ): Promise<number | null>;
};

declare global {
  // Set by content/odoo-timesheet.ts in the extension's isolated world of the Odoo tab.
  var __chambappOdoo: OdooPageApi | undefined;
}

export {};
