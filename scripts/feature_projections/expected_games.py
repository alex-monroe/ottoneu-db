"""Expected-games (availability) estimation for the availability-inclusive
backtest (GH #587, stage a).

The availability-inclusive backtest (`availability_backtest.py`, #574) exposes a
large over-projection bias: a pure-rate PPG projection scores against
`ppg × games/17`, so every game a player misses is unmodeled error (v14:
+0.589 availability budget, −1.95 avail bias). This module supplies the simplest
fix the #587 review asked for first — a **constant expected-games haircut** that
converts a rate projection into an availability-inclusive one,
`pred_avail = pred × min(E[games], 17) / 17`, to *set the bar* before any learned
expected-games model.

Two modes:

- ``constant`` — ``E[games]`` is the per-position mean ``games_played`` over all
  prior seasons (strictly before the target season — leakage-free).
- ``history`` — the player's own recency-weighted mean games over their prior
  seasons, falling back to the position constant when the player has no prior
  games on record.

All estimates use only seasons *strictly before* the target season, so applying
them to a backtest target is leakage-free by construction.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

FULL_SEASON_GAMES = 17

# Most-recent-first recency weights for the player-history mode (up to 3 seasons).
RECENCY_WEIGHTS = [0.6, 0.3, 0.1]

# Thin-history guard (#587 c2 review). A player's own recency-weighted games are
# the best *average* availability predictor, but for players without an
# established multi-season track record a low value usually reflects a *role
# ramp* (rookies/sophomores easing into a starting job) rather than injury
# proneness — so a pure-history haircut over-penalises ascending young players
# (e.g. a 2nd-year QB who started 9 games as a rookie is not a 9-game injury
# risk). We therefore floor the estimate for players with fewer than
# YOUNG_PLAYER_MAX_PRIOR_SEASONS prior *played* seasons at YOUNG_PLAYER_GAMES_FLOOR
# (≈70% of a season): they can still be discounted, just not below a reasonable
# starter floor until they've accrued a durability record. Established players
# (≥ the threshold) keep the full history discount, so chronic-injury vets are
# unaffected. This costs a little games-MAE accuracy (+~0.3) on the thin-history
# cohort in exchange for not mis-valuing ascending players.
YOUNG_PLAYER_MAX_PRIOR_SEASONS = 3
YOUNG_PLAYER_GAMES_FLOOR = 12.0

MODES = ("none", "constant", "history")


def _positional_constants(
    rows_before: List[dict], pos_map: Dict[str, str]
) -> Dict[str, float]:
    """Per-position mean games_played over the supplied (prior-season) rows.

    Only counts player-seasons with at least one game so injured-out / inactive
    rows don't drag the mean to zero for players who were genuinely on a roster.
    """
    sums: Dict[str, float] = {}
    counts: Dict[str, int] = {}
    for r in rows_before:
        games = int(r.get("games_played", 0) or 0)
        if games < 1:
            continue
        pos = pos_map.get(r["player_id"])
        if pos is None:
            continue
        sums[pos] = sums.get(pos, 0.0) + min(games, FULL_SEASON_GAMES)
        counts[pos] = counts.get(pos, 0) + 1
    return {pos: sums[pos] / counts[pos] for pos in sums if counts[pos] > 0}


def _player_recency_games(
    player_rows_before: List[dict],
) -> Optional[float]:
    """Recency-weighted mean games over a player's prior *played* seasons (most
    recent weighted highest). Seasons with 0 games are skipped (a missed year is
    not evidence the player will miss the next one — defer to the position
    constant instead). Returns None when the player has no prior played season.
    """
    seasons = sorted(
        (r for r in player_rows_before if int(r.get("games_played", 0) or 0) >= 1),
        key=lambda r: int(r["season"]),
        reverse=True,
    )
    recent = seasons[: len(RECENCY_WEIGHTS)]
    weighted = 0.0
    total_w = 0.0
    for w, r in zip(RECENCY_WEIGHTS, recent):
        games = min(int(r.get("games_played", 0) or 0), FULL_SEASON_GAMES)
        weighted += games * w
        total_w += w
    if total_w == 0:
        return None
    return weighted / total_w


def build_expected_games(
    all_stats: List[dict],
    pos_map: Dict[str, str],
    seasons: List[int],
    mode: str,
    full_season: int = FULL_SEASON_GAMES,
) -> Dict[Tuple[str, int], float]:
    """Leakage-free expected-games per (player_id, target_season).

    ``all_stats`` rows need ``player_id``, ``games_played`` and ``season``.
    Returns {} for ``mode == "none"`` (caller then uses unscaled rate predictions).
    The returned value is the expected number of games, capped at ``full_season``;
    callers scale a rate projection by ``E[games] / full_season``.
    """
    if mode == "none":
        return {}
    if mode not in MODES:
        raise ValueError(f"Unknown expected-games mode '{mode}'. Choices: {MODES}")

    out: Dict[Tuple[str, int], float] = {}
    for target_season in seasons:
        rows_before = [
            r
            for r in all_stats
            if r.get("season") is not None and int(r["season"]) < int(target_season)
        ]
        pos_constants = _positional_constants(rows_before, pos_map)
        if not pos_constants:
            continue

        # Players to estimate for: anyone with a prior-season row (the backtest's
        # actuals are restricted to non-rookies anyway, so this is a superset).
        player_ids = {r["player_id"] for r in rows_before}
        by_player: Dict[str, List[dict]] = {}
        if mode == "history":
            for r in rows_before:
                by_player.setdefault(r["player_id"], []).append(r)

        for pid in player_ids:
            pos = pos_map.get(pid)
            constant = pos_constants.get(pos)
            if constant is None:
                continue
            if mode == "constant":
                eg = constant
            else:  # history
                player_rows = by_player.get(pid, [])
                player_eg = _player_recency_games(player_rows)
                if player_eg is None:
                    eg = constant
                else:
                    eg = player_eg
                    # Thin-history guard: floor ascending young players (few prior
                    # played seasons) so a role-ramp history isn't read as injury
                    # risk. Established players keep the full history discount.
                    n_played = sum(
                        1 for r in player_rows if int(r.get("games_played", 0) or 0) >= 1
                    )
                    if n_played < YOUNG_PLAYER_MAX_PRIOR_SEASONS:
                        eg = max(eg, YOUNG_PLAYER_GAMES_FLOOR)
            out[(pid, int(target_season))] = min(eg, float(full_season))
    return out
