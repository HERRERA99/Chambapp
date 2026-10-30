import { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import type { TimeEntry } from '../../src/domain/models';
import { AuthContext } from '../../src/features/auth/AuthContext';
import { WorkspaceContext } from '../../src/features/workspace/useWorkspace';
import { TrackerContext } from '../../src/features/tracker/useTracker';
import { AttendanceContext } from '../../src/features/attendance/useAttendance';
import { FeedbackProvider } from '../../src/shared/feedback/FeedbackProvider';
import { WorkspaceLayout } from '../../src/app/layouts/WorkspaceLayout';
import EntriesPage from '../../src/features/time-entries/EntriesPage';
import DashboardPage from '../../src/features/dashboard/DashboardPage';
import {
  data as initialData,
  operations,
  uid,
  now as fixedNow,
  applyScenario,
  newEntry,
  setFichajes,
} from './repository';
import * as repository from './repository';
import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist-mono/latin-400.css';
import '../../src/styles/tokens.css';
import '../../src/styles/global.css';
import '../../src/styles/components.css';

const PercentagesPage = lazy(() => import('../../src/features/calculators/PercentagesPage'));
const TimeCalculatorPage = lazy(() => import('../../src/features/calculators/TimeCalculatorPage'));
const FakeDataPage = lazy(() => import('../../src/features/fake-data/FakeDataPage'));
const DeveloperPage = lazy(() => import('../../src/features/developer/DeveloperPage'));
const NotesPage = lazy(() => import('../../src/features/notes/NotesPage'));
const TasksPage = lazy(() => import('../../src/features/tasks/TasksPage'));
const AttendancePage = lazy(() => import('../../src/features/attendance/AttendancePage'));
const SettingsPage = lazy(() => import('../../src/features/settings/SettingsPage'));
const WeekPage = lazy(() => import('../../src/features/week/WeekPage'));
const ProjectsPage = lazy(() => import('../../src/features/projects/ProjectsPage'));

const params = new URLSearchParams(window.location.search);
applyScenario(params.get('escenario'));
const noop = async () => {};
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const loadedAt = Date.now();
const wait = () => new Promise((resolve) => setTimeout(resolve, 350));

/** Synthetic clock: starts at the fixture's instant and advances in real time. */
function useClock() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;
  return new Date(Date.parse(fixedNow) + Date.now() - loadedAt).toISOString();
}

function Smoke() {
  const [data, setData] = useState(initialData);
  const clock = useClock();
  const [active, setActive] = useState<TimeEntry | null>(() =>
    params.get('escenario') === 'cronometro'
      ? newEntry(initialData.tasks[1]!.id, new Date(Date.parse(fixedNow) - 1500_000).toISOString())
      : null,
  );
  const [pausedTaskId, setPausedTaskId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeAttendance = data.fichajes.find((attendance) => !attendance.fin_en) ?? null;
  useEffect(() => {
    const refresh = () => setData(repository.data);
    window.addEventListener('chambapp-smoke-workspace', refresh);
    return () => window.removeEventListener('chambapp-smoke-workspace', refresh);
  }, []);

  async function finish(entry: TimeEntry, end: string) {
    await repository.executeCommand('crear_parte', {
      tarea_id: entry.tarea_id,
      inicio_en: entry.inicio_en,
      fin_en: end,
    });
  }
  const tracker = {
    active,
    elapsedSeconds: active ? (Date.parse(clock) - Date.parse(active.inicio_en)) / 1000 : 0,
    busy,
    pending: false,
    error: null,
    pausedTaskId,
    start: async (taskId: string, startAt?: string) => {
      setBusy(true);
      await wait();
      setActive(newEntry(taskId, startAt ?? clock));
      setPausedTaskId(null);
      setBusy(false);
    },
    stop: async () => {
      if (!active) return;
      setBusy(true);
      await wait();
      await finish(active, clock);
      setActive(null);
      setBusy(false);
    },
    pause: async () => {
      if (!active) return;
      setBusy(true);
      await wait();
      await finish(active, clock);
      setPausedTaskId(active.tarea_id);
      setActive(null);
      setBusy(false);
    },
    resume: async () => {
      if (!pausedTaskId) return;
      setActive(newEntry(pausedTaskId, clock));
      setPausedTaskId(null);
    },
    retryPending: noop,
  };
  const attendance = {
    active: activeAttendance,
    now: clock,
    elapsedSeconds: activeAttendance
      ? (Date.parse(clock) - Date.parse(activeAttendance.inicio_en)) / 1000
      : 0,
    busy,
    pending: false,
    error: null,
    operation: null,
    perform: noop,
    start: async () => {
      setBusy(true);
      await wait();
      setFichajes([
        ...repository.data.fichajes,
        { ...initialData.fichajes[0]!, id: crypto.randomUUID(), inicio_en: clock, fin_en: null },
      ]);
      setBusy(false);
    },
    stop: async () => {
      setBusy(true);
      await wait();
      setFichajes(
        repository.data.fichajes.map((item) => (item.fin_en ? item : { ...item, fin_en: clock })),
      );
      setBusy(false);
    },
    retry: noop,
  };
  return (
    <QueryClientProvider client={client}>
      <MotionConfig reducedMotion="user">
        <AuthContext.Provider
          value={{
            user: { id: uid, email: 'prueba@example.com' } as never,
            session: null,
            loading: false,
            error: null,
            isPasswordRecovery: false,
            completePasswordRecovery: () => {},
          }}
        >
          <WorkspaceContext.Provider value={{ data, isLoading: false, error: null, reload: noop }}>
            <TrackerContext.Provider value={tracker}>
              <AttendanceContext.Provider value={attendance}>
                <FeedbackProvider>
                  <MemoryRouter
                    initialEntries={[
                      window.location.pathname === '/'
                        ? '/resumen'
                        : `${window.location.pathname}${window.location.hash}`,
                    ]}
                  >
                    <Suspense fallback={<p>Cargando vista de prueba…</p>}>
                      <Routes>
                        <Route element={<WorkspaceLayout />}>
                          <Route path="/partes-de-horas" element={<EntriesPage />} />
                          <Route path="/resumen" element={<DashboardPage />} />
                          <Route path="/tareas" element={<TasksPage />} />
                          <Route path="/tablero" element={<TasksPage defaultView="board" />} />
                          <Route path="/fichajes" element={<AttendancePage />} />
                          <Route path="/ajustes" element={<SettingsPage />} />
                          <Route path="/mi-semana" element={<WeekPage />} />
                          <Route path="/proyectos" element={<ProjectsPage />} />
                          <Route path="/porcentajes" element={<PercentagesPage />} />
                          <Route path="/calculadora-de-horas" element={<TimeCalculatorPage />} />
                          <Route path="/datos-ficticios" element={<FakeDataPage />} />
                          <Route path="/utilidades-desarrollo" element={<DeveloperPage />} />
                          <Route path="/notas" element={<NotesPage />} />
                          <Route path="*" element={<p>Ruta fuera de la vista de prueba.</p>} />
                        </Route>
                      </Routes>
                    </Suspense>
                  </MemoryRouter>
                  <details className="smoke-operations">
                    <summary>Operaciones de prueba</summary>
                    <pre>{JSON.stringify(operations, null, 2)}</pre>
                  </details>
                </FeedbackProvider>
              </AttendanceContext.Provider>
            </TrackerContext.Provider>
          </WorkspaceContext.Provider>
        </AuthContext.Provider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
createRoot(document.getElementById('root')!).render(<Smoke />);
