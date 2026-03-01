-- Migration 012: Create arbitration plan tables for saving/comparing
-- manual arbitration allocation strategies.

-- Stores plan metadata (name, timestamps)
CREATE TABLE arbitration_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id integer NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(league_id, name)
);

-- Stores per-player dollar allocations within a plan
CREATE TABLE arbitration_plan_allocations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id uuid REFERENCES arbitration_plans(id) ON DELETE CASCADE NOT NULL,
  player_id uuid REFERENCES players(id) NOT NULL,
  amount integer NOT NULL CHECK (amount >= 1 AND amount <= 4),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  UNIQUE(plan_id, player_id)
);

-- Indexes for common query patterns
CREATE INDEX idx_arb_plans_league ON arbitration_plans(league_id);
CREATE INDEX idx_arb_plan_allocs_plan ON arbitration_plan_allocations(plan_id);
CREATE INDEX idx_arb_plan_allocs_player ON arbitration_plan_allocations(player_id);
