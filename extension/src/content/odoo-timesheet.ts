// Injected into the Odoo task tab opened by the worker. Creates one timesheet line by
// driving Odoo's own form (no API), and counts matching lines for the verification.
// Based on the sequence of Extension_App, with a write boundary acknowledged by the
// worker, explicit error detection and a count across every page of the list.
import { ATTEMPT_PORT_PREFIX, formatOdooDate } from '../shared/automation';
import { parseOdooTaskUrl } from '../shared/odooTask';
import type {
  AttemptConfig,
  DateFormat,
  OdooPageApi,
  ScriptMessage,
  WorkerMessage,
} from '../shared/automation';

class Stop extends Error {}

let active: { config: AttemptConfig; port: chrome.runtime.Port; cancelled: boolean } | null = null;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (value: string | null | undefined) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const lower = (value: string | null | undefined) => normalize(value).toLocaleLowerCase('es');

function visible(element: Element | null | undefined): element is HTMLElement {
  if (!(element instanceof HTMLElement) || !element.isConnected) return false;
  for (let node: HTMLElement | null = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (
      node.hidden ||
      node.getAttribute('aria-hidden') === 'true' ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number(style.opacity) === 0
    )
      return false;
  }
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

/** Throws when the attempt must stop: cancelled, past its deadline or off the configured Odoo. */
function check() {
  if (!active) throw new Stop('El intento ya no está activo.');
  if (active.cancelled) throw new Stop('Envío cancelado.');
  if (Date.now() > active.config.deadline) throw new Stop('Se agotó el tiempo del envío.');
  if (location.origin !== active.config.origin) throw new Stop('La pestaña salió de Odoo.');
  if (!onRecord(active.config.recordId))
    throw new Stop('La pestaña ya no muestra la tarea de Odoo.');
}

async function waitFor<T>(
  label: string,
  find: () => T | null | undefined | false,
  timeout = 30_000,
) {
  const started = Date.now();
  for (;;) {
    if (active) check();
    const found = find();
    if (found) return found;
    if (Date.now() - started > timeout) throw new Error(`No aparece en Odoo: ${label}.`);
    await sleep(200);
  }
}

/** The tab shows that project.task (address and the main form). */
function onRecord(recordId: number) {
  const parsed = parseOdooTaskUrl(location.href, { assumeTask: true });
  return (
    parsed?.recordId === recordId && !!document.querySelector('.o_form_view [name="project_id"]')
  );
}

function click(element: HTMLElement) {
  const target = element.matches('li')
    ? (element.querySelector<HTMLElement>('a,button') ?? element)
    : element;
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  target.click();
}

function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  input.focus();
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function byText(scope: ParentNode, texts: string[], selector = 'a,button,[role="button"]') {
  return [...scope.querySelectorAll<HTMLElement>(selector)].find(
    (element) => texts.includes(lower(element.textContent)) && visible(element),
  );
}

// ---------------------------------------------------------------- Odoo pieces

function timesheetTab() {
  const isTab = (element: Element) =>
    ['partes de horas', 'hojas de horas', 'timesheets'].includes(lower(element.textContent)) &&
    visible(element);
  // Only the form's notebook tab, never the menu entry with the same text.
  return [
    ...document.querySelectorAll<HTMLElement>(
      '.o_notebook_headers [role="tab"], .o_notebook_headers a',
    ),
  ].find(isTab);
}

function timesheetList(): HTMLElement | null {
  const field = document.querySelector<HTMLElement>(
    '.o_form_view:not(.modal .o_form_view) .o_field_widget[name="timesheet_ids"], .o_form_view:not(.modal .o_form_view) div[name="timesheet_ids"]',
  );
  if (visible(field)) return field;
  const pane = document.querySelector<HTMLElement>(
    '.o_notebook .tab-pane.active .o_field_x2many_list',
  );
  return visible(pane) ? pane : null;
}

async function openTimesheets() {
  const tab = timesheetTab();
  if (tab && !tab.classList.contains('active')) click(tab);
  return waitFor('la lista «Partes de horas» de la tarea', timesheetList, 20_000);
}

function errors(): string | null {
  const selectors = [
    '.o_error_dialog',
    '.modal .o_dialog_warning',
    '.o_notification.border-danger',
    '.o_notification .text-bg-danger',
    '.o_notification_manager .bg-danger',
    '.o_notification.o_notification_danger',
    '.o_form_view .o_field_invalid',
    '.o_form_view .o_invalid',
  ];
  for (const selector of selectors)
    for (const element of document.querySelectorAll(selector))
      if (visible(element))
        return normalize(element.textContent).slice(0, 300) || 'Odoo mostró un error.';
  return null;
}

function mainSaveButton() {
  return [...document.querySelectorAll<HTMLElement>('.o_form_button_save')].find(
    (button) => !button.closest('.modal') && visible(button),
  );
}

function dialog() {
  return [...document.querySelectorAll<HTMLElement>('.modal')].find(
    (modal) => visible(modal) && modal.querySelector('.o_form_view'),
  );
}

function dialogSaveButton(modal: HTMLElement) {
  return (
    modal.querySelector<HTMLElement>('.modal-footer .o_form_button_save') ??
    byText(modal, ['guardar y cerrar', 'save & close', 'guardar', 'save'], 'button')
  );
}

function input(scope: ParentNode, name: string) {
  return (
    scope.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `[name="${name}"] input, [name="${name}"] textarea, #${name}, input[id^="${name}_"], textarea[id^="${name}_"]`,
    ) ?? null
  );
}

// ---------------------------------------------------------------- counting

function minutes(text: string): number | null {
  const clock = /^(\d+):([0-5]\d)$/.exec(text.trim());
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  const decimal = /^(\d+(?:[.,]\d+)?)$/.exec(text.trim());
  return decimal ? Math.round(Number(decimal[1]!.replace(',', '.')) * 60) : null;
}

/**
 * Exact match of the three cells. Dates are compared in the single format set
 * in the extension (the one typed), so a swapped day and month never counts.
 * Rows without those cells cannot be verified.
 */
function rowMatches(row: HTMLElement, date: string, descripcion: string, horas: string) {
  const cell = (name: string) => row.querySelector(`td[name="${name}"]`);
  const dateCell = cell('date');
  const name = cell('name');
  const amount = cell('unit_amount');
  if (!dateCell || !name || !amount) throw new Error('unverifiable');
  return (
    normalize(dateCell.textContent) === date &&
    normalize(name.textContent) === normalize(descripcion) &&
    minutes(normalize(amount.textContent)) === minutes(horas)
  );
}

function countPage(list: HTMLElement, date: string, descripcion: string, horas: string) {
  return [...list.querySelectorAll<HTMLElement>('.o_data_row')].filter((row) =>
    rowMatches(row, date, descripcion, horas),
  ).length;
}

function pagerState(list: HTMLElement) {
  const pager = list.querySelector<HTMLElement>('.o_pager');
  if (!pager || !visible(pager)) return null;
  const value = normalize(pager.querySelector('.o_pager_value')?.textContent);
  const total = Number(normalize(pager.querySelector('.o_pager_limit')?.textContent));
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(value) ?? /^(\d+)$/.exec(value);
  if (!range || !Number.isSafeInteger(total)) return undefined;
  const start = Number(range[1]);
  const end = Number(range[2] ?? range[1]);
  return { value, start, end, total, next: pager.querySelector<HTMLElement>('.o_pager_next') };
}

/**
 * Matching lines across every page of the list. Odoo's pager wraps around, so
 * the number of pages comes from its total, not from a disabled button.
 * Returns null when the pages cannot all be read.
 */
async function countAll(list: HTMLElement, date: string, descripcion: string, horas: string) {
  let state = pagerState(list);
  if (state === undefined) return null;
  if (state === null) {
    try {
      return countPage(list, date, descripcion, horas);
    } catch {
      return null;
    }
  }
  const size = state.end - state.start + 1;
  if (size <= 0) return null;
  const pages = Math.ceil(state.total / size);
  if (pages > 200) return null;
  if (pages <= 1 && state.start === 1) return countPage(list, date, descripcion, horas);
  const turn = async () => {
    const before = state!.value;
    if (!state!.next) throw new Error('pager');
    click(state!.next);
    await waitFor(
      'la página siguiente de partes',
      () => {
        const next = pagerState(list);
        return next && next.value !== before ? next : null;
      },
      15_000,
    );
    await sleep(150);
    state = pagerState(list);
    if (!state) throw new Error('pager');
  };
  try {
    for (let guard = 0; state.start !== 1 && guard <= pages; guard += 1) await turn();
    if (state.start !== 1) return null;
    let total = 0;
    for (let page = 0; page < pages; page += 1) {
      total += countPage(list, date, descripcion, horas);
      await turn();
    }
    return state.start === 1 ? total : null;
  } catch (cause) {
    if (cause instanceof Stop) throw cause;
    return null;
  }
}

// ---------------------------------------------------------------- attempt

function post(message: ScriptMessage) {
  active?.port.postMessage(message);
}

let ackResolver: (() => void) | null = null;

/** Waits until the worker has persisted "may have written". No ack, no click. */
async function writeBoundary() {
  const config = active!.config;
  const acknowledged = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), 5_000);
    ackResolver = () => {
      clearTimeout(timer);
      resolve(true);
    };
    post({ type: 'about-to-write', attemptId: config.attemptId });
  });
  ackResolver = null;
  if (!acknowledged) throw new Error('La extensión no confirmó el inicio del guardado.');
  check();
}

async function run() {
  const config = active!.config;
  const heartbeat = setInterval(
    () => post({ type: 'heartbeat', attemptId: config.attemptId }),
    10_000,
  );
  try {
    post({ type: 'phase', attemptId: config.attemptId, phase: 'counting' });
    const list = await openTimesheets();
    const date = formatOdooDate(config.fecha, config.dateFormat);
    const before = await countAll(list, date, config.descripcion, config.horasFormato);
    if (before === null)
      throw new Error('No se pudieron leer todas las páginas de partes de la tarea.');
    post({ type: 'counted', attemptId: config.attemptId, count: before });

    post({ type: 'phase', attemptId: config.attemptId, phase: 'filling' });
    const add = await waitFor('«Añadir una línea» en Partes de horas', () => {
      const current = timesheetList();
      if (!current) return null;
      return (
        current.querySelector<HTMLElement>('.o_field_x2many_list_row_add a') ??
        byText(current, ['añadir una línea', 'add a line'])
      );
    });
    click(add);
    const form = await waitFor('el formulario de la nueva línea', () => {
      const modal = dialog();
      if (modal && input(modal, 'unit_amount')) return { scope: modal as ParentNode, modal };
      const row = document.querySelector<HTMLElement>('.o_selected_row');
      if (row && visible(row) && input(row, 'unit_amount'))
        return { scope: row as ParentNode, modal: null };
      return null;
    });
    const values: [string, string][] = [
      ['date', date],
      ['name', config.descripcion],
      ['unit_amount', config.horasFormato],
    ];
    for (const [name, value] of values) {
      const field = input(form.scope, name);
      if (!field) throw new Error(`No se encontró el campo ${name} en Odoo.`);
      setValue(field, value);
      await sleep(80);
      if (normalize(field.value) !== normalize(value))
        throw new Error(`Odoo no aceptó el valor del campo ${name}.`);
    }
    const problem = errors();
    if (problem) throw new Error(problem);

    // ---- write boundary: from here on Odoo may have stored the line.
    if (form.modal) {
      const save = await waitFor('el botón «Guardar y cerrar»', () =>
        dialogSaveButton(form.modal!),
      );
      await writeBoundary();
      click(save);
      await waitFor('el cierre del formulario de la línea', () => {
        const shown = errors();
        if (shown) throw new Error(shown);
        return !visible(form.modal) || !form.modal!.isConnected;
      });
    } else {
      await writeBoundary();
    }
    const formSave = mainSaveButton();
    if (formSave && !(formSave as HTMLButtonElement).disabled) click(formSave);
    // Saved when no error shows and the form stops offering "save" for a moment.
    let cleanSince = 0;
    await waitFor('la confirmación del guardado de la tarea', () => {
      const shown = errors();
      if (shown) throw new Error(shown);
      const pending = mainSaveButton();
      const dirty = !!pending && !(pending as HTMLButtonElement).disabled;
      const indicatorDirty = !!document.querySelector('.o_form_status_indicator .o_form_dirty');
      if (dirty || indicatorDirty) {
        cleanSince = 0;
        return false;
      }
      cleanSince ||= Date.now();
      return Date.now() - cleanSince >= 600;
    });
    post({ type: 'form-saved', attemptId: config.attemptId });
  } catch (cause) {
    post({
      type: 'failed',
      attemptId: config.attemptId,
      error: cause instanceof Error ? cause.message : String(cause),
    });
  } finally {
    clearInterval(heartbeat);
  }
}

const api: OdooPageApi = {
  start(config) {
    if (active) return false;
    if (location.origin !== config.origin || !onRecord(config.recordId)) return false;
    const port = chrome.runtime.connect({ name: `${ATTEMPT_PORT_PREFIX}${config.attemptId}` });
    active = { config, port, cancelled: false };
    port.onMessage.addListener((message: WorkerMessage) => {
      if (message?.attemptId !== config.attemptId) return;
      if (message.type === 'write-ack') ackResolver?.();
      if (message.type === 'cancel' && active) active.cancelled = true;
    });
    port.onDisconnect.addListener(() => {
      if (active) active.cancelled = true;
    });
    void run();
    return true;
  },
  cancel() {
    if (active) active.cancelled = true;
  },
  async count(recordId, fecha, format: DateFormat, descripcion, horas) {
    try {
      // Counting another task's lines would prove nothing about this one.
      await waitFor('la ficha de la tarea', () => onRecord(recordId), 20_000);
      const list = await openTimesheets();
      if (!onRecord(recordId)) return null;
      // Let the reloaded list settle before reading it.
      await sleep(500);
      return await countAll(list, formatOdooDate(fecha, format), descripcion, horas);
    } catch {
      return null;
    }
  },
};

globalThis.__chambappOdoo ??= api;
