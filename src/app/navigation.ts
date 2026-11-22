import { matchPath } from 'react-router-dom';
import type { IconName } from '../shared/ui/Icon.tsx';
import { paths } from './paths.ts';

export type NavigationTab = { to: string; label: string };
export type NavigationEntry = NavigationTab & {
  icon: IconName;
  tabs?: readonly NavigationTab[];
  alias?: string;
};

export const navigationItems: readonly NavigationEntry[] = [
  { to: paths.dashboard, label: 'Hoy', icon: 'dashboard' },
  {
    to: paths.week,
    label: 'Semana',
    icon: 'calendarRange',
    alias: paths.weekOverview,
    tabs: [
      { to: paths.week, label: 'Mi semana' },
      { to: paths.timesheet, label: 'Partes por tarea' },
    ],
  },
  {
    to: paths.entries,
    label: 'Registros',
    icon: 'clock',
    alias: paths.records,
    tabs: [
      { to: paths.entries, label: 'Partes' },
      { to: paths.attendance, label: 'Fichajes' },
    ],
  },
  {
    to: paths.tasks,
    label: 'Tareas',
    icon: 'tasks',
    tabs: [
      { to: paths.tasks, label: 'Tareas' },
      { to: paths.projects, label: 'Proyectos y clientes' },
    ],
  },
  { to: paths.calendar, label: 'Calendario', icon: 'calendarHeart' },
  { to: paths.notes, label: 'Notas', icon: 'notebook' },
  { to: paths.passwords, label: 'Contraseñas', icon: 'key' },
  {
    to: paths.percentages,
    label: 'Herramientas',
    icon: 'calculator',
    alias: paths.tools,
    tabs: [
      { to: paths.percentages, label: 'Porcentajes' },
      { to: paths.timeCalculator, label: 'Calculadora de horas' },
      { to: paths.fakeData, label: 'Datos ficticios' },
      { to: paths.developer, label: 'Utilidades de desarrollo' },
    ],
  },
];

export const settingsItem: NavigationEntry = {
  to: paths.settings,
  label: 'Ajustes',
  icon: 'settings',
};

export const navigationRedirects = navigationItems.flatMap(({ alias, to }) =>
  alias ? [{ from: alias, to }] : [],
);

const allItems = [...navigationItems, settingsItem];

export function resolveNavigation(pathname: string) {
  const target = navigationRedirects.find(({ from }) => matchPath(from, pathname))?.to ?? pathname;

  for (const entry of allItems) {
    const tabs = entry.tabs ?? [];
    const tab = tabs.find(({ to }) => matchPath(to, target));
    if (tab || matchPath(entry.to, target)) {
      return { entry, tabs, title: tab ? `${entry.label} / ${tab.label}` : entry.label };
    }
  }

  return { entry: null, tabs: [], title: 'Mi espacio' };
}
