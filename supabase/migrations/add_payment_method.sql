-- Add payment_method to trips to distinguish cash-on-delivery vs deferred payment
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT NULL
  CHECK (payment_method IN ('cash', 'later'));

-- Backfill: trips that were registered as 'paid' = cash on delivery
UPDATE trips SET payment_method = 'cash' WHERE payment_status = 'paid';
