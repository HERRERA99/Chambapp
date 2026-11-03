import { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../../src/features/auth/AuthContext';
import { WorkspaceContext } from '../../src/features/workspace/useWorkspace';
import { TrackerContext } from '../../src/features/tracker/useTracker';
import { AttendanceContext } from '../../src/features/attendance/useAttendance';
import { FeedbackProvider } from '../../src/shared/feedback/FeedbackProvider';
import { WorkspaceLayout } from '../../src/app/layouts/WorkspaceLayout';
import EntriesPage from '../../src/features/time-entries/EntriesPage';
import DashboardPage from '../../src/features/dashboard/DashboardPage';
import { data as current, operations, uid, now } from './repository';
import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist/latin-600.css';
import '@fontsource/space-grotesk/latin-500.css';
import '@fontsource/space-grotesk/latin-700.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '../../src/styles/tokens.css';
import '../../src/styles/global.css';
import '../../src/styles/components.css';

const PercentagesPage = lazy(() => import('../../src/features/calculators/PercentagesPage'));
const TimeCalculatorPage = lazy(() => import('../../src/features/calculators/TimeCalculatorPage'));
const FakeDataPage = lazy(() => import('../../src/features/fake-data/FakeDataPage'));
const DeveloperPage = lazy(() => import('../../src/features/developer/DeveloperPage'));
const NotesPage = lazy(() => import('../../src/features/notes/NotesPage'));
const TasksPage = lazy(() => import('../../src/features/tasks/TasksPage'));
const TimesheetPage = lazy(() => import('../../src/features/timesheet/TimesheetPage'));
const noop = async () => {};
const client = new QueryClient();
function Smoke() {
  const [data, setData] = useState(current);
  // Stateful, recording mocks so header popups can be verified (`?fail=attendance` rejects).
  const [activeAttendance, setActiveAttendance] = useState(
    () => current.fichajes.find((attendance) => !attendance.fin_en) ?? null,
  );
  // Like the real provider, an attendance call is `pending` while its request is in flight.
  const [attendancePending, setAttendancePending] = useState(false);
  async function inFlight(work: () => void) {
    setAttendancePending(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    setAttendancePending(false);
    if (failAttendance) throw new Error('Fallo de prueba al fichar.');
    work();
  }
  const [activeTimer, setActiveTimer] = useState<(typeof current.entries)[number] | null>(null);
  const [, setTick] = useState(0);
  const failAttendance = new URLSearchParams(window.location.search).get('fail') === 'attendance';
  function record(action: string, payload: Record<string, string | null>) {
    operations.push({ action, payload });
    setTick((value) => value + 1);
  }
  const tracker = {
    start: async (taskId: string, startAt?: string) => {
      record('tracker.start', { taskId, startAt: startAt === undefined ? '(ahora)' : startAt });
      setActiveTimer({
        ...current.entries[0]!,
        id: 'timer',
        tarea_id: taskId,
        inicio_en: startAt ?? now,
        fin_en: null,
      });
    },
    stop: async () => {
      record('tracker.stop', {});
      setActiveTimer(null);
    },
  };
  const attendanceMock = {
    start: () =>
      inFlight(() => {
        record('attendance.start', {});
        setActiveAttendance({ ...current.fichajes[0]!, id: 'quick', inicio_en: now, fin_en: null });
      }),
    stop: () =>
      inFlight(() => {
        record('attendance.stop', {});
        setActiveAttendance(null);
      }),
    perform: async (operation: { action: string; payload: Record<string, unknown> }) => {
      record(operation.action, { payload: JSON.stringify(operation.payload) });
    },
  };
  const attendanceElapsedSeconds = activeAttendance
    ? (Date.parse(now) - Date.parse(activeAttendance.inicio_en)) / 1000
    : 0;
  useEffect(() => {
    const refresh = () => setData(current);
    window.addEventListener('chambapp-smoke-workspace', refresh);
    return () => window.removeEventListener('chambapp-smoke-workspace', refresh);
  }, []);
  return (
    <QueryClientProvider client={client}>
      <AuthContext.Provider
        value={{
          user: { id: uid } as never,
          session: null,
          loading: false,
          error: null,
          isPasswordRecovery: false,
          completePasswordRecovery: () => {},
        }}
      >
        <WorkspaceContext.Provider value={{ data, isLoading: false, error: null, reload: noop }}>
          <TrackerContext.Provider
            value={{
              active: activeTimer,
              elapsedSeconds: 0,
              busy: false,
              pending: false,
              error: null,
              pausedTaskId: null,
              start: tracker.start,
              stop: tracker.stop,
              pause: noop,
              resume: noop,
              retryPending: noop,
            }}
          >
            <AttendanceContext.Provider
              value={{
                active: activeAttendance,
                now,
                elapsedSeconds: attendanceElapsedSeconds,
                busy: attendancePending,
                pending: attendancePending,
                error: null,
                operation: null,
                perform: attendanceMock.perform as never,
                start: attendanceMock.start,
                stop: attendanceMock.stop,
                retry: noop,
              }}
            >
              <FeedbackProvider>
                <MemoryRouter
                  initialEntries={[
                    window.location.pathname === '/'
                      ? '/partes-de-horas'
                      : `${window.location.pathname}${window.location.search}`,
                  ]}
                >
                  <Suspense fallback={<p>Cargando vista de prueba…</p>}>
                    <Routes>
                      <Route element={<WorkspaceLayout />}>
                        <Route path="/partes-de-horas" element={<EntriesPage />} />
                        <Route path="/resumen" element={<DashboardPage />} />
                        <Route path="/porcentajes" element={<PercentagesPage />} />
                        <Route path="/calculadora-de-horas" element={<TimeCalculatorPage />} />
                        <Route path="/datos-ficticios" element={<FakeDataPage />} />
                        <Route path="/utilidades-desarrollo" element={<DeveloperPage />} />
                        <Route path="/notas" element={<NotesPage />} />
                        <Route path="/tareas" element={<TasksPage />} />
                        <Route path="/parte-semanal" element={<TimesheetPage />} />
                      </Route>
                    </Routes>
                  </Suspense>
                </MemoryRouter>
                {/* Fixed overlay: keeps diagnostics out of the document flow (scroll checks). */}
                <details
                  style={{
                    position: 'fixed',
                    right: 8,
                    bottom: 8,
                    zIndex: 100,
                    maxHeight: '40vh',
                    overflow: 'auto',
                    background: '#000c',
                    fontSize: 11,
                  }}
                >
                  <summary>Operaciones de prueba</summary>
                  <pre>{JSON.stringify(operations, null, 2)}</pre>
                </details>
              </FeedbackProvider>
            </AttendanceContext.Provider>
          </TrackerContext.Provider>
        </WorkspaceContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Smoke />);
