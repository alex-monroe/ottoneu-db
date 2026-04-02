-- Per-team arbitration allocation details: stores which teams allocated
-- money to which players, scraped from the per-team breakdown pages
-- at /football/{league_id}/arbitration/{team_id}.

create table if not exists arbitration_allocation_details (
  id uuid default gen_random_uuid() primary key,
  league_id integer not null,
  season integer not null,
  ottoneu_id integer not null,
  player_name text not null,
  owner_team_name text,
  allocating_team_name text not null,
  amount integer not null,
  scraped_at timestamptz default now() not null,
  unique(league_id, season, ottoneu_id, allocating_team_name)
);

-- Indexes for common query patterns
create index if not exists idx_arb_alloc_details_league_season
  on arbitration_allocation_details(league_id, season);
create index if not exists idx_arb_alloc_details_allocating_team
  on arbitration_allocation_details(league_id, season, allocating_team_name);
create index if not exists idx_arb_alloc_details_ottoneu_id
  on arbitration_allocation_details(league_id, season, ottoneu_id);

-- RLS: allow anonymous read access (public page)
alter table arbitration_allocation_details enable row level security;

create policy "Allow anonymous read access on arbitration_allocation_details"
  on arbitration_allocation_details for select using (true);

-- Service role can insert/update/delete (scraper uses service key)
create policy "Allow service role full access on arbitration_allocation_details"
  on arbitration_allocation_details for all using (true) with check (true);
