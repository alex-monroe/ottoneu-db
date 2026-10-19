-- Keeper outlook: the distribution of a player's NEXT-season dollar value, as
-- it looked after a given NFL week of this season.
--
-- Written by scripts/keeper_value/publish.py (`just keeper-publish`). One row
-- per (player, season, as-of week): `season` is the NFL season the information
-- comes from, `value_season` (= season + 1) the season being valued. Week 0 is
-- the offseason / preseason view (last season and draft capital only).
--
-- Ottoneu offseason cuts are free, so a keeper is a call option on next
-- season's value: worth E[max(0, V − salary)]. The quantiles let a reader
-- compute that for any salary (the mean over the grid of max(0, q − salary)),
-- and P(keepable) = the share of the grid above the salary. See
-- docs/references/keeper-value.md.
--
-- Historical seasons are out-of-fold: a season's rows come from a model fitted
-- only on earlier seasons (`fit_through`), so /trades never credits a past
-- trade with what the season after it revealed.

CREATE TABLE IF NOT EXISTS keeper_outlook (
  id bigserial PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season integer NOT NULL,
  as_of_week integer NOT NULL CHECK (as_of_week BETWEEN 0 AND 18),
  value_season integer NOT NULL,

  -- The prior cell and the weight on the player's own data, w = n / (n + k).
  position text NOT NULL,
  years_in_league integer NOT NULL,
  draft_bucket text NOT NULL,
  career_games integer NOT NULL,
  own_weight real NOT NULL,

  -- Next-season dollar value (the /value market, floored at $1): 20
  -- equal-probability quantiles at 2.5%, 7.5%, … 97.5%, ascending.
  value_quantiles real[] NOT NULL,
  mean_value real NOT NULL,
  p10 real NOT NULL,
  p50 real NOT NULL,
  p90 real NOT NULL,

  -- The newest season N whose N+1 outcome trained the model.
  fit_through integer NOT NULL,
  model_version text NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE (player_id, season, as_of_week)
);

CREATE INDEX IF NOT EXISTS idx_keeper_outlook_season_week ON keeper_outlook(season, as_of_week);

COMMENT ON TABLE keeper_outlook IS
  'Next-season value distribution per player per as-of week (keeper option value); see scripts/keeper_value/publish.py.';

-- /trades and /trades/builder read it through the anon client.
ALTER TABLE public.keeper_outlook ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read access to keeper_outlook" ON public.keeper_outlook;
CREATE POLICY "Allow anon read access to keeper_outlook"
  ON public.keeper_outlook FOR SELECT TO anon USING (true);
