-- Migration: Add scraper_jobs table for persistent job queue
-- Created: 2026-02-07

create table if not exists scraper_jobs (
  id uuid default gen_random_uuid() primary key,
  task_type text not null,                      -- 'scrape_roster', 'scrape_player_card', 'pull_nfl_stats'
  params jsonb not null default '{}',           -- task-specific parameters
  status text not null default 'pending',       -- 'pending', 'running', 'completed', 'failed'
  priority integer not null default 0,          -- higher = runs first
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  last_error text,
  batch_id uuid,                                -- groups jobs from one enqueue call
  depends_on uuid references scraper_jobs(id),  -- must complete before this job runs
  created_at timestamptz default now() not null,
  started_at timestamptz,
  completed_at timestamptz
);

-- Indexes for efficient job polling
create index if not exists idx_scraper_jobs_status on scraper_jobs(status);
create index if not exists idx_scraper_jobs_batch_id on scraper_jobs(batch_id);
create index if not exists idx_scraper_jobs_depends_on on scraper_jobs(depends_on);
