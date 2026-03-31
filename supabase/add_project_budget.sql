-- ============================================================
-- add_project_budget.sql
-- يضيف إجمالي ميزانية التمويل المخصصة للمشروع في جدول الإعدادات
-- شغّله مرة واحدة في Supabase Dashboard > SQL Editor
-- ============================================================

INSERT INTO settings (key, value, label)
VALUES ('project_budget', '2967500', 'إجمالي التمويل المخصص للمشروع (شيكل)')
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      label      = EXCLUDED.label,
      updated_at = NOW();

-- التحقق
SELECT key, value, label FROM settings ORDER BY key;
