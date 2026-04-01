-- =====================================================================
-- نظام اعتماد النقلات
-- approval_status: draft → pending_approval → approved / rejected
-- =====================================================================
-- تشغيل: Supabase Dashboard → SQL Editor

-- 1. إضافة أعمدة الاعتماد على جدول النقلات
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS approval_status TEXT
    NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'rejected')),

  ADD COLUMN IF NOT EXISTS rejection_note TEXT,

  ADD COLUMN IF NOT EXISTS submitted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS submitted_by  UUID REFERENCES auth.users(id),

  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by   UUID REFERENCES auth.users(id),

  ADD COLUMN IF NOT EXISTS rejected_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by   UUID REFERENCES auth.users(id);

-- 2. النقلات الموجودة حالياً → تعتبر معتمدة (لا نريد تعطيل العمل الحالي)
UPDATE trips SET approval_status = 'approved' WHERE approval_status = 'draft';

-- 3. index لتسريع الفلترة حسب الحالة
CREATE INDEX IF NOT EXISTS trips_approval_status_idx ON trips(approval_status);

-- 4. التحقق من النتائج
SELECT
  approval_status,
  COUNT(*) AS count
FROM trips
GROUP BY approval_status
ORDER BY approval_status;
