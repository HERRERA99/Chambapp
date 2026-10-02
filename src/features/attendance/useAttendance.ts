import { createContext, useContext } from 'react';
import type { Attendance } from '../../domain/models';
import type { PendingAttendance } from './pendingAttendance';

type AttendanceState = {
  active: Attendance | null;
  now: string;
  elapsedSeconds: number;
  busy: boolean;
  pending: boolean;
  error: string | null;
  operation: PendingAttendance | null;
  perform: (operation: PendingAttendance) => Promise<void>;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  retry: () => Promise<void>;
};

export const AttendanceContext = createContext<AttendanceState | null>(null);
export function useAttendance() {
  const context = useContext(AttendanceContext);
  if (!context) throw new Error('useAttendance requiere AttendanceProvider.');
  return context;
}
