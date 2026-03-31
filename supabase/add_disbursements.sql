-- ─────────────────────────────────────────────────────────────
-- Migration: add_disbursements
-- إضافة جدول الدفعات الدورية (صرف التمويل)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.disbursements (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  period_from         DATE NOT NULL,
  period_to           DATE NOT NULL,
  trips_count         INTEGER NOT NULL DEFAULT 0,
  total_trips_cost    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_factory_share NUMERIC(12,2) NOT NULL DEFAULT 0,
  disbursed_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes               TEXT,
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','closed')),
  closed_at           TIMESTAMPTZ,
  closed_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT disbursement_valid_period CHECK (period_from <= period_to)
);

-- فهرس للبحث السريع حسب الحالة والفترة
CREATE INDEX IF NOT EXISTS idx_disbursements_status
  ON public.disbursements (status);

CREATE INDEX IF NOT EXISTS idx_disbursements_period
  ON public.disbursements (period_from, period_to);

-- RLS (اختياري — فعّله إن كنت تستخدم RLS على بقية الجداول)
-- ALTER TABLE public.disbursements ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "authenticated can read" ON public.disbursements
--   FOR SELECT USING (auth.role() = 'authenticated');
-- CREATE POLICY "editors can insert/update" ON public.disbursements
--   FOR ALL USING (auth.role() = 'authenticated');
