-- Migration 032: Create player_contracts table for offseason FA/contract-movement
-- signal (spike #651, acquisition source #3).
--
-- Sourced by scraping OverTheCap per-position contract-history pages
-- (overthecap.com/contract-history/<position>) with scripts/scrape_otc_contracts.py.
-- The nflverse contracts mirror is stale (last published 2022-04, no 2023+), so
-- OTC is the primary source (host allowlisted in .devcontainer). Each row is one
-- contract a player signed, dated by `year_signed`, so a leakage-free per-season
-- panel is reconstructable: a deal with year_signed == N is signed in N's
-- offseason (March–April), before that season's games.
--
-- Powers the new_contract_value_raw / contract_signed_raw features: a player who
-- signs a new (especially large) deal has a more secure/larger role — a
-- non-market-projection proxy for how a team values a player, targeting the
-- WR/RB volume the depth tier misses.
--
-- `apy_cap_pct` is OTC's "APY as % of cap at signing" — already cap-inflation
-- normalized, so it is comparable across years. Read only by Python (service
-- key, bypasses RLS); RLS enabled with no anon policy (mirrors draft_capital).

CREATE TABLE player_contracts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id),
  position text NOT NULL,
  year_signed integer NOT NULL,
  years numeric(4,1),
  value bigint,
  apy bigint,
  guaranteed bigint,
  apy_cap_pct numeric(6,3),

  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE(player_id, year_signed)
);

CREATE INDEX idx_player_contracts_year ON player_contracts(year_signed);
CREATE INDEX idx_player_contracts_player ON player_contracts(player_id);

ALTER TABLE public.player_contracts ENABLE ROW LEVEL SECURITY;
