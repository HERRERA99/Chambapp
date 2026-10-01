export interface TaskPreview { id: string; title: string; project: string; projectId: string; budget: string; logged: string; real: string; progress: number; status: 'active' | 'pending' | 'completed'; warning?: boolean }

export const tasks: readonly TaskPreview[] = [
  { id: '8492', title: 'Refactor de Middleware de Autenticación y Tokens JWT', project: 'Mercury FinTech · Core API v2', projectId: 'mercury', budget: '14h 00m', logged: '11h 45m', real: '11h 20m', progress: 84, status: 'active' },
  { id: '8488', title: 'Integración pasarela Stripe & Webhooks', project: 'Mercury FinTech', projectId: 'mercury', budget: '10h 00m', logged: '08h 00m', real: '07h 43m', progress: 80, status: 'active' },
  { id: '7721', title: 'Rediseño Onboarding KYC', project: 'Neobank Mobile', projectId: 'neobank', budget: '16h 00m', logged: '08h 15m', real: '08h 10m', progress: 52, status: 'active' },
  { id: '9014', title: 'Portal Mapbox Fleet Telemetry', project: 'Aero Logistics', projectId: 'aero', budget: '24h 00m', logged: '12h 30m', real: '12h 18m', progress: 52, status: 'active' },
  { id: '6102', title: 'E-Commerce v2 Checkout', project: 'Kroma Studio', projectId: 'kroma', budget: '12h 00m', logged: '11h 30m', real: '11h 14m', progress: 96, status: 'active', warning: true },
  { id: '9100', title: 'Migración de esquemas PostgreSQL a Cockroach', project: 'Datastream Infra', projectId: 'datastream', budget: '16h 00m', logged: '18h 00m', real: '17h 48m', progress: 112, status: 'active', warning: true },
  { id: '4401', title: 'Auditoría de accesibilidad WCAG AAA', project: 'Lumina Brand', projectId: 'lumina', budget: '06h 00m', logged: '06h 00m', real: '05h 56m', progress: 100, status: 'completed' },
  { id: '7800', title: 'Pipeline CI/CD con GitHub Actions y E2E', project: 'Neobank Mobile', projectId: 'neobank', budget: '08h 00m', logged: '00h 00m', real: '00h 00m', progress: 0, status: 'pending' },
];

export const taskStatusLabels = { active: 'En curso', pending: 'Pendiente', completed: 'Completada' } as const;

export const taskDayGroups = [
  { date: 'Jueves, 08 de mayo', subtitle: '1 parte cerrado + 1 tramo de ejemplo', total: '03h 45m (+02:44)', today: true, sessions: [
    { id: '5', interval: '14:15 → Ahora', note: 'Testeo de concurrencia en invalidación de cache y verificación de firma criptográfica.', duration: '02:44:19', active: true },
    { id: '4', interval: '09:07 → 12:45', note: 'Refactor middleware de validación Stripe Webhooks y gestión de retries asíncronos.', duration: '03h 45m', active: false },
  ] },
  { date: 'Miércoles, 07 de mayo', subtitle: '1 sesión registrada', total: '03h 45m', today: false, sessions: [
    { id: '3', interval: '10:14 → 13:46', note: 'Implementación de refresh tokens con rotación y blacklisting distribuido.', duration: '03h 45m', active: false },
  ] },
  { date: 'Lunes, 05 de mayo', subtitle: '2 sesiones registradas', total: '04h 30m', today: false, sessions: [
    { id: '1', interval: '09:05 → 12:18', note: 'Auditoría de headers de seguridad y profiling de latencia de endpoints legacy.', duration: '03h 30m', active: false },
    { id: '2', interval: '15:30 → 16:22', note: 'Suites de tests unitarios con mocks JWT y revocación reactiva en Redis.', duration: '01h 00m', active: false },
  ] },
] as const;
