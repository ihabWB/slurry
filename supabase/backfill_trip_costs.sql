-- ============================================================
-- backfill_trip_costs.sql
-- يحدّث النقلات القديمة التي لا تحتوي trip_cost
-- بربطها بجدول pricing_rules
-- شغّله مرة واحدة في Supabase Dashboard > SQL Editor
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │  STEP 1: اطّلع على النقلات التي تنقصها التكلفة         │
-- └─────────────────────────────────────────────────────────┘
-- SELECT COUNT(*) FROM trips WHERE trip_cost IS NULL;

-- ┌─────────────────────────────────────────────────────────┐
-- │  STEP 2: تحديث النقلات — ربط بجدول التسعيرة            │
-- │  الشرط: يجب أن تكون waste_type + volume_m3 +           │
-- │          distance_km + dump_site كلها محددة             │
-- └─────────────────────────────────────────────────────────┘
UPDATE trips t
SET
  trip_cost            = pr.unit_price,
  factory_contribution = (
    SELECT CAST(value AS NUMERIC)
    FROM settings
    WHERE key = 'factory_contribution'
    LIMIT 1
  ),
  subsidy_amount       = pr.unit_price - (
    SELECT CAST(value AS NUMERIC)
    FROM settings
    WHERE key = 'factory_contribution'
    LIMIT 1
  )
FROM pricing_rules pr
WHERE
  t.trip_cost IS NULL
  AND t.waste_type  IS NOT NULL
  AND t.volume_m3   IS NOT NULL
  AND t.distance_km IS NOT NULL
  AND t.dump_site   IS NOT NULL
  AND pr.waste_type      = t.waste_type
  AND pr.volume_m3       = t.volume_m3
  -- distance_km مخزّن كـ 7 أو 9999 في العمود
  AND pr.max_distance_km = CASE WHEN t.distance_km <= 7 THEN 7 ELSE 9999 END
  AND pr.dump_site       = t.dump_site;

-- ┌─────────────────────────────────────────────────────────┐
-- │  STEP 3: التحقق — كم نقلة تم تحديثها                   │
-- └─────────────────────────────────────────────────────────┘
SELECT
  COUNT(*) FILTER (WHERE trip_cost IS NOT NULL) AS "نقلات لها سعر",
  COUNT(*) FILTER (WHERE trip_cost IS NULL)     AS "نقلات بدون سعر (ناقصة بيانات)",
  SUM(trip_cost)            AS "إجمالي التكلفة",
  SUM(factory_contribution) AS "إجمالي مساهمات المصانع",
  SUM(subsidy_amount)       AS "إجمالي الدعم"
FROM trips;
