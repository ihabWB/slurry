-- Add new fields to trips table
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS coupon_number TEXT,
  ADD COLUMN IF NOT EXISTS driver_name TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT CHECK (vehicle_type IN ('tank', 'truck')),
  ADD COLUMN IF NOT EXISTS distance_km NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS dump_site TEXT,
  ADD COLUMN IF NOT EXISTS transfer_zone TEXT;

-- Ensure coupon_number is unique (skip nulls automatically)
CREATE UNIQUE INDEX IF NOT EXISTS trips_coupon_number_unique
  ON trips (coupon_number)
  WHERE coupon_number IS NOT NULL;
