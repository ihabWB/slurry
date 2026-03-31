-- ============================================================
-- PRICING RULES TABLE
-- جدول التسعيرة — قابل للتعديل من واجهة الإعدادات
-- ============================================================
CREATE TABLE IF NOT EXISTS pricing_rules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  waste_type      TEXT NOT NULL CHECK (waste_type IN ('liquid', 'solid')),
  volume_m3       NUMERIC(6,1) NOT NULL,          -- 10 أو 15 م³
  max_distance_km NUMERIC(6,1) NOT NULL,          -- 7 = "أقل أو تساوي 7"، 9999 = "أكثر من 7"
  dump_site       TEXT NOT NULL,                  -- 'municipal_dump' | 'central_press'
  unit_price      NUMERIC(10,2) NOT NULL,         -- سعر الوحدة بالشيكل
  label           TEXT,                           -- وصف اختياري للعرض
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (waste_type, volume_m3, max_distance_km, dump_site)
);

-- Auto updated_at
CREATE OR REPLACE FUNCTION set_pricing_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_pricing_updated_at ON pricing_rules;
CREATE TRIGGER trg_pricing_updated_at
  BEFORE UPDATE ON pricing_rules
  FOR EACH ROW EXECUTE FUNCTION set_pricing_updated_at();

-- RLS
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_read_pricing"  ON pricing_rules FOR SELECT USING (true);
CREATE POLICY "allow_admin_pricing" ON pricing_rules FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- ============================================================
-- SEED: 8 pricing rows
-- max_distance_km: 7 = "≤7 كم"، 9999 = ">7 كم"
-- dump_site: 'municipal_dump' = مكب البلدية المعتمد
--            'central_press'  = عصارة الربو المركزية
-- ============================================================
INSERT INTO pricing_rules (waste_type, volume_m3, max_distance_km, dump_site, unit_price, label) VALUES
  ('solid',  15, 7,    'municipal_dump', 285, 'جاف 15م³ ≤7كم — مكب البلدية'),
  ('liquid', 10, 7,    'municipal_dump', 190, 'سائل 10م³ ≤7كم — مكب البلدية'),
  ('liquid', 15, 7,    'municipal_dump', 255, 'سائل 15م³ ≤7كم — مكب البلدية'),
  ('liquid', 10, 7,    'central_press',  140, 'سائل 10م³ ≤7كم — عصارة مركزية'),
  ('liquid', 15, 7,    'central_press',  180, 'سائل 15م³ ≤7كم — عصارة مركزية'),
  ('solid',  15, 9999, 'municipal_dump', 395, 'جاف 15م³ >7كم — مكب البلدية'),
  ('liquid', 10, 9999, 'municipal_dump', 190, 'سائل 10م³ >7كم — مكب البلدية'),
  ('liquid', 15, 9999, 'municipal_dump', 270, 'سائل 15م³ >7كم — مكب البلدية')
ON CONFLICT (waste_type, volume_m3, max_distance_km, dump_site) DO NOTHING;

-- ============================================================
-- SETTINGS TABLE
-- إعدادات عامة للنظام (key-value)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  label       TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_read_settings"  ON settings FOR SELECT USING (true);
CREATE POLICY "allow_admin_settings" ON settings FOR ALL
  USING (public.get_my_role() = 'admin')
  WITH CHECK (public.get_my_role() = 'admin');

-- Seed: مساهمة المصنع
INSERT INTO settings (key, value, label) VALUES
  ('factory_contribution', '50', 'مساهمة المصنع لكل نقلة (شيكل)')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- ADD COST FIELDS TO TRIPS TABLE
-- ============================================================
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS trip_cost             NUMERIC(10,2),  -- سعر الوحدة الكلي
  ADD COLUMN IF NOT EXISTS factory_contribution  NUMERIC(10,2),  -- مساهمة المصنع
  ADD COLUMN IF NOT EXISTS subsidy_amount        NUMERIC(10,2);  -- تغطية التمويل = trip_cost - factory_contribution
