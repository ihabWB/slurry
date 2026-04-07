-- =============================================
-- Add disbursement_excluded flag to trips
-- Allows a trip to be excluded from any
-- disbursement calculation even if it falls
-- within the period date range.
-- Safe to re-run.
-- =============================================

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS disbursement_excluded BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.trips.disbursement_excluded IS
  'When true, this trip is excluded from disbursement calculations and can be included in a future disbursement.';
