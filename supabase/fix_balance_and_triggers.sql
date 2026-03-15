-- ============================================================
-- Run this in Supabase Dashboard > SQL Editor
-- Fixes existing balances and creates triggers
-- ============================================================

-- 1. Recalculate balance for all factories from actual data
UPDATE factories f
SET balance = COALESCE((
  SELECT SUM(t.amount)
  FROM trips t
  WHERE t.factory_id = f.id AND t.payment_status = 'credit'
), 0) - COALESCE((
  SELECT SUM(p.amount_paid)
  FROM payments p
  WHERE p.factory_id = f.id
), 0);

-- 2. Trigger: update balance when a new trip is inserted
CREATE OR REPLACE FUNCTION update_factory_balance_on_trip()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_status = 'credit' THEN
    UPDATE factories SET balance = balance + NEW.amount, updated_at = NOW()
    WHERE id = NEW.factory_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_insert ON trips;
CREATE TRIGGER trg_trip_insert
  AFTER INSERT ON trips
  FOR EACH ROW EXECUTE FUNCTION update_factory_balance_on_trip();

-- 3. Trigger: reduce balance when a payment is inserted
CREATE OR REPLACE FUNCTION update_factory_balance_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE factories SET balance = balance - NEW.amount_paid, updated_at = NOW()
  WHERE id = NEW.factory_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_insert ON payments;
CREATE TRIGGER trg_payment_insert
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION update_factory_balance_on_payment();

-- Verify result
SELECT id, name, balance FROM factories ORDER BY balance DESC;
