-- ─────────────────────────────────────────────────────────────
-- Migration: add_disbursement_retention
-- إضافة حقول الحجوزات (Retention) لجدول الدفعات
-- ─────────────────────────────────────────────────────────────
-- شغّل هذا الملف إن كان جدول disbursements موجوداً مسبقاً
-- (إن كنت تشغّل add_disbursements.sql من جديد، لا تحتاج هذا)

ALTER TABLE public.disbursements
  ADD COLUMN IF NOT EXISTS retention_pct    NUMERIC(5,2)  NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS retention_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payment      NUMERIC(12,2) NOT NULL DEFAULT 0;

-- إضافة retention_pct إلى الإعدادات العامة
INSERT INTO public.settings (key, value, label)
VALUES ('retention_pct', '10', 'نسبة حجز التأمينات (%)')
ON CONFLICT (key) DO NOTHING;
