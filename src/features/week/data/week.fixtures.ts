export interface WeekBlock { project: string; task: string; duration: string; interval: string; active?: boolean }
export interface WeekDay { name: string; short: string; date: string; target: number; logged: number; duration: string; balance: string; state: 'closed' | 'active' | 'planned'; blocks: readonly WeekBlock[] }

export const weekDays: readonly WeekDay[] = [
  { name: 'Lunes', short: 'Lun', date: '05', target: 8, logged: 8.25, duration: '08h 15m', balance: '+15m', state: 'closed', blocks: [
    { project: 'Mercury API', task: 'Pasarela Stripe & Endpoints', duration: '03h 30m', interval: '09:05 – 12:18' },
    { project: 'Core Cache', task: 'Redis Tests & Invalidation', duration: '02h 15m', interval: '13:30 – 15:45' },
    { project: 'Kroma Studio', task: 'Design System Tokens', duration: '02h 30m', interval: '16:00 – 18:30' },
  ] },
  { name: 'Martes', short: 'Mar', date: '06', target: 8, logged: 8, duration: '08h 00m', balance: 'Exacto', state: 'closed', blocks: [
    { project: 'Aero Logistics', task: 'Mapbox Realtime Telemetry', duration: '04h 30m', interval: '10:00 – 14:18' },
    { project: 'Aero Logistics', task: 'Fleet Sync & Socket Clustering', duration: '03h 30m', interval: '15:30 – 19:00' },
  ] },
  { name: 'Miércoles', short: 'Mié', date: '07', target: 8, logged: 8.5, duration: '08h 30m', balance: '+30m', state: 'closed', blocks: [
    { project: 'Chambapp Ops', task: 'Daily Standup', duration: '00h 00m', interval: '09:07 – 09:12' },
    { project: 'Mercury API', task: 'OAuth Refresh & Crypto Keys', duration: '03h 45m', interval: '10:14 – 13:46' },
    { project: 'Neobank KYC', task: 'Biometric Validation Webhook', duration: '04h 45m', interval: '14:30 – 19:15' },
  ] },
  { name: 'Jueves', short: 'Jue', date: '08', target: 8, logged: 6.75, duration: '06h 45m', balance: '1h 15m restante', state: 'active', blocks: [
    { project: 'Mercury API', task: 'Stripe Webhooks & Retries', duration: '03h 45m', interval: '09:07 – 12:45' },
    { project: 'Mercury API', task: 'Refactor JWT Payload Verification', duration: '02:44:19', interval: '14:15 – Ahora', active: true },
  ] },
  { name: 'Viernes', short: 'Vie', date: '09', target: 5.5, logged: 0, duration: '00h 00m', balance: 'Jornada intensiva', state: 'planned', blocks: [
    { project: 'Mercury API', task: 'Documentación OpenAPI v3', duration: '~03h 00m', interval: 'Sugerencia del sprint' },
    { project: 'Aero Logistics', task: 'QA E2E & Sign-off', duration: '~02h 30m', interval: 'Sugerencia del sprint' },
  ] },
];
