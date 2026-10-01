import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { WorkspaceLayout } from './layouts/WorkspaceLayout';
import { PreviewProvider } from '../shared/preview/PreviewProvider';
import { paths } from './paths';

const LandingPage = lazy(() => import('../features/landing/LandingPage'));
const AuthPage = lazy(() => import('../features/auth/AuthPage'));
const OnboardingPage = lazy(() => import('../features/onboarding/OnboardingPage'));
const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const ProjectsPage = lazy(() => import('../features/projects/ProjectsPage'));
const TasksPage = lazy(() => import('../features/tasks/TasksPage'));
const EntriesPage = lazy(() => import('../features/time-entries/EntriesPage'));
const WeekPage = lazy(() => import('../features/week/WeekPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const NotFoundPage = lazy(() => import('./NotFoundPage'));

const routeTitles: Record<string, string> = {
  '/': 'Tu tiempo, bajo control', '/login': 'Acceso', '/registro': 'Crear cuenta',
  '/onboarding': 'Configuración inicial', '/resumen': 'Resumen', '/proyectos': 'Proyectos y clientes',
  '/tareas': 'Tareas', '/partes-de-horas': 'Partes de horas', '/mi-semana': 'Mi semana', '/ajustes': 'Ajustes',
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
  return <BrowserRouter><PreviewProvider><RouteEffects /><Suspense fallback={<div className="route-loading" role="status">Cargando Chambapp…</div>}><Routes><Route path={paths.home} element={<LandingPage />} /><Route path={paths.login} element={<AuthPage />} /><Route path={paths.register} element={<AuthPage />} /><Route path={paths.onboarding} element={<OnboardingPage />} /><Route element={<WorkspaceLayout />}><Route path={paths.dashboard} element={<DashboardPage />} /><Route path={paths.projects} element={<ProjectsPage />} /><Route path={paths.tasks} element={<TasksPage />} /><Route path={paths.entries} element={<EntriesPage />} /><Route path={paths.week} element={<WeekPage />} /><Route path={paths.settings} element={<SettingsPage />} /></Route><Route path="*" element={<NotFoundPage />} /></Routes></Suspense></PreviewProvider></BrowserRouter>;
}
