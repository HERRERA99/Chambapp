import { VaultProvider } from '../features/vault/VaultProvider';
import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { WorkspaceLayout } from './layouts/WorkspaceLayout';
import { FeedbackProvider } from '../shared/feedback/FeedbackProvider';
import { AuthProvider } from '../features/auth/AuthProvider';
import { WorkspaceProvider } from '../features/workspace/WorkspaceProvider';
import { TrackerProvider } from '../features/tracker/TrackerProvider';
import { AttendanceProvider } from '../features/attendance/AttendanceProvider';
import { RequireAuth } from './RequireAuth';
import { paths } from './paths';

// Cloud edition only (the local edition has no landing page or accounts).
const LandingPage =
  import.meta.env.VITE_EDITION === 'local'
    ? null
    : lazy(() => import('../features/landing/LandingPage'));
const AuthPage =
  import.meta.env.VITE_EDITION === 'local' ? null : lazy(() => import('../features/auth/AuthPage'));
const OAuthCallbackPage =
  import.meta.env.VITE_EDITION === 'local'
    ? null
    : lazy(() => import('../features/auth/OAuthCallbackPage'));
const PasswordRecoveryPage =
  import.meta.env.VITE_EDITION === 'local'
    ? null
    : lazy(() => import('../features/auth/PasswordRecoveryPage'));
const OnboardingPage = lazy(() => import('../features/onboarding/OnboardingPage'));
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const ProjectsPage = lazy(() => import('../features/projects/ProjectsPage'));
const TasksPage = lazy(() => import('../features/tasks/TasksPage'));
const TimesheetPage = lazy(() => import('../features/timesheet/TimesheetPage'));
const NotesPage = lazy(() => import('../features/notes/NotesPage'));
const PasswordsPage = lazy(() => import('../features/passwords/PasswordsPage'));
const EntriesPage = lazy(() => import('../features/time-entries/EntriesPage'));
const AttendancePage = lazy(() => import('../features/attendance/AttendancePage'));
const WeekPage = lazy(() => import('../features/week/WeekPage'));
const CalendarPage = lazy(() => import('../features/calendar/CalendarPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const PercentagesPage = lazy(() => import('../features/calculators/PercentagesPage'));
const TimeCalculatorPage = lazy(() => import('../features/calculators/TimeCalculatorPage'));
const FakeDataPage = lazy(() => import('../features/fake-data/FakeDataPage'));
const DeveloperPage = lazy(() => import('../features/developer/DeveloperPage'));
const NotFoundPage = lazy(() => import('./NotFoundPage'));

const routeTitles: Record<string, string> = {
  '/': 'Tu tiempo, bajo control',
  '/login': 'Acceso',
  '/auth/callback': 'Completando acceso',
  '/registro': 'Crear cuenta',
  '/recuperar-contrasena': 'Recuperar acceso',
  '/onboarding': 'Configuración inicial',
  '/resumen': 'Resumen',
  '/proyectos': 'Proyectos y clientes',
  '/tareas': 'Tareas',
  '/parte-semanal': 'Parte semanal',
  '/notas': 'Notas Markdown',
  '/contrasenas': 'Contraseñas',
  '/calendario': 'Festivos y vacaciones',
  '/partes-de-horas': 'Partes de horas',
  '/fichajes': 'Entradas y salidas',
  '/mi-semana': 'Mi semana',
  '/porcentajes': 'Porcentajes',
  '/calculadora-de-horas': 'Calculadora de horas',
  '/datos-ficticios': 'Datos ficticios',
  '/utilidades-desarrollo': 'Utilidades de desarrollo',
  '/ajustes': 'Ajustes',
};

function RouteEffects() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    document.title = `${routeTitles[pathname] ?? 'Página no encontrada'} · Chambapp`;
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
    else window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname, hash]);
  return null;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WorkspaceProvider>
          <TrackerProvider>
            <AttendanceProvider>
              <FeedbackProvider>
                <RouteEffects />
                <Suspense
                  fallback={
                    <div className="route-loading" role="status">
                      Cargando Chambapp…
                    </div>
                  }
                >
                  <Routes>
                    {LandingPage && AuthPage && OAuthCallbackPage && PasswordRecoveryPage ? (
                      <>
                        <Route path={paths.home} element={<LandingPage />} />
                        <Route path={paths.login} element={<AuthPage />} />
                        <Route path={paths.authCallback} element={<OAuthCallbackPage />} />
                        <Route path={paths.register} element={<AuthPage />} />
                        <Route path={paths.recovery} element={<PasswordRecoveryPage />} />
                      </>
                    ) : (
                      // Local edition: straight to the app; old account links land there too.
                      [
                        paths.home,
                        paths.login,
                        paths.authCallback,
                        paths.register,
                        paths.recovery,
                      ].map((path) => (
                        <Route
                          key={path}
                          path={path}
                          element={<Navigate to={paths.dashboard} replace />}
                        />
                      ))
                    )}
                    <Route element={<RequireAuth onboarding />}>
                      <Route
                        path={paths.onboarding}
                        element={
                          <VaultProvider>
                            <OnboardingPage />
                          </VaultProvider>
                        }
                      />
                    </Route>
                    <Route element={<RequireAuth />}>
                      <Route element={<WorkspaceLayout />}>
                        <Route path={paths.dashboard} element={<DashboardPage />} />
                        <Route path={paths.projects} element={<ProjectsPage />} />
                        <Route path={paths.tasks} element={<TasksPage />} />
                        <Route path={paths.timesheet} element={<TimesheetPage />} />
                        <Route
                          path={paths.board}
                          element={<Navigate to={paths.timesheet} replace />}
                        />
                        <Route path={paths.notes} element={<NotesPage />} />
                        <Route path={paths.passwords} element={<PasswordsPage />} />
                        <Route path={paths.calendar} element={<CalendarPage />} />
                        <Route path={paths.entries} element={<EntriesPage />} />
                        <Route path={paths.attendance} element={<AttendancePage />} />
                        <Route path={paths.week} element={<WeekPage />} />
                        <Route path={paths.percentages} element={<PercentagesPage />} />
                        <Route path={paths.timeCalculator} element={<TimeCalculatorPage />} />
                        <Route path={paths.fakeData} element={<FakeDataPage />} />
                        <Route path={paths.developer} element={<DeveloperPage />} />
                        <Route path={paths.settings} element={<SettingsPage />} />
                      </Route>
                    </Route>
                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </FeedbackProvider>
            </AttendanceProvider>
          </TrackerProvider>
        </WorkspaceProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
