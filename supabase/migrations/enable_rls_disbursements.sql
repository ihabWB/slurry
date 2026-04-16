-- ═══════════════════════════════════════════════════════════════
-- Enable RLS on public.disbursements
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- 1. Enable RLS
ALTER TABLE public.disbursements ENABLE ROW LEVEL SECURITY;

-- 2. Drop old policies (safe re-run)
DROP POLICY IF EXISTS "disbursements_select_authenticated" ON public.disbursements;
DROP POLICY IF EXISTS "disbursements_insert_admin"         ON public.disbursements;
DROP POLICY IF EXISTS "disbursements_update_admin"         ON public.disbursements;
DROP POLICY IF EXISTS "disbursements_delete_admin"         ON public.disbursements;

-- 3. كل المستخدمين المسجلين يقدرون يقرأون (admins + managers)
CREATE POLICY "disbursements_select_authenticated"
  ON public.disbursements FOR SELECT
  USING (auth.role() = 'authenticated');

-- 4. الإنشاء والتعديل والحذف — الأدمن فقط
CREATE POLICY "disbursements_insert_admin"
  ON public.disbursements FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "disbursements_update_admin"
  ON public.disbursements FOR UPDATE
  USING (public.get_my_role() = 'admin');

CREATE POLICY "disbursements_delete_admin"
  ON public.disbursements FOR DELETE
  USING (public.get_my_role() = 'admin');
