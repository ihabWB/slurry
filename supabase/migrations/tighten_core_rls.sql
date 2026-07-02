-- ═══════════════════════════════════════════════════════════════
-- Tighten RLS on factories, trips, payments, audit_log
-- Run this in Supabase SQL Editor
--
-- These tables have shipped since the original schema.sql with:
--   CREATE POLICY "Allow all for now" ON <table> FOR ALL USING (true) WITH CHECK (true);
-- That policy has no `TO` clause, so it applies to `anon` too — anyone holding
-- the public anon key can read/write/delete these tables with no login at all.
-- This migration removes that policy and requires an authenticated session
-- for every operation, matching the pattern already used for disbursements
-- (see enable_rls_disbursements.sql).
--
-- Scope note: this closes the anonymous-access hole. It does NOT add
-- fine-grained per-role restrictions (e.g. "only approvers can approve a
-- trip") — those rules currently live in application code / the UI. Adding
-- them at the DB layer is a good follow-up but needs the exact workflow
-- rules confirmed first so it doesn't break legitimate flows.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.factories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for now" ON public.factories;
DROP POLICY IF EXISTS "Allow all for now" ON public.trips;
DROP POLICY IF EXISTS "Allow all for now" ON public.payments;
DROP POLICY IF EXISTS "Allow all for now" ON public.audit_log;

-- factories: any logged-in user can read/write (existing app behavior for
-- all authenticated roles today — see src/lib/api.ts)
CREATE POLICY "factories_authenticated_all"
  ON public.factories FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- trips: same — approval-state write rules stay enforced in the app for now
CREATE POLICY "trips_authenticated_all"
  ON public.trips FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- payments: same
CREATE POLICY "payments_authenticated_all"
  ON public.payments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- audit_log: nothing in the app currently writes to this table directly, so
-- lock writes to admins and allow any logged-in user to read it.
CREATE POLICY "audit_log_select_authenticated"
  ON public.audit_log FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "audit_log_write_admin"
  ON public.audit_log FOR INSERT
  WITH CHECK (public.get_my_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════
-- Public login-page stats
--
-- src/app/login/page.tsx shows aggregate totals (trip count, factory count,
-- total collected) to signed-out visitors, via getLoginStats() in
-- src/lib/api.ts, which previously read the raw tables directly. Now that
-- those tables require `authenticated`, that call would silently return
-- zeros. This SECURITY DEFINER function exposes just the three aggregate
-- numbers (no row-level data) to anonymous callers.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_login_stats()
RETURNS TABLE(total_trips BIGINT, total_factories BIGINT, total_collection NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT COUNT(*) FROM trips)      AS total_trips,
    (SELECT COUNT(*) FROM factories)  AS total_factories,
    COALESCE((SELECT SUM(amount_paid) FROM payments), 0)
      + (SELECT COUNT(*) FROM trips WHERE payment_method = 'cash') * 50
      AS total_collection;
$$;

GRANT EXECUTE ON FUNCTION public.get_login_stats() TO anon, authenticated;
