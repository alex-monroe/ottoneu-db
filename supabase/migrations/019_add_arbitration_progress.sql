-- Arbitration progress tracking: stores scraped data from the Ottoneu
-- arbitration page to show real-time allocation status during arb season.

-- Per-player allocation raises from the "Current Allocations" table
create table if not exists arbitration_progress (
  id uuid default gen_random_uuid() primary key,
  league_id integer not null,
  season integer not null,
  player_name text not null,
  ottoneu_id integer,
  team_name text,               -- fantasy team that owns the player
  current_salary integer,
  raise_amount integer not null default 0,
  new_salary integer,
  scraped_at timestamptz default now() not null
);

-- Track which teams have completed their arbitration allocations
create table if not exists arbitration_progress_teams (
  id uuid default gen_random_uuid() primary key,
  league_id integer not null,
  season integer not null,
  team_name text not null,
  is_complete boolean not null default false,
  scraped_at timestamptz default now() not null,
  unique(league_id, season, team_name)
);

-- Indexes for fast lookups
create index if not exists idx_arb_progress_league_season
  on arbitration_progress(league_id, season);
create index if not exists idx_arb_progress_teams_league_season
  on arbitration_progress_teams(league_id, season);

-- RLS: allow anonymous read access (public page)
alter table arbitration_progress enable row level security;
alter table arbitration_progress_teams enable row level security;

create policy "Allow anonymous read access on arbitration_progress"
  on arbitration_progress for select using (true);
create policy "Allow anonymous read access on arbitration_progress_teams"
  on arbitration_progress_teams for select using (true);

-- Service role can insert/update/delete (scraper uses service key)
create policy "Allow service role full access on arbitration_progress"
  on arbitration_progress for all using (true) with check (true);
create policy "Allow service role full access on arbitration_progress_teams"
  on arbitration_progress_teams for all using (true) with check (true);
