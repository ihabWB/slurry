-- Add volume_m3 and waste_type columns to trips table
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS volume_m3   NUMERIC(8, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS waste_type  TEXT DEFAULT NULL CHECK (waste_type IN ('liquid', 'solid'));
