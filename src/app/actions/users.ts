'use server';

import { createClient } from '@supabase/supabase-js';

type UserRole = 'admin' | 'manager' | 'viewer';

// Admin client — uses service_role key, runs server-side only
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ─── Create user ────────────────────────────────────────────
export async function createUser(
  email: string,
  password: string,
  fullName: string,
  role: UserRole
): Promise<{ error: string | null }> {
  const admin = adminClient();

  // 1. Create auth user (email auto-confirmed)
  const { data, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (authError || !data?.user) {
    return { error: authError?.message ?? 'فشل إنشاء المستخدم' };
  }

  // 2. Insert profile
  const { error: profileError } = await admin
    .from('user_profiles')
    .insert({ id: data.user.id, full_name: fullName, role });

  if (profileError) {
    return { error: 'تم إنشاء الحساب لكن فشل تعيين الصلاحية: ' + profileError.message };
  }

  return { error: null };
}

// ─── List users ─────────────────────────────────────────────
export async function listUsers(): Promise<{
  users: { id: string; email: string; full_name: string | null; role: UserRole; created_at: string }[];
  error: string | null;
}> {
  const admin = adminClient();

  // Get all profiles
  const { data: profiles, error: profileError } = await admin
    .from('user_profiles')
    .select('id, full_name, role, created_at')
    .order('created_at', { ascending: false });

  if (profileError) return { users: [], error: profileError.message };

  // Get emails from auth.users via admin API
  const { data: authData, error: authError } = await admin.auth.admin.listUsers();
  if (authError) return { users: [], error: authError.message };

  const emailMap = new Map(authData.users.map((u) => [u.id, u.email ?? '']));

  const users = (profiles ?? []).map((p: any) => ({
    id: p.id,
    email: emailMap.get(p.id) ?? '—',
    full_name: p.full_name,
    role: p.role as UserRole,
    created_at: p.created_at,
  }));

  return { users, error: null };
}

// ─── Update role ─────────────────────────────────────────────
export async function updateUserRole(
  userId: string,
  role: UserRole
): Promise<{ error: string | null }> {
  const admin = adminClient();
  const { error } = await admin
    .from('user_profiles')
    .update({ role })
    .eq('id', userId);
  return { error: error?.message ?? null };
}

// ─── Delete user ─────────────────────────────────────────────
export async function deleteUser(userId: string): Promise<{ error: string | null }> {
  const admin = adminClient();

  // Delete from auth (cascades to user_profiles)
  const { error } = await admin.auth.admin.deleteUser(userId);
  return { error: error?.message ?? null };
}
