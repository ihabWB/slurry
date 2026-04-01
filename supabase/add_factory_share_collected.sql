-- =====================================================================
-- إضافة حقل factory_share_collected لجدول disbursements
-- يمثل الإيراد الفعلي المحصّل (نقلات مدفوعة فقط × مساهمة المصنع)
-- =====================================================================
-- تشغيل: Supabase Dashboard → SQL Editor

-- 1. إضافة العمود
ALTER TABLE disbursements
  ADD COLUMN IF NOT EXISTS factory_share_collected NUMERIC NOT NULL DEFAULT 0;

-- 2. ملء البيانات الموجودة
DO $$
DECLARE
  contribution_per_trip  NUMERIC;
  rec                    RECORD;
  v_collected_count      INTEGER;
BEGIN
  SELECT COALESCE((SELECT value::numeric FROM settings WHERE key = 'factory_contribution'), 50)
    INTO contribution_per_trip;

  FOR rec IN
    SELECT id, period_from, period_to
    FROM disbursements
  LOOP
    -- عدد النقلات المدفوعة في الفترة
    SELECT COUNT(*)::INTEGER
    INTO v_collected_count
    FROM trips
    WHERE trip_date BETWEEN rec.period_from AND rec.period_to
      AND payment_status = 'paid';

    UPDATE disbursements
    SET factory_share_collected = v_collected_count * contribution_per_trip
    WHERE id = rec.id;

    RAISE NOTICE 'دفعة %: نقلات مدفوعة=%, محصّل=%₪',
      rec.id, v_collected_count, v_collected_count * contribution_per_trip;
  END LOOP;

  RAISE NOTICE '✅ تم تحديث factory_share_collected لجميع الدفعات';
END;
$$;

-- 3. التحقق
SELECT
  id, period_from, period_to, status,
  trips_count,
  ROUND(total_factory_share, 2)    AS factory_share_total,
  ROUND(factory_share_collected, 2) AS factory_share_collected,
  ROUND(total_factory_share - factory_share_collected, 2) AS factory_share_uncollected
FROM disbursements
ORDER BY period_from;
