import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configurationError, getSupabase } from '../../lib/supabase/client';
import { AuthContext } from './AuthContext';
import { authErrorMessage } from './errors';

type SessionState = { session: Session | null; loading: boolean; error: string | null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    session: null,
    loading: !configurationError,
    error: configurationError,
  });
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery',
  );

  useEffect(() => {
    if (configurationError) return;
    const client = getSupabase();
    let active = true;
    let events = 0;
    let initialized = false;
    // Auth listeners stay synchronous: querying Supabase from an async listener
    // can wait on the same auth lock held by the event that invoked it.
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      events += 1;
      setState({ session, loading: !initialized, error: null });
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setIsPasswordRecovery(false);
    });

    void client.auth
      .initialize()
      .then(({ error }) => {
        if (error) throw error;
        return client.auth.getSession();
      })
      .then(({ data, error }) => {
        initialized = true;
        // A newer auth event takes precedence over the initial request.
        if (active) {
          setState((current) =>
            events === 0
              ? {
                  session: data.session,
                  loading: false,
                  error: error ? authErrorMessage(error) : null,
                }
              : { ...current, loading: false },
          );
        }
      })
      .catch((error: unknown) => {
        initialized = true;
        if (active) {
          setState((current) => ({ ...current, loading: false, error: authErrorMessage(error) }));
        }
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      user: state.session?.user ?? null,
      isPasswordRecovery,
      completePasswordRecovery: () => setIsPasswordRecovery(false),
    }),
    [state, isPasswordRecovery],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
