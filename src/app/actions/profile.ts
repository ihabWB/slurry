'use server';

import { createClient as createServerSupabase } from '@/lib/supabase/server';

// `userId` is accepted for call-site compatibility (AuthContext passes
// session.user.id) but is NOT trusted — the profile returned is always for
// the caller's own verified session, so one user can't read another user's
// role/name by passing an arbitrary id.
export async function getProfile(userId: string): Promise<{ full_name: string | null; role: string }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.id !== userId) {
    return { full_name: null, role: 'viewer' };
  }

  // RLS's "users_read_own_profile" policy already permits this read
  // (auth.uid() = id), so the anon-key session client is sufficient here —
  // no need for the service-role client.
  const { data } = await supabase
    .from('user_profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  return {
    full_name: data?.full_name ?? null,
    role: data?.role ?? 'viewer',
  };
}
