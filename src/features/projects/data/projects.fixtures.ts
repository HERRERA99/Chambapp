import type { Stat } from '../../../shared/ui/StatGrid';

export interface ProjectPreview {
  id: string; client: string; initials: string; title: string; description: string;
  tags: readonly string[]; consumed: string; budget: string; progress: number;
  tasks: number; remaining: string; status: 'active' | 'paused' | 'archived';
  badge: string; tone: 'neutral' | 'accent' | 'success' | 'warning'; artwork?: string;
}

export const projectStats: readonly Stat[] = [
  { label: 'Cuentas activas', value: '6 / 8', detail: '75% de la cartera de ejemplo', icon: 'folder' },
  { label: 'Tareas en curso', value: '42', detail: '14 marcadas como prioritarias', icon: 'tasks' },
  { label: 'Horas imputadas · Mes', value: '184,5h', detail: '+12,4% vs. ciclo anterior', icon: 'clock' },
  { label: 'Cumplimiento presupuesto', value: '89%', detail: '1 cuenta en sobrecoste', icon: 'gauge', accent: true },
];

export const projects: readonly ProjectPreview[] = [
  { id: 'mercury', client: 'Mercury Global', initials: 'MG', title: 'Mercury FinTech — Refactor API', description: 'Pasarela de pagos y evolución de la plataforma de servicios financieros.', tags: ['Stripe Gateway', 'Go', 'REST v3'], consumed: '84,5h', budget: '120h', progress: 70, tasks: 14, remaining: '35,5h restantes', status: 'active', badge: 'Cronómetro de ejemplo', tone: 'accent' },
  { id: 'neobank', client: 'Neobank Europa', initials: 'NE', title: 'Neobank Mobile — Rediseño Onboarding', description: 'Diseño de flujos de verificación biométrica y experiencia de bienvenida.', tags: ['Flutter', 'Biometría', 'Figma Tokens'], consumed: '62h', budget: '80h', progress: 77, tasks: 8, remaining: '18h restantes', status: 'active', badge: 'Fase 2: KYC', tone: 'neutral' },
  { id: 'aero', client: 'Aero Transportes', initials: 'AT', title: 'Aero Logistics — Portal Operativo', description: 'Control de flotas, mapas y telemetría de vehículos en tiempo real.', tags: ['Mapbox', 'Fleet', 'WebSockets'], consumed: '34h', budget: '160h', progress: 21, tasks: 12, remaining: '126h disponibles', status: 'active', badge: 'En plazo óptimo', tone: 'success' },
  { id: 'kroma', client: 'Kroma Labs', initials: 'KL', title: 'Kroma Studio — E-Commerce v2', description: 'Revisión final de pasarelas y optimización de renderizado en checkout Shopify Hydrogen.', tags: ['Shopify', 'Hydrogen', 'Tailwind'], consumed: '48h', budget: '50h', progress: 96, tasks: 6, remaining: 'Quedan solo 2h', status: 'active', badge: 'Alerta de margen · 96%', tone: 'warning' },
  { id: 'datastream', client: 'Datastream Inc.', initials: 'DI', title: 'Datastream Pipeline', description: 'Migración de clústeres Apache Kafka y canalización de métricas para el equipo de operaciones.', tags: ['Apache Kafka', 'Terraform', 'AWS EKS'], consumed: '92h', budget: '90h', progress: 102, tasks: 9, remaining: '+2,0h de desviación', status: 'paused', badge: '+2h de desvío', tone: 'warning' },
  { id: 'lumina', client: 'Lumina Brand Inc.', initials: 'LB', title: 'Lumina Brand & Web', description: 'Identidad visual y plataforma editorial. Ciclo completado y liquidado.', tags: ['Design System', 'Astro Web'], consumed: '65h', budget: '65h', progress: 100, tasks: 7, remaining: 'Sin horas pendientes', status: 'archived', badge: 'Archivado & facturado', tone: 'neutral' },
];
