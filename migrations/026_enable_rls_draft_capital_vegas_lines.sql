-- Migration 026: Enable RLS on draft_capital and team_vegas_lines.
--
-- Fixes the critical Supabase advisor `rls_disabled_in_public` for both
-- tables. Without RLS, anyone with the anon key can read or modify every
-- row via PostgREST. Server-side code (Python scripts via
-- `scripts/config.get_supabase_client()` and Next.js server routes via
-- `web/lib/supabase.supabaseAdmin`) uses the service key, which bypasses
-- RLS, so writes are unaffected.
--
-- Reads:
--   * team_vegas_lines is read by the web frontend via the anon
--     Supabase client (web/lib/vegas-lines.ts), so it needs a public
--     SELECT policy.
--   * draft_capital is not read from the web. Only Python uses it (via
--     the service key), so no anon policy is needed.

ALTER TABLE public.draft_capital ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_vegas_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.team_vegas_lines
  FOR SELECT TO anon USING (true);
