import { createContext, useContext } from 'react';
import type { TimeEntry } from '../../domain/models';

export type TrackerState = {
  active: TimeEntry | null;
  elapsedSeconds: number;
  busy: boolean;
  pending: boolean;
  error: string | null;
  pausedTaskId: string | null;
  start: (taskId: string) => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  retryPending: () => Promise<void>;
};

export const TrackerContext = createContext<TrackerState | null>(null);
export function useTracker() {
  const context = useContext(TrackerContext);
  if (!context) throw new Error('useTracker requiere TrackerProvider.');
  return context;
}
