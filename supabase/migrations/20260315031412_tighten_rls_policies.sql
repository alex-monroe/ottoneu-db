-- Tighten RLS policies across all public tables.
-- Server-side code now uses the secret key (bypasses RLS), so we can
-- restrict anon access to read-only on public data and block it entirely
-- on sensitive tables.

-- ============================================================
-- 1. Enable RLS on tables that were missing it
-- ============================================================

ALTER TABLE public.nfl_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arbitration_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arbitration_plan_allocations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. Add read-only policy for nfl_stats (public reference data)
-- ============================================================

CREATE POLICY "Enable read access for all users" ON public.nfl_stats
  FOR SELECT TO anon USING (true);

-- ============================================================
-- 3. No anon policies for users (contains password hashes)
--    Server-side auth uses the secret key to query this table.
-- ============================================================

-- (no policies added — anon is fully blocked)

-- ============================================================
-- 4. No anon policies for arbitration_plans and allocations
--    API routes use the secret key for all CRUD operations.
-- ============================================================

-- (no policies added — anon is fully blocked)

-- ============================================================
-- 5. Remove overly permissive surplus_adjustments policies
--    Keep SELECT for anon; drop INSERT/UPDATE/DELETE.
--    API routes use the secret key for writes.
-- ============================================================

DROP POLICY "Enable insert access for all users" ON public.surplus_adjustments;
DROP POLICY "Enable update access for all users" ON public.surplus_adjustments;
DROP POLICY "Enable delete access for all users" ON public.surplus_adjustments;

-- ============================================================
-- 6. scraper_jobs already has RLS enabled with no policies.
--    Python scripts use direct DB connection (not PostgREST),
--    so no anon policy is needed. This is intentional.
-- ============================================================
