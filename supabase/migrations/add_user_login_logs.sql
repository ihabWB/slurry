-- =============================================
-- User Login Logs
-- Tracks every successful login with timestamp,
-- user info, and device type.
-- Safe to re-run.
-- =============================================

CREATE TABLE IF NOT EXISTS public.user_login_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent  TEXT,
  device_type TEXT GENERATED ALWAYS AS (
    CASE
      WHEN user_agent ILIKE '%mobile%' OR user_agent ILIKE '%android%' OR user_agent ILIKE '%iphone%' THEN 'mobile'
      WHEN user_agent ILIKE '%tablet%' OR user_agent ILIKE '%ipad%' THEN 'tablet'
      ELSE 'desktop'
    END
  ) STORED
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_login_logs_user_id ON public.user_login_logs(user_id);
-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_login_logs_time ON public.user_login_logs(logged_in_at DESC);

-- RLS: only service_role can insert/read (via server actions)
ALTER TABLE public.user_login_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON public.user_login_logs;
CREATE POLICY "service_role_all" ON public.user_login_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
