/** Web Locks serialize the durable tracker intent across all tabs on this origin. */
export async function withTrackerLock<T>(
  userId: string,
  work: () => Promise<T>,
  manager = globalThis.navigator?.locks,
): Promise<T> {
  if (!manager)
    throw new Error(
      'Este navegador no puede coordinar el cronómetro entre pestañas. Usa un navegador actualizado o registra el intervalo manualmente.',
    );
  return manager.request(`chambapp:tracker:${userId}`, { ifAvailable: true }, async (lock) => {
    if (!lock)
      throw new Error(
        'Otra pestaña está guardando el cronómetro. Espera a que termine antes de continuar.',
      );
    return work();
  });
}
