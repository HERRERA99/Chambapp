export interface EntryPreview {
  id: string; date: string; period: string; project: string; task: string;
  realInterval: string; roundedInterval: string; realDuration: string;
  roundedDuration: string; difference: string; note: string;
  status: 'live' | 'finished' | 'manual' | 'absorbed';
}

export const entries: readonly EntryPreview[] = [
  { id: '5', date: 'Jueves 08 May', period: 'Hoy · En curso', project: 'Mercury FinTech', task: 'Refactor de Middleware JWT', realInterval: '14:15 → Ahora', roundedInterval: '14:15 → Ejemplo', realDuration: '02:44:19', roundedDuration: '02h 45m', difference: 'Provisional', note: 'Testeo de concurrencia en invalidación de cache y verificación de firma.', status: 'live' },
  { id: '4', date: 'Jueves 08 May', period: 'Mañana', project: 'Mercury FinTech', task: 'Stripe Webhooks & Retries', realInterval: '09:07 → 12:45', roundedInterval: '09:15 → 12:45', realDuration: '03h 38m', roundedDuration: '03h 45m', difference: '+7m', note: 'Refactor middleware de validación y gestión de retries asíncronos.', status: 'finished' },
  { id: '3', date: 'Miércoles 07 May', period: 'Tarde', project: 'Neobank Mobile', task: 'Rediseño Onboarding KYC', realInterval: '15:30 → 18:40', roundedInterval: '15:30 → 18:45', realDuration: '03h 10m', roundedDuration: '03h 15m', difference: '+5m', note: 'Diseño de flujos de verificación biométrica y tokens de sesión.', status: 'finished' },
  { id: 'sync', date: 'Miércoles 07 May', period: 'Mañana', project: 'Neobank Mobile', task: 'Daily Standup & Sync', realInterval: '09:07 → 09:12', roundedInterval: '09:15 → 09:15', realDuration: '00h 05m', roundedDuration: '00h 00m', difference: 'Absorbido', note: 'Reunión de alineación de bugs críticos en staging.', status: 'absorbed' },
  { id: '2', date: 'Martes 06 May', period: 'Jornada continua', project: 'Aero Logistics', task: 'Portal Mapbox Fleet Telemetry', realInterval: '10:00 → 14:18', roundedInterval: '10:00 → 14:30', realDuration: '04h 18m', roundedDuration: '04h 30m', difference: '+12m', note: 'Integración de capas geoespaciales con WebSockets de telemetría.', status: 'finished' },
  { id: '1', date: 'Lunes 05 May', period: 'Tarde', project: 'Kroma Studio', task: 'E-Commerce v2 Checkout', realInterval: '16:00 → 18:30', roundedInterval: '16:00 → 18:30', realDuration: '02h 30m', roundedDuration: '02h 30m', difference: 'Exacto', note: 'Resolución de discrepancia de stock en hooks de checkout.', status: 'manual' },
];

export const entryStatusLabels = { live: 'En vivo · Ejemplo', finished: 'Finalizado · R15', manual: 'Manual', absorbed: 'Tramo mínimo' } as const;
