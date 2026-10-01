import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { CommandAction, Json } from '../../domain/models';
import { executeCommand } from '../../lib/supabase/workspace.repository';
import { useAuth } from '../auth/useAuth';

export function useCommand() {
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const queryClient = useQueryClient();
  const { user } = useAuth();
  async function run<T = unknown>(
    action: CommandAction,
    payload: Record<string, Json | undefined> = {},
  ): Promise<T> {
    if (!user) throw new Error('Inicia sesión antes de guardar los cambios.');
    if (inFlight.current) throw new Error('Espera a que se guarden los cambios actuales.');
    inFlight.current = true;
    setPending(true);
    try {
      return await executeCommand<T>(action, payload, undefined, user.id);
    } finally {
      // Includes version conflicts: refresh the UI before a user retries with current data.
      await queryClient
        .invalidateQueries({ queryKey: ['workspace', user.id] })
        .catch(() => undefined);
      inFlight.current = false;
      setPending(false);
    }
  }
  return { run, pending };
}
