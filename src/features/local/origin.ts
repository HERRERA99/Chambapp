import type { WorkspaceData } from '../../domain/models';

/** True when some project lives in this browser: then every item shows where it lives. */
export function usesLocalData(data: WorkspaceData | null | undefined) {
  return !!data?.projects.some((project) => project.origen === 'local');
}
