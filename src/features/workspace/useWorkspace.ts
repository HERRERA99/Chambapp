import { useContext, createContext } from 'react';
import type { WorkspaceData } from '../../domain/models';

type WorkspaceState = {
  data: WorkspaceData | null;
  isLoading: boolean;
  error: Error | null;
  reload: () => Promise<unknown>;
};
export const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace requiere WorkspaceProvider.');
  return context;
}
