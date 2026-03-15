-- Migration: Add trip_date column to trips table
-- Run this in Supabase SQL Editor

ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS trip_date DATE NOT NULL DEFAULT CURRENT_DATE;

-- Update existing rows to use their created_at date
UPDATE trips SET trip_date = created_at::DATE WHERE trip_date IS NULL;

-- Index for efficient date filtering
CREATE INDEX IF NOT EXISTS idx_trips_trip_date ON trips(trip_date DESC);
