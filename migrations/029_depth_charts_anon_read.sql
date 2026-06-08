-- Migration 029: Add an anon SELECT policy to depth_charts so the web app can
-- read it via the anon Supabase client (web/lib/depth-charts.ts), powering the
-- /depth-charts review page. Depth-chart tier is public, non-sensitive data
-- (it just mirrors published NFL depth charts). Writes are unaffected — the
-- Python backfill uses the service key, which bypasses RLS. GH #556.

CREATE POLICY "Enable read access for all users" ON public.depth_charts
  FOR SELECT TO anon USING (true);
