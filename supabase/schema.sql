-- ============================================================
-- SLURRY (الربو) - Stone Factory Waste Management System
-- Supabase SQL Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- FACTORIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS factories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  owner_name  TEXT NOT NULL,
  phone       TEXT NOT NULL,
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  region      TEXT NOT NULL DEFAULT '',
  balance     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRIPS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS trips (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  factory_id     UUID NOT NULL REFERENCES factories(id) ON DELETE RESTRICT,
  amount         NUMERIC(10, 2) NOT NULL DEFAULT 50,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('paid', 'credit')) DEFAULT 'credit',
  trip_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     TEXT
);

-- ============================================================
-- PAYMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  factory_id        UUID NOT NULL REFERENCES factories(id) ON DELETE RESTRICT,
  amount_paid       NUMERIC(12, 2) NOT NULL CHECK (amount_paid > 0),
  date              DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_image_url TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        TEXT
);

-- ============================================================
-- AUDIT LOG TABLE (immutable history)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name   TEXT NOT NULL,
  record_id    TEXT NOT NULL,
  action       TEXT NOT NULL,
  old_data     JSONB,
  new_data     JSONB,
  performed_by TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_trips_factory_id   ON trips(factory_id);
CREATE INDEX IF NOT EXISTS idx_trips_created_at   ON trips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trips_trip_date    ON trips(trip_date DESC);
CREATE INDEX IF NOT EXISTS idx_trips_payment_status ON trips(payment_status);
CREATE INDEX IF NOT EXISTS idx_payments_factory_id ON payments(factory_id);
CREATE INDEX IF NOT EXISTS idx_payments_date       ON payments(date DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table_record  ON audit_log(table_name, record_id);

-- ============================================================
-- FUNCTION: Auto-update factory balance on trip insert
-- ============================================================
CREATE OR REPLACE FUNCTION update_factory_balance_on_trip()
RETURNS TRIGGER AS $$
BEGIN
  -- If payment_status = 'credit', add to balance
  -- If payment_status = 'paid', balance is not affected (paid immediately)
  IF NEW.payment_status = 'credit' THEN
    UPDATE factories SET balance = balance + NEW.amount, updated_at = NOW()
    WHERE id = NEW.factory_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trip_insert
  AFTER INSERT ON trips
  FOR EACH ROW EXECUTE FUNCTION update_factory_balance_on_trip();

-- ============================================================
-- FUNCTION: Reduce factory balance on payment insert
-- ============================================================
CREATE OR REPLACE FUNCTION update_factory_balance_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE factories SET balance = balance - NEW.amount_paid, updated_at = NOW()
  WHERE id = NEW.factory_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_insert
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION update_factory_balance_on_payment();

-- ============================================================
-- ROW LEVEL SECURITY (enable for production)
-- ============================================================
ALTER TABLE factories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log  ENABLE ROW LEVEL SECURITY;

-- For development: allow all (replace with proper auth policies in production)
CREATE POLICY "Allow all for now" ON factories  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for now" ON trips      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for now" ON payments   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for now" ON audit_log  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- STORAGE BUCKET for receipts
-- ============================================================
-- Run this in Supabase Dashboard > Storage > New Bucket
-- Bucket name: receipts | Public: true
