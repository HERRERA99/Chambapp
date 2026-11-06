// Registered only for the configured Odoo origin. Tells the worker when the tab shows a task form.
import {
  cleanProjectName,
  normalizeOdooCode,
  parseOdooTaskUrl,
  splitTaskTitle,
} from '../shared/odooTask';
import type { DetectedTask } from '../shared/odooTask';

function readField(selectors: string[]): string {
  for (const selector of selectors) {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) continue;
    const value =
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.value
        : element.textContent;
    const text = (value ?? '').replace(/\s+/g, ' ').trim();
    if (text) return text;
  }
  return '';
}

/** Task shown in the main form, if any (dialogs are ignored). */
function detect(): DetectedTask | null {
  const form = document.querySelector('.o_action_manager .o_form_view, .o_form_view');
  if (!form) return null;
  // Some Odoo versions name the task's project field display_project_id.
  const hasTaskFields =
    form.querySelector('[name="project_id"], [name="display_project_id"]') &&
    form.querySelector('[name="name"]');
  if (!hasTaskFields) return null;
  const parsed = parseOdooTaskUrl(location.href, { assumeTask: true });
  if (!parsed) return null;
  const rawTitle = readField([
    '.o_form_view [name="name"] textarea',
    '.o_form_view [name="name"] input',
    '.o_form_view #name',
    '.o_form_view [name="name"]',
  ]);
  if (!rawTitle) return null;
  const fromTitle = splitTaskTitle(rawTitle);
  const project = readField([
    '.o_form_view [name="project_id"] input',
    '.o_form_view [name="display_project_id"] input',
    '.o_form_view #display_project_id',
    '.o_form_view #project_id',
    '.o_form_view [name="project_id"] a',
    '.o_form_view [name="display_project_id"] a',
    '.o_form_view [name="project_id"]',
    '.o_form_view [name="display_project_id"]',
  ]);
  const code = readField([
    '.o_form_view [name="code"] input',
    '.o_form_view [name="code"] span',
    '.o_form_view [name="code"]',
  ]);
  return {
    origin: parsed.origin,
    recordId: parsed.recordId,
    url: location.href,
    title: fromTitle.title,
    projectName: cleanProjectName(project),
    code: normalizeOdooCode(code) ?? fromTitle.code,
  };
}

let last = '';
let alive = true;

function report() {
  if (!alive) return;
  const task = detect();
  const signature = JSON.stringify(task);
  if (signature === last) return;
  last = signature;
  try {
    void chrome.runtime.sendMessage({ channel: 'odoo-detect', task }).catch(() => undefined);
  } catch {
    alive = false;
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(report, 300);
}

new MutationObserver(schedule).observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
});
window.addEventListener('popstate', schedule);
window.addEventListener('hashchange', schedule);
let href = location.href;
setInterval(() => {
  if (location.href !== href) {
    href = location.href;
    schedule();
  }
}, 1000);
report();
