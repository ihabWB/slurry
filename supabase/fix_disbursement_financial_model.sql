-- =====================================================================
-- إصلاح النموذج المالي للدفعات
-- disbursed_amount = total_trips_cost (تكلفة النقلات الكاملة)
-- total_factory_share = 50₪ × عدد النقلات (رصيد مستقل للمشروع)
-- =====================================================================
-- تشغيل: Supabase Dashboard → SQL Editor

-- قراءة نسبة مساهمة المصنع من الإعدادات
DO $$
DECLARE
  contribution_per_trip  NUMERIC;
  municipality_rate      NUMERIC := 0.14;
  rec                    RECORD;
  v_trips_count          INTEGER;
  v_total_trips_cost     NUMERIC;
  v_total_factory_share  NUMERIC;
  v_disbursed_amount     NUMERIC;
  v_municipality_amount  NUMERIC;
  v_retention_amount     NUMERIC;
  v_net_payment          NUMERIC;
BEGIN
  -- قيمة مساهمة المصنع للنقلة الواحدة من إعدادات النظام
  SELECT COALESCE((SELECT value::numeric FROM settings WHERE key = 'factory_contribution'), 50)
    INTO contribution_per_trip;

  RAISE NOTICE 'مساهمة المصنع لكل نقلة: %₪', contribution_per_trip;

  -- تحديث كل دفعة على حدة
  FOR rec IN
    SELECT id, period_from, period_to, retention_pct
    FROM disbursements
    ORDER BY period_from
  LOOP
    -- عدد ومجموع تكلفة النقلات في الفترة
    SELECT
      COUNT(*)::INTEGER,
      COALESCE(SUM(trip_cost), 0)
    INTO v_trips_count, v_total_trips_cost
    FROM trips
    WHERE trip_date BETWEEN rec.period_from AND rec.period_to;

    -- رصيد مساهمات المصانع المستقل
    v_total_factory_share := v_trips_count * contribution_per_trip;

    -- مبلغ التمويل المطلوب = تكلفة النقلات الكاملة
    v_disbursed_amount := v_total_trips_cost;

    -- مبلغ البلدية 14%
    v_municipality_amount := ROUND(v_disbursed_amount * municipality_rate, 2);

    -- حجز الضمان
    v_retention_amount := ROUND(v_disbursed_amount * COALESCE(rec.retention_pct, 10) / 100, 2);

    -- صافي الدفعة
    v_net_payment := ROUND(v_disbursed_amount + v_municipality_amount - v_retention_amount, 2);

    -- تحديث السجل
    UPDATE disbursements SET
      trips_count         = v_trips_count,
      total_trips_cost    = v_total_trips_cost,
      total_factory_share = v_total_factory_share,
      disbursed_amount    = v_disbursed_amount,
      municipality_amount = v_municipality_amount,
      retention_amount    = v_retention_amount,
      net_payment         = v_net_payment
    WHERE id = rec.id;

    RAISE NOTICE 'دفعة %: نقلات=%, تكلفة=%, مساهمة مصانع=%, دفعة نهائية=%',
      rec.id, v_trips_count, v_total_trips_cost, v_total_factory_share, v_net_payment;
  END LOOP;

  RAISE NOTICE '✅ تم تحديث جميع الدفعات بالنموذج المالي الصحيح';
END;
$$;

-- التحقق من النتائج بعد التحديث
SELECT
  id,
  period_from,
  period_to,
  status,
  trips_count,
  ROUND(total_trips_cost, 2)    AS total_trips_cost,
  ROUND(total_factory_share, 2) AS factory_share_balance,
  ROUND(disbursed_amount, 2)    AS disbursed_amount,
  ROUND(municipality_amount, 2) AS municipality_14pct,
  ROUND(retention_amount, 2)    AS retention,
  ROUND(net_payment, 2)         AS net_payment
FROM disbursements
ORDER BY period_from;
