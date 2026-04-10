'use client';

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { getProfile } from '@/app/actions/profile';
import { logLogin } from '@/app/actions/users';

export type UserRole = 'admin' | 'manager' | 'viewer';

interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isManager: boolean;
  canEdit: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signIn: async () => null,
  signOut: async () => {},
  isAdmin: false,
  isManager: false,
  canEdit: false,
});

function makeClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as any;
}

// Singleton client — avoids creating multiple GoTrue instances
let _client: any = null;
function getClient() {
  if (!_client) _client = makeClient();
  return _client;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const sb = getClient();

    // onAuthStateChange fires immediately with current session
    // then again on every sign-in / sign-out
    const { data: { subscription } } = sb.auth.onAuthStateChange(
      async (_event: string, session: any) => {
        if (session?.user) {
          try {
            // Use server action (service role) to bypass RLS completely
            const profile = await getProfile(session.user.id);
            setUser({
              id: session.user.id,
              email: session.user.email ?? '',
              full_name: profile.full_name,
              role: profile.role as UserRole,
            });
          } catch {
            setUser({ id: session.user.id, email: session.user.email ?? '', full_name: null, role: 'viewer' });
          }
        } else {
          setUser(null);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string): Promise<string | null> {
    const sb = getClient();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.user) {
      // سجّل الدخول في الخلفية بدون انتظار
      logLogin(data.user.id, navigator.userAgent).catch(() => {})
      return null
    }
    if (error?.message.includes('Invalid login credentials'))
      return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
    if (error?.message.includes('Email not confirmed'))
      return 'يرجى تأكيد البريد الإلكتروني أولاً';
    return error?.message ?? null;
  }

  async function signOut() {
    const sb = getClient();
    await sb.auth.signOut();
  }

  const role = user?.role ?? null;

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      signIn,
      signOut,
      isAdmin: role === 'admin',
      isManager: role === 'manager',
      canEdit: role === 'admin' || role === 'manager',
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
