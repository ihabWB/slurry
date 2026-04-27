-- =============================================
-- Add excluded_until to trips
-- Records the period_to date of the disbursement
-- this trip was excluded from, enabling carry-over
-- to future disbursement periods.
-- Safe to re-run.
-- =============================================

ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS excluded_until DATE NULL;

COMMENT ON COLUMN public.trips.excluded_until IS
  'The period_to date of the disbursement this trip was excluded from (disbursement_excluded=true), '
  'or the period_to of the disbursement it was carried over into (disbursement_excluded=false). '
  'NULL means the trip has never been excluded or is a normal in-period trip.';

-- Backfill existing excluded trips:
-- Set excluded_until to the period_to of the disbursement that covers their trip_date.
UPDATE public.trips t
SET excluded_until = (
  SELECT d.period_to
  FROM public.disbursements d
  WHERE t.trip_date >= d.period_from
    AND t.trip_date <= d.period_to
  ORDER BY d.period_to DESC
  LIMIT 1
)
WHERE t.disbursement_excluded = true
  AND t.excluded_until IS NULL;
