import { createImporter } from '../shared/importTask';
import type { ImportChoice } from '../shared/importTask';
import { findExistingTask, parseOdooTaskUrl, suggestProject } from '../shared/odooTask';
import type { DetectedTask } from '../shared/odooTask';
import type { TabContext } from '../shared/messages';
import { getSettings } from './settings';
import type { Project, Task } from '../../../src/domain/models';
import { createProject, createTask, loadProjects, loadStorageMode, loadTasks } from './workspace';
import { requireSession } from './supabase';
import { askApp } from './appTabs';

type LocalList = { proyectos: Project[]; tareas: Task[] };

/** The cloud user of an account key; null for a local installation (it has no browser data). */
const cloudUser = (account: string) => (account.startsWith('nube:') ? account.slice(5) : null);

/**
 * Projects and tasks kept in the browser (cloud edition), from an open Chambapp tab
 * (null: none answered, or a local installation, which keeps everything in its database).
 */
async function localData(account: string): Promise<LocalList | null> {
  const userId = cloudUser(account);
  if (!userId) return null;
  try {
    const data = await askApp<LocalList>(userId, { kind: 'listar' }, 4_000);
    if (!data || !Array.isArray(data.proyectos) || !Array.isArray(data.tareas)) return null;
    return {
      proyectos: data.proyectos.map((row) => ({ ...row, origen: 'local' as const })),
      tareas: data.tareas.map((row) => ({ ...row, origen: 'local' as const })),
    };
  } catch {
    return null;
  }
}

async function allProjects(userId: string, local: LocalList | null) {
  return [...(await loadProjects(userId)), ...(local?.proyectos ?? [])];
}
async function allTasks(userId: string, local: LocalList | null) {
  return [...(await loadTasks(userId)), ...(local?.tareas ?? [])];
}

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
  const { account } = await requireSession();
  const local = await localData(account);
  const [tasks, projects] = await Promise.all([
    allTasks(account, local),
    allProjects(account, local),
  ]);
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
    projects: active.map((project) => ({
      id: project.id,
      nombre: project.nombre,
      origen: project.origen === 'local' ? ('local' as const) : ('nube' as const),
    })),
  };
}

// Reads include the data kept in the browser when a Chambapp tab can give it; a task
// goes where its project lives and a new project where the user's preference says.
let lastLocal: LocalList | null = null;
const importTask = createImporter<Project, Task>({
  loadProjects: async (userId) => {
    lastLocal = await localData(userId);
    return allProjects(userId, lastLocal);
  },
  loadTasks: async (userId) => allTasks(userId, lastLocal ?? (await localData(userId))),
  createProject: async (name, account) => {
    const userId = cloudUser(account);
    if (!userId || (await loadStorageMode(account)) === 'nube') return createProject(name, account);
    const created = await askApp<Project>(userId, { kind: 'crear-proyecto', nombre: name });
    return { ...created, origen: 'local' };
  },
  createTask: async (task, account) => {
    const userId = cloudUser(account);
    const local = lastLocal?.proyectos.some((project) => project.id === task.proyecto_id);
    if (!local || !userId) return createTask(task, account);
    const created = await askApp<Task>(userId, { kind: 'crear-tarea', tarea: task });
    return { ...created, origen: 'local' };
  },
});

export async function importDetected(input: {
  tabId: number;
  title: string;
  choice: ImportChoice;
  allowPossibleDuplicate: boolean;
}) {
  const detected = await detectedFor(input.tabId);
  if (!detected) throw new Error('Abre una tarea de Odoo para añadirla.');
  // The importer passes this account key to every read and write it makes.
  const { account } = await requireSession();
  const result = await importTask({
    userId: account,
    detected,
    title: input.title,
    choice: input.choice,
    allowPossibleDuplicate: input.allowPossibleDuplicate,
  });
  return { kind: result.kind, titulo: result.task.titulo };
}
