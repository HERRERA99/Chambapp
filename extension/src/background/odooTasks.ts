import { createImporter } from '../shared/importTask';
import type { ImportChoice } from '../shared/importTask';
import { findExistingTask, parseOdooTaskUrl, suggestProject } from '../shared/odooTask';
import type { DetectedTask } from '../shared/odooTask';
import type { TabContext } from '../shared/messages';
import { getSettings } from './settings';
import { createProject, createTask, loadProjects, loadTasks } from './workspace';
import { requireUser } from './supabase';

/** One key per tab: concurrent reports from several Odoo tabs never overwrite each other. */
const detectedKey = (tabId: number) => `chambapp_detected_v1:${tabId}`;

async function detectedFor(tabId: number): Promise<DetectedTask | null> {
  const key = detectedKey(tabId);
  return ((await chrome.storage.session.get(key))[key] as DetectedTask | undefined) ?? null;
}

function isDetectedTask(value: unknown): value is DetectedTask {
  if (!value || typeof value !== 'object') return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task.origin === 'string' &&
    typeof task.recordId === 'number' &&
    typeof task.url === 'string' &&
    typeof task.title === 'string' &&
    typeof task.projectName === 'string' &&
    (task.code === null || typeof task.code === 'string')
  );
}

/** Stores what the detector saw in a tab of the configured Odoo, and updates the badge. */
export async function setDetected(tabId: number, value: unknown, senderUrl: string | undefined) {
  const { odooOrigin } = await getSettings();
  let task: DetectedTask | null = null;
  if (isDetectedTask(value) && senderUrl) {
    const parsed = parseOdooTaskUrl(value.url, { assumeTask: true });
    // Trust only what matches the tab's own address on the configured Odoo.
    if (
      parsed &&
      parsed.origin === odooOrigin &&
      new URL(senderUrl).origin === odooOrigin &&
      parsed.recordId === value.recordId &&
      value.title.trim()
    )
      task = {
        origin: parsed.origin,
        recordId: parsed.recordId,
        url: value.url,
        title: Array.from(value.title.trim()).slice(0, 300).join(''),
        projectName: Array.from(value.projectName.trim()).slice(0, 200).join(''),
        code: value.code,
      };
  }
  if (task) await chrome.storage.session.set({ [detectedKey(tabId)]: task });
  else await chrome.storage.session.remove(detectedKey(tabId));
  await chrome.action.setBadgeBackgroundColor({ tabId, color: '#cc003c' }).catch(() => undefined);
  await chrome.action.setBadgeText({ tabId, text: task ? '+' : '' }).catch(() => undefined);
  await chrome.action
    .setTitle({ tabId, title: task ? `Chambapp · Añadir «${task.title}»` : 'Chambapp' })
    .catch(() => undefined);
}

export async function forgetTab(tabId: number) {
  await chrome.storage.session.remove(detectedKey(tabId));
}

export async function tabContext(tabId: number): Promise<TabContext> {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  const detected = await detectedFor(tabId);
  const base: TabContext = {
    tabId,
    url: tab?.url ?? null,
    detected: null,
    existing: null,
    suggestedProjectId: null,
    projects: [],
  };
  // A detection only counts while the tab still shows that record.
  const current = tab?.url ? parseOdooTaskUrl(tab.url, { assumeTask: true }) : null;
  if (!detected || current?.recordId !== detected.recordId || current.origin !== detected.origin)
    return base;
  const [tasks, projects] = await Promise.all([loadTasks(), loadProjects()]);
  const names = new Map(projects.map((project) => [project.id, project.nombre]));
  const existing = findExistingTask(tasks, detected);
  const active = projects.filter((project) => !project.archivado_en);
  return {
    ...base,
    detected,
    existing: existing
      ? {
          kind: existing.kind,
          titulo: existing.task.titulo,
          proyecto: names.get(existing.task.proyecto_id) ?? '',
        }
      : null,
    suggestedProjectId: suggestProject(projects, detected.projectName)?.id ?? null,
    projects: active.map((project) => ({ id: project.id, nombre: project.nombre })),
  };
}

const importTask = createImporter({
  loadProjects: (userId) => loadProjects(userId),
  loadTasks: (userId) => loadTasks(userId),
  createProject: (name, userId) => createProject(name, userId),
  createTask: (task, userId) => createTask(task, userId),
});

export async function importDetected(input: {
  tabId: number;
  title: string;
  choice: ImportChoice;
  allowPossibleDuplicate: boolean;
}) {
  const detected = await detectedFor(input.tabId);
  if (!detected) throw new Error('Abre una tarea de Odoo para añadirla.');
  const user = await requireUser();
  const result = await importTask({
    userId: user.id,
    detected,
    title: input.title,
    choice: input.choice,
    allowPossibleDuplicate: input.allowPossibleDuplicate,
  });
  return { kind: result.kind, titulo: result.task.titulo };
}
