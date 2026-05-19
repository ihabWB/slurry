-- ============================================================
-- add_budget_allocation.sql
-- توزيع الميزانية: احتياطي طوارئ + ميزانية تشغيلية مشتركة
-- (نقل وترحيل + دراسة شاملة لاحقاً)
-- شغّله مرة واحدة في Supabase Dashboard > SQL Editor
-- ============================================================

-- نسبة احتياطي الطوارئ (% من الميزانية الإجمالية)
-- الباقي (100% - contingency%) يُقسَّم بين:
--   1. مشروع النقل والترحيل (جاري الآن)
--   2. صندوق الدراسة الشاملة (ما يتبقى بعد نهاية 2027)
INSERT INTO settings (key, value, label) VALUES
  ('budget_contingency_pct', '10', 'نسبة احتياطي الطوارئ % من الميزانية الإجمالية (0–30)')
ON CONFLICT (key) DO NOTHING;

-- التحقق
SELECT key, value, label FROM settings
WHERE key IN ('project_budget', 'budget_contingency_pct', 'forecast_smoothing_alpha')
ORDER BY key;
