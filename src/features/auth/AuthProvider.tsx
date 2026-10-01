import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configurationError, getSupabase } from '../../lib/supabase/client';
import { AuthContext } from './AuthContext';

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
    // Auth listeners stay synchronous: querying Supabase from an async listener
    // can wait on the same auth lock held by the event that invoked it.
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      events += 1;
      setState({ session, loading: false, error: null });
      if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setIsPasswordRecovery(false);
    });

    void client.auth
      .getSession()
      .then(({ data, error }) => {
        // A newer auth event takes precedence over the initial request.
        if (active && events === 0) {
          setState({ session: data.session, loading: false, error: error?.message ?? null });
        }
      })
      .catch((error: unknown) => {
        if (active && events === 0) {
          setState({
            session: null,
            loading: false,
            error: error instanceof Error ? error.message : 'No se pudo comprobar la sesión.',
          });
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
