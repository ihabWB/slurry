-- ─────────────────────────────────────────────────────────────
-- Migration: add_disbursement_approval
-- إضافة نظام الاعتماد الثلاثي للمطالبات المالية
-- draft → pending → closed | returned
-- ─────────────────────────────────────────────────────────────

-- 1. تحديث نوع status ليقبل القيم الجديدة
ALTER TABLE public.disbursements
  ALTER COLUMN status TYPE TEXT;

-- 2. إضافة أعمدة سير العمل
ALTER TABLE public.disbursements
  ADD COLUMN IF NOT EXISTS submitted_at  TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS submitted_by  UUID        NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS reviewed_by   UUID        NULL REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS review_notes  TEXT        NULL;

-- 3. قيد CHECK للحالات المسموحة
ALTER TABLE public.disbursements
  DROP CONSTRAINT IF EXISTS disbursements_status_check;

ALTER TABLE public.disbursements
  ADD CONSTRAINT disbursements_status_check
  CHECK (status IN ('draft', 'pending', 'closed', 'returned'));
