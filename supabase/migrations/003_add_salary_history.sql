-- Migration: Add salary_history and transactions tables
-- Created: 2026-02-14

-- 1. Salary history — point-in-time snapshots (one row per meaningful change)
create table if not exists salary_history (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references players(id) not null,
  league_id integer not null,
  season integer not null,
  price integer not null,
  team_name text,
  scraped_at timestamptz default now() not null
);

-- For querying a player's salary timeline
create index if not exists idx_salary_history_player_league_season
  on salary_history(player_id, league_id, season);

-- For efficient dedup: finding the latest row for a player
create index if not exists idx_salary_history_latest
  on salary_history(player_id, league_id, season, scraped_at desc);

-- 2. Transactions — structured event log from Ottoneu transaction history
create table if not exists transactions (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references players(id) not null,
  league_id integer not null,
  season integer not null,
  transaction_type text not null,        -- 'Add', 'Cut', 'Trade', 'Auction Won', etc.
  team_name text,                        -- team involved (or destination team for trades)
  from_team text,                        -- source team (for trades/cuts)
  salary integer,                        -- salary at time of transaction
  transaction_date date,                 -- date parsed from Ottoneu's table
  raw_description text,                  -- original text from the page for future parsing
  scraped_at timestamptz default now() not null,
  unique(player_id, league_id, transaction_type, transaction_date, salary)
);

create index if not exists idx_transactions_player_league
  on transactions(player_id, league_id, season);
