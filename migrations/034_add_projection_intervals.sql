-- Migration 034: Add empirical prediction-interval bands to projections.
--
-- The point model gives a single projected PPG; downstream decisions (keep/cut,
-- arbitration, and especially a trade analyzer comparing two rosters) need to
-- know how much to trust each number. These columns store an empirical band
-- around the point projection, derived from the model's own held-out
-- rolling-origin residuals (scripts/feature_projections/prediction_intervals.py).
--
-- The band is a segment-conditional (position × projected-PPG tier) residual
-- quantile: for the default 80% interval, projected_ppg_low/high are the p10/p90
-- of realized PPG for players the model projected similarly. Held-out coverage is
-- confirmed on an unseen season before shipping (the calibration gate), so an 80%
-- band contains the actual ~80% of the time. Volatile segments (thin-history
-- players, low-tier QBs) get wider bands than stable veterans.
--
-- NULL means "no band" (e.g. K, rookies with no calibrated segment, or a model
-- with no fitted calibration): consumers fall back to the point estimate.

ALTER TABLE model_projections ADD COLUMN projected_ppg_low numeric;
ALTER TABLE model_projections ADD COLUMN projected_ppg_high numeric;
ALTER TABLE player_projections ADD COLUMN projected_ppg_low numeric;
ALTER TABLE player_projections ADD COLUMN projected_ppg_high numeric;

COMMENT ON COLUMN model_projections.projected_ppg_low IS
  'Lower bound of the empirical prediction interval (default p10) around '
  'projected_ppg, from held-out segment-conditional residual quantiles '
  '(prediction_intervals.py). NULL = no calibrated band.';
COMMENT ON COLUMN model_projections.projected_ppg_high IS
  'Upper bound of the empirical prediction interval (default p90) around '
  'projected_ppg. NULL = no calibrated band.';
COMMENT ON COLUMN player_projections.projected_ppg_low IS
  'Lower bound of the prediction interval, promoted from model_projections. '
  'NULL = no calibrated band.';
COMMENT ON COLUMN player_projections.projected_ppg_high IS
  'Upper bound of the prediction interval, promoted from model_projections. '
  'NULL = no calibrated band.';
