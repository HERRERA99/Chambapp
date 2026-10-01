import { createContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';

export type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  error: string | null;
  isPasswordRecovery: boolean;
  completePasswordRecovery: () => void;
};

export const AuthContext = createContext<AuthState | null>(null);
