import type { Stat } from '../../../shared/ui/StatGrid';

export const dashboardStats: readonly Stat[] = [
  { label: 'Objetivo diario', value: '08h 00m', detail: 'Jornada de jueves · Datos de ejemplo', icon: 'flag', progress: 100 },
  { label: 'Tiempo real hoy', value: '06h 18m', detail: '2 bloques de trabajo', icon: 'timer', progress: 79 },
  { label: 'Tiempo imputado', value: '06h 45m', detail: 'Ajustado por tramos de 15m', icon: 'tasks', progress: 84 },
  { label: 'Balance semanal', value: '+45m', detail: 'Saldo informativo y conciliador', icon: 'gauge', accent: true, progress: 84 },
];

export const priorityTasks = [
  { id: 'stripe', title: 'Integración Stripe & Webhooks', project: 'Mercury FinTech · Core v2', duration: '02h 44m', active: true },
  { id: 'jwt', title: 'Auditoría de seguridad tokens JWT', project: 'Neobank Web Client · Auth', duration: '01h 15m', active: false },
  { id: 'timeline', title: 'Refactor vista Timeline semanal', project: 'Rediseño Mobile App · Sprint 24', duration: '02h 00m', active: false },
  { id: 'sync', title: 'Sync técnica con Arquitectura', project: 'General · Management & Ops', duration: '00h 45m', active: false },
] as const;
