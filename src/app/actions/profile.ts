'use server';

import { createClient } from '@supabase/supabase-js';

export async function getProfile(userId: string): Promise<{ full_name: string | null; role: string }> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data } = await admin
    .from('user_profiles')
    .select('full_name, role')
    .eq('id', userId)
    .maybeSingle();

  return {
    full_name: data?.full_name ?? null,
    role: data?.role ?? 'viewer',
  };
}
