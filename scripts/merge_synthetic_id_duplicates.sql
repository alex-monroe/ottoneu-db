-- One-off (2026-11-05): merge duplicate synthetic-id players created by
-- scripts/backfill_nfl_stats.py create_missing_players().
--
-- Cause: when a player's name lookup missed an existing synthetic-id player,
-- the md5-derived ottoneu_id collided with that player's own row, and the
-- "collision" loop decremented it and inserted a second copy. Each pair has
-- the same (name, position) and ottoneu_ids h and h-1, and both copies
-- collected derived rows (nfl_stats, projections, depth charts, ...).
-- On 2026-11-05: 693 pairs, 1,871 duplicate nfl_stats player-seasons; team
-- usage totals summed from nfl_stats.recent_team double-counted these players.
-- No league data was affected: no prices, transactions, surplus adjustments,
-- lineups or trades on either copy. The paired players rows were identical
-- apart from id/ottoneu_id.
--
-- Rule: keep the row with the md5 id (ottoneu_id = h), so the generator
-- resolves to it. For each table keyed on player_id, when both copies have a
-- row with the same key, keep the more recently written one. For player_stats
-- that is the row matching nfl_stats in 132/132 checkable cases; for nfl_stats
-- it is the copy refreshed by the migration-060 backfill. Then repoint the
-- dropped copy's remaining rows and delete it.
--
-- CAVEAT (found after applying): these tables have no updated_at trigger, and
-- the nfl_stats upsert does not set updated_at, so for nfl_stats "newest" was
-- the insert time, not the last refresh. Some twins refreshed by the 060
-- backfill lost to older rows. Core stats were identical in 1,868/1,871
-- conflicts; the 060 columns were restored by re-running
-- `backfill_nfl_stats.py` for 2010-2025 right after the merge. Re-run that
-- backfill after any future run of this script.
--
-- Atomic: everything runs in one DO block. With dry_run = true it raises at
-- the end, so the whole transaction rolls back and the error message carries
-- the counts. Idempotent: a second run finds no pairs.

DO $$
DECLARE
  dry_run constant boolean := true;  -- set false to apply
  spec record;
  tbl text;
  key_join text;
  n bigint;
  log text := '';
BEGIN
  CREATE TEMP TABLE dup_pairs ON COMMIT DROP AS
    SELECT a.id AS keep_id, b.id AS drop_id
    FROM players a
    JOIN players b
      ON lower(a.name) = lower(b.name)
     AND a.position = b.position
     AND b.ottoneu_id = a.ottoneu_id - 1
    WHERE a.ottoneu_id < 0;
  SELECT count(*) INTO n FROM dup_pairs;
  log := log || format('pairs=%s', n);

  -- Tables with a unique key on (player_id, <keys>) and a write timestamp.
  FOR spec IN
    SELECT * FROM (VALUES
      ('nfl_stats',           ARRAY['season'],               'updated_at'),
      ('player_stats',        ARRAY['season'],               'updated_at'),
      ('player_projections',  ARRAY['season'],               'updated_at'),
      ('model_projections',   ARRAY['model_id', 'season'],   'created_at'),
      ('keeper_outlook',      ARRAY['season', 'as_of_week'], 'updated_at'),
      ('depth_charts',        ARRAY['season'],               'updated_at'),
      ('red_zone_usage',      ARRAY['season'],               'updated_at'),
      ('ngs_passing',         ARRAY['season'],               'updated_at'),
      ('player_contracts',    ARRAY['year_signed'],          'updated_at'),
      ('draft_sharks_values', ARRAY['season'],               'scraped_at'),
      ('draft_capital',       ARRAY[]::text[],               'updated_at')
    ) AS s(tbl, keys, ts)
  LOOP
    SELECT coalesce(string_agg(format(' AND k.%1$I IS NOT DISTINCT FROM d.%1$I', c), ''), '')
      INTO key_join FROM unnest(spec.keys) AS c;

    -- 1. Both copies have the key and the dropped copy's row is newer:
    --    remove the kept copy's row so the newer one can move over.
    EXECUTE format(
      'DELETE FROM %1$I k USING %1$I d, dup_pairs p
        WHERE k.player_id = p.keep_id AND d.player_id = p.drop_id%2$s
          AND d.%3$I > k.%3$I', spec.tbl, key_join, spec.ts);
    GET DIAGNOSTICS n = ROW_COUNT;
    log := log || format(' | %s: keep-side replaced=%s', spec.tbl, n);

    -- 2. Remaining conflicts: the kept copy's row is as new or newer.
    EXECUTE format(
      'DELETE FROM %1$I d USING %1$I k, dup_pairs p
        WHERE k.player_id = p.keep_id AND d.player_id = p.drop_id%2$s',
      spec.tbl, key_join);
    GET DIAGNOSTICS n = ROW_COUNT;
    log := log || format(', drop-side deleted=%s', n);

    -- 3. Everything left on the dropped copy moves to the kept one.
    EXECUTE format(
      'UPDATE %1$I d SET player_id = p.keep_id FROM dup_pairs p
        WHERE d.player_id = p.drop_id', spec.tbl);
    GET DIAGNOSTICS n = ROW_COUNT;
    log := log || format(', repointed=%s', n);
  END LOOP;

  -- Remaining FK tables (no rows on either copy on 2026-11-05): repoint so a
  -- later run cannot strand anything. A unique conflict here aborts the
  -- whole transaction rather than lose data.
  FOREACH tbl IN ARRAY ARRAY[
    'transactions', 'league_prices', 'surplus_adjustments',
    'arbitration_plan_allocations', 'weekly_projections', 'matchup_lineups',
    'fa_market', 'fa_auction_results', 'trade_assets']
  LOOP
    EXECUTE format(
      'UPDATE %1$I d SET player_id = p.keep_id FROM dup_pairs p
        WHERE d.player_id = p.drop_id', tbl);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      log := log || format(' | %s: repointed=%s', tbl, n);
    END IF;
  END LOOP;

  DELETE FROM players USING dup_pairs p WHERE players.id = p.drop_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  log := log || format(' | players deleted=%s', n);

  IF dry_run THEN
    RAISE EXCEPTION 'DRY RUN (rolled back): %', log;
  END IF;
  RAISE NOTICE 'APPLIED: %', log;
END $$;
