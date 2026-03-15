-- =============================================
-- user_profiles migration  (safe to re-run)
-- =============================================

-- 1. Create table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role      TEXT NOT NULL DEFAULT 'viewer'
              CHECK (role IN ('admin','manager','viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable RLS
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 3. Helper: get current user role (SECURITY DEFINER avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;

-- 4. Drop old policies (safe re-run)
DROP POLICY IF EXISTS "users_read_own_profile"   ON public.user_profiles;
DROP POLICY IF EXISTS "admins_read_all_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "admins_insert_profiles"   ON public.user_profiles;
DROP POLICY IF EXISTS "admins_update_profiles"   ON public.user_profiles;
DROP POLICY IF EXISTS "admins_delete_profiles"   ON public.user_profiles;

-- 5. Create policies
CREATE POLICY "users_read_own_profile"
  ON public.user_profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "admins_read_all_profiles"
  ON public.user_profiles FOR SELECT USING (public.get_my_role() = 'admin');

CREATE POLICY "admins_insert_profiles"
  ON public.user_profiles FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "admins_update_profiles"
  ON public.user_profiles FOR UPDATE USING (public.get_my_role() = 'admin');

CREATE POLICY "admins_delete_profiles"
  ON public.user_profiles FOR DELETE USING (public.get_my_role() = 'admin');

-- 6. Auto updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
