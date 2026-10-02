import { useEffect, useState } from 'react';
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

const noop = async () => {};
const client = new QueryClient();
function Smoke() {
  const [data, setData] = useState(current);
  useEffect(() => {
    const refresh = () => setData(current);
    window.addEventListener('chambapp-smoke-workspace', refresh);
    return () => window.removeEventListener('chambapp-smoke-workspace', refresh);
  }, []);
  return <QueryClientProvider client={client}>
    <AuthContext.Provider value={{ user: { id: uid } as never, session: null, loading: false, error: null,
      isPasswordRecovery: false, completePasswordRecovery: () => {} }}>
      <WorkspaceContext.Provider value={{ data, isLoading: false, error: null, reload: noop }}>
        <TrackerContext.Provider value={{ active: null, elapsedSeconds: 0, busy: false, pending: false, error: null,
          pausedTaskId: null, start: noop, stop: noop, pause: noop, resume: noop, retryPending: noop }}>
          <AttendanceContext.Provider value={{ active: null, now, elapsedSeconds: 0, busy: false, pending: false,
            error: null, operation: null, perform: noop, start: noop, stop: noop, retry: noop }}>
            <FeedbackProvider><MemoryRouter initialEntries={['/partes-de-horas']}><Routes>
              <Route element={<WorkspaceLayout />}>
                <Route path="/partes-de-horas" element={<EntriesPage />} />
                <Route path="/resumen" element={<DashboardPage />} />
              </Route>
            </Routes></MemoryRouter>
              <details><summary>Operaciones de prueba</summary><pre>{JSON.stringify(operations, null, 2)}</pre></details>
            </FeedbackProvider>
          </AttendanceContext.Provider>
        </TrackerContext.Provider>
      </WorkspaceContext.Provider>
    </AuthContext.Provider>
  </QueryClientProvider>;
}
createRoot(document.getElementById('root')!).render(<Smoke />);
