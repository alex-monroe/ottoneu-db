-- Migration: Add player_stats and season to league_prices
-- Created: 2026-01-16

-- 1. Create the new player_stats table
create table if not exists player_stats (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references players(id) not null,
  season integer not null,
  total_points numeric,
  games_played integer,
  snaps integer,
  ppg numeric,
  pps numeric,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(player_id, season)
);

-- 2. Update league_prices table
-- Add the season column (nullable first to allow backfilling)
alter table league_prices add column if not exists season integer;

-- Backfill existing prices to 2025 (Run this ONLY if you want existing data to be 2025)
-- We assume existing data is for the current context (2025)
update league_prices set season = 2025 where season is null;

-- Now make it not null
alter table league_prices alter column season set not null;

-- 3. Update Unique Constraint for league_prices
-- Drop the old constraint (on player_id, league_id)
-- Note: Postgres default naming convention is table_col1_col2_key
alter table league_prices drop constraint if exists league_prices_player_id_league_id_key;

-- Add new constraint (on player_id, league_id, season)
alter table league_prices add constraint league_prices_player_id_league_id_season_key unique(player_id, league_id, season);

-- 4. Create new indexes
create index if not exists idx_player_stats_player_id on player_stats(player_id);
