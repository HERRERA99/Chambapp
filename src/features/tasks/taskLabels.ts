import type { Task } from '../../domain/models';

export const taskStatusLabels: Record<Task['estado'], string> = {
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  completada: 'Completada',
};
