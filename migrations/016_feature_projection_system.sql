-- Migration 016: Feature-based projection system
-- Adds tables for tracking projection models, their outputs, and backtest results.
-- Enables iterative model development where features can be added incrementally
-- and accuracy measured per model version.

-- Model registry: each row defines a projection model with its features and config
CREATE TABLE projection_models (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  description text,
  features jsonb NOT NULL DEFAULT '[]',
  config jsonb NOT NULL DEFAULT '{}',
  is_baseline boolean DEFAULT false,
  is_active boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(name, version)
);

-- Projections per model version (one row per model × player × season)
CREATE TABLE model_projections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id uuid REFERENCES projection_models(id) ON DELETE CASCADE NOT NULL,
  player_id uuid REFERENCES players(id) NOT NULL,
  season integer NOT NULL,
  projected_ppg numeric NOT NULL,
  feature_values jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(model_id, player_id, season)
);

-- Cached backtest accuracy metrics per model × season × position
CREATE TABLE backtest_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  model_id uuid REFERENCES projection_models(id) ON DELETE CASCADE NOT NULL,
  season integer NOT NULL,
  position text,
  player_count integer,
  mae numeric,
  bias numeric,
  r_squared numeric,
  rmse numeric,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(model_id, season, position)
);

-- Indexes for common query patterns
CREATE INDEX idx_model_projections_model_id ON model_projections(model_id);
CREATE INDEX idx_model_projections_player_season ON model_projections(player_id, season);
CREATE INDEX idx_model_projections_season ON model_projections(season);
CREATE INDEX idx_backtest_results_model_id ON backtest_results(model_id);

-- RLS policies (match existing pattern: public read access)
ALTER TABLE projection_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_projections ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access" ON projection_models FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON model_projections FOR SELECT USING (true);
CREATE POLICY "Allow public read access" ON backtest_results FOR SELECT USING (true);

-- Write policies for Python backend scripts (use anon key)
CREATE POLICY "Allow anon insert" ON projection_models FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update" ON projection_models FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete" ON projection_models FOR DELETE TO anon USING (true);

CREATE POLICY "Allow anon insert" ON model_projections FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update" ON model_projections FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete" ON model_projections FOR DELETE TO anon USING (true);

CREATE POLICY "Allow anon insert" ON backtest_results FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Allow anon update" ON backtest_results FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete" ON backtest_results FOR DELETE TO anon USING (true);
