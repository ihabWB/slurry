-- ============================================================
-- Run this in Supabase Dashboard > SQL Editor
-- Fixes existing balances and creates triggers (INSERT + DELETE)
-- ============================================================

-- ┌─────────────────────────────────────────────────────────┐
-- │  STEP 1: إعادة حساب balance لكل المصانع من الصفر       │
-- │  شغّل هذا أولاً دائماً لإصلاح أي عدم تطابق            │
-- └─────────────────────────────────────────────────────────┘
UPDATE factories f
SET balance = COALESCE((
  SELECT SUM(t.factory_contribution)
  FROM trips t
  WHERE t.factory_id = f.id
    AND t.payment_status = 'credit'
    AND t.factory_contribution IS NOT NULL
), 0) - COALESCE((
  SELECT SUM(p.amount_paid)
  FROM payments p
  WHERE p.factory_id = f.id
), 0);

-- ┌─────────────────────────────────────────────────────────┐
-- │  STEP 2: Trigger on INSERT trip                         │
-- └─────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION update_factory_balance_on_trip()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.payment_status = 'credit' THEN
    UPDATE factories
    SET balance = balance + COALESCE(NEW.factory_contribution, 50),
        updated_at = NOW()
    WHERE id = NEW.factory_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_insert ON trips;
CREATE TRIGGER trg_trip_insert
  AFTER INSERT ON trips
  FOR EACH ROW EXECUTE FUNCTION update_factory_balance_on_trip();

-- ┌─────────────────────────────────────────────────────────┐
-- │  STEP 3: Trigger on DELETE trip                         │
-- │  يُعيد الرصيد عند حذف نقلة ذمة                        │
-- └─────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION update_factory_balance_on_trip_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.payment_status = 'credit' THEN
    UPDATE factories
    SET balance = balance - COALESCE(OLD.factory_contribution, 50),
        updated_at = NOW()
    WHERE id = OLD.factory_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_delete ON trips;
CREATE TRIGGER trg_trip_delete
  AFTER DELETE ON trips
  FOR EACH ROW EXECUTE FUNCTION update_factory_balance_on_trip_delete();

-- ┌─────────────────────────────────────────────────────────┐
-- │  STEP 4: Trigger on UPDATE trip (تغيير حالة الدفع)     │
-- └─────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION update_factory_balance_on_trip_update()
RETURNS TRIGGER AS $$
BEGIN
  -- إذا تحولت من ذمة إلى مدفوع → نخصم الرصيد
  IF OLD.payment_status = 'credit' AND NEW.payment_status = 'paid' THEN
    UPDATE factories
    SET balance = balance - COALESCE(OLD.factory_contribution, 50),
        updated_at = NOW()
    WHERE id = OLD.factory_id;
  -- إذا تحولت من مدفوع إلى ذمة → نضيف الرصيد
  ELSIF OLD.payment_status = 'paid' AND NEW.payment_status = 'credit' THEN
    UPDATE factories
    SET balance = balance + COALESCE(NEW.factory_contribution, 50),
        updated_at = NOW()
    WHERE id = NEW.factory_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_trip_update ON trips;
CREATE TRIGGER trg_trip_update
  AFTER UPDATE OF payment_status ON trips
  FOR EACH ROW EXECUTE FUNCTION update_factory_balance_on_trip_update();

-- ┌─────────────────────────────────────────────────────────┐
-- │  STEP 5: Trigger on INSERT payment                      │
-- └─────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION update_factory_balance_on_payment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE factories
  SET balance = balance - NEW.amount_paid,
      updated_at = NOW()
  WHERE id = NEW.factory_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_insert ON payments;
CREATE TRIGGER trg_payment_insert
  AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION update_factory_balance_on_payment();

-- ┌─────────────────────────────────────────────────────────┐
-- │  STEP 6: Trigger on DELETE payment                      │
-- └─────────────────────────────────────────────────────────┘
CREATE OR REPLACE FUNCTION update_factory_balance_on_payment_delete()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE factories
  SET balance = balance + OLD.amount_paid,
      updated_at = NOW()
  WHERE id = OLD.factory_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_delete ON payments;
CREATE TRIGGER trg_payment_delete
  AFTER DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_factory_balance_on_payment_delete();

-- ┌─────────────────────────────────────────────────────────┐
-- │  التحقق من النتيجة                                      │
-- └─────────────────────────────────────────────────────────┘
SELECT id, name, balance FROM factories ORDER BY balance DESC;
