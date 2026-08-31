-- Migration 036: Record the player_contracts table.
--
-- BACKFILL OF AN EXISTING TABLE. This table was created directly against the
-- database on 2026-06-14 (during the #651 data-acquisition spike) without a
-- numbered migration, a TypeScript type, or a schema-doc entry, so it was
-- invisible to anyone reading migrations/ or docs/generated/db-schema.md while
-- holding 5,122 rows. This file is the retroactive record of intent; it is
-- written with IF NOT EXISTS so re-applying it against the live database is a
-- no-op. The DDL below was reconstructed from the live PostgREST schema.
--
-- Contents: NFL player contract history sourced from OverTheCap (OTC) —
-- per player per signing, the contract's length, total value, average per year
-- (APY), guaranteed money, and APY as a share of the salary cap. See
-- docs/exec-plans/data-acquisition-spike-651.md §3: contract movement is the
-- role-securing signal a same-data model cannot derive from a player's own
-- production history — a team that just guaranteed a receiver $50M has told you
-- something about his 2026 target share that his 2025 stat line has not.
--
-- Not yet wired into any projection feature. Money is stored in whole dollars.
--
-- Read only by Python (service key, bypasses RLS), so RLS is enabled with no
-- anon SELECT policy — mirrors draft_capital (026), team_coaching (031) and
-- red_zone_usage (032).

CREATE TABLE IF NOT EXISTS player_contracts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id),

  position text NOT NULL,
  year_signed integer NOT NULL,

  years numeric,          -- contract length in years
  value bigint,           -- total contract value, whole dollars
  apy bigint,             -- average per year, whole dollars
  guaranteed bigint,      -- guaranteed money, whole dollars
  apy_cap_pct numeric,    -- APY as a percentage of that year's salary cap

  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_player_contracts_player ON player_contracts(player_id);
CREATE INDEX IF NOT EXISTS idx_player_contracts_year ON player_contracts(year_signed);

ALTER TABLE public.player_contracts ENABLE ROW LEVEL SECURITY;
