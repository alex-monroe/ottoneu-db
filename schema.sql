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

-- Create table for League Prices (specific to a league)
create table league_prices (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references players(id) not null,
  league_id integer not null,
  season integer not null, -- Season the price applies to
  price integer not null default 0,
  team_name text, -- The fantasy team that owns the player
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(player_id, league_id, season)
);

-- Create indexes for performance
create index idx_players_ottoneu_id on players(ottoneu_id);
create index idx_player_stats_player_id on player_stats(player_id);
create index idx_league_prices_league_id on league_prices(league_id);
create index idx_league_prices_player_id on league_prices(player_id);
