import { isOdooId } from '../../../src/domain/odoo.ts';

/** Task read from an Odoo task form. */
export type DetectedTask = {
  origin: string;
  recordId: number;
  url: string;
  title: string;
  projectName: string;
  code: string | null;
};

type TaskLike = {
  id: string;
  titulo: string;
  proyecto_id: string;
  odoo_id: string | null;
  odoo_url: string | null;
  eliminado_en?: string | null;
};

type ProjectLike = {
  id: string;
  nombre: string;
  archivado_en: string | null;
  eliminado_en: string | null;
};

const taskPathPatterns = [
  /^\/odoo\/(?:.+\/)?tasks\/(\d+)\/?$/,
  /^\/odoo\/project\.task\/(\d+)\/?$/,
  /^\/odoo\/(?:my-tasks|all-tasks)\/(\d+)\/?$/,
  /^\/odoo\/action-[^/]*task[^/]*\/(\d+)\/?$/i,
];

function recordId(text: string | undefined | null): number | null {
  if (!text || !/^\d{1,15}$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * Odoo record of a task URL. Supports `/odoo/...` routes (Odoo 17.2+) and the
 * older `/web#model=project.task&id=…` hash. With `assumeTask` (the page shows a
 * task form), the last numeric segment of any `/odoo/...` route is used.
 */
export function parseOdooTaskUrl(
  value: string,
  { assumeTask = false }: { assumeTask?: boolean } = {},
): { origin: string; recordId: number } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const path = url.pathname;
  for (const pattern of taskPathPatterns) {
    const id = recordId(pattern.exec(path)?.[1]);
    if (id) return { origin: url.origin, recordId: id };
  }
  if (path === '/web' || path === '/web/') {
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const id = recordId(hash.get('id'));
    if (id && hash.get('model') === 'project.task') return { origin: url.origin, recordId: id };
  }
  if (assumeTask && path.startsWith('/odoo/')) {
    const id = recordId(path.replace(/\/$/, '').split('/').at(-1));
    if (id) return { origin: url.origin, recordId: id };
  }
  return null;
}

/**
 * Some Odoo setups put the task code in the title: "[T457973] Revisar". Returns
 * that code and the title without it (the original title if nothing else is left).
 */
export function splitTaskTitle(value: string): { code: string | null; title: string } {
  const title = value.replace(/\s+/g, ' ').trim();
  const match = /^\[(T\d+)\]\s*/i.exec(title);
  const code = match ? normalizeOdooCode(match[1]) : null;
  if (!match || !code) return { code: null, title };
  return { code, title: title.slice(match[0].length).trim() || title };
}

/** Odoo shows projects as "[CODE] Name" in some versions. */
export function cleanProjectName(value: string): string {
  return value
    .replace(/^\s*\[[^\]]*\]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Task code in the format Chambapp stores (T + digits), or null. */
export function normalizeOdooCode(value: string | null | undefined): string | null {
  const code = (value ?? '').trim().toUpperCase();
  return isOdooId(code) ? code : null;
}

export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es');
}

/**
 * `same`: a live task already points at this Odoo record (same instance and id).
 * `possible`: only the T… code matches, which may belong to another Odoo instance.
 */
export function findExistingTask<T extends TaskLike>(
  tasks: readonly T[],
  detected: Pick<DetectedTask, 'origin' | 'recordId' | 'code'>,
): { kind: 'same' | 'possible'; task: T } | null {
  const live = tasks.filter((task) => !task.eliminado_en);
  const same = live.find((task) => {
    const parsed = task.odoo_url ? parseOdooTaskUrl(task.odoo_url, { assumeTask: true }) : null;
    return parsed?.origin === detected.origin && parsed.recordId === detected.recordId;
  });
  if (same) return { kind: 'same', task: same };
  const possible = detected.code ? live.find((task) => task.odoo_id === detected.code) : undefined;
  return possible ? { kind: 'possible', task: possible } : null;
}

/** Live, not archived project whose name matches the Odoo project (case and accents ignored). */
export function suggestProject<P extends ProjectLike>(
  projects: readonly P[],
  odooProjectName: string,
): P | null {
  const name = fold(cleanProjectName(odooProjectName));
  if (!name) return null;
  return (
    projects.find(
      (project) => !project.eliminado_en && !project.archivado_en && fold(project.nombre) === name,
    ) ?? null
  );
}
