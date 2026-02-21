-- Create table for Players
create table players (
  id uuid default gen_random_uuid() primary key,
  ottoneu_id integer unique not null,
  name text not null,
  position text,
  nfl_team text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create table for Player Stats (seasonal)
create table player_stats (
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

-- Create table for League Prices (current state, specific to a league)
create table league_prices (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references players(id) not null,
  league_id integer not null,
  price integer not null default 0,
  team_name text, -- The fantasy team that owns the player
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(player_id, league_id)
);


-- Create table for Transactions (structured event log)
create table transactions (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references players(id) not null,
  league_id integer not null,
  season integer not null,
  transaction_type text not null,
  team_name text,
  from_team text,
  salary integer,
  transaction_date date,
  raw_description text,
  scraped_at timestamptz default now() not null,
  unique(player_id, league_id, transaction_type, transaction_date, salary)
);

-- Stores manual surplus value adjustments per player per league
-- Used to override VORP-calculated dollar value with scouting judgment
create table surplus_adjustments (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references players(id) not null,
  league_id integer not null,
  adjustment numeric not null default 0,
  notes text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  unique(player_id, league_id)
);

-- Create indexes for performance
create index idx_surplus_adjustments_league on surplus_adjustments(league_id);
create index idx_surplus_adjustments_player on surplus_adjustments(player_id);
create index idx_players_ottoneu_id on players(ottoneu_id);
create index idx_player_stats_player_id on player_stats(player_id);
create index idx_league_prices_league_id on league_prices(league_id);
create index idx_league_prices_player_id on league_prices(player_id);
create index idx_transactions_player_league on transactions(player_id, league_id, season);
