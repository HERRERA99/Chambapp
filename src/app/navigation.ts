import type { IconName } from '../shared/ui/Icon';
import { paths } from './paths.ts';

export type NavItem = {
  to: string;
  label: string;
  icon: IconName;
  /** Other routes that belong to this destination, such as the board view of tasks. */
  matches?: readonly string[];
};

export type NavGroup = {
  id: 'daily' | 'planning' | 'tools';
  label: string;
  collapsible?: boolean;
  items: readonly NavItem[];
};

export const navigationGroups: readonly NavGroup[] = [
  {
    id: 'daily',
    label: 'Día a día',
    items: [
      { to: paths.dashboard, label: 'Hoy', icon: 'today' },
      { to: paths.tasks, label: 'Tareas', icon: 'tasks', matches: [paths.board] },
      { to: paths.entries, label: 'Partes de horas', icon: 'clock' },
      { to: paths.attendance, label: 'Fichajes', icon: 'activity' },
    ],
  },
  {
    id: 'planning',
    label: 'Organización',
    items: [
      { to: paths.week, label: 'Mi semana', icon: 'calendar' },
      { to: paths.projects, label: 'Proyectos', icon: 'folder' },
      { to: paths.notes, label: 'Notas', icon: 'note' },
      { to: paths.calendar, label: 'Festivos y vacaciones', icon: 'flag' },
    ],
  },
  {
    id: 'tools',
    label: 'Herramientas',
    collapsible: true,
    items: [
      { to: paths.percentages, label: 'Porcentajes', icon: 'percent' },
      { to: paths.timeCalculator, label: 'Calculadora de horas', icon: 'calculator' },
      { to: paths.fakeData, label: 'Datos ficticios', icon: 'dice' },
      { to: paths.developer, label: 'Utilidades de desarrollo', icon: 'github' },
    ],
  },
];

export const settingsItem: NavItem = { to: paths.settings, label: 'Ajustes', icon: 'settings' };

export function isNavItemActive(item: NavItem, pathname: string) {
  return item.to === pathname || !!item.matches?.includes(pathname);
}

export function pageTitle(pathname: string) {
  if (pathname === paths.board) return 'Tablero de tareas';
  for (const group of navigationGroups)
    for (const item of group.items) if (item.to === pathname) return item.label;
  return pathname === paths.settings ? settingsItem.label : 'Mi espacio';
}

export type SidebarPreference = { hidden: boolean; rail: boolean };
export const defaultSidebarPreference: SidebarPreference = { hidden: false, rail: false };
export const sidebarStorageKey = 'chambapp:sidebar';

/** Reads a stored preference defensively: unknown or corrupted values fall back to the default. */
export function parseSidebarPreference(raw: string | null): SidebarPreference {
  if (!raw) return defaultSidebarPreference;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return defaultSidebarPreference;
    const record = value as Record<string, unknown>;
    return { hidden: record.hidden === true, rail: record.rail === true };
  } catch {
    return defaultSidebarPreference;
  }
}
