"""The /value dollar market, ported from web/lib/{vorp,replacement,surplus}.ts.

A season's pool of per-game values → lineup-derived replacement level per
position → value over replacement → a share of the league's distributable cap
(12 × $400 − 240 roster spots × $1 = $4,560). Kickers sit outside it, as on
/value. Keep this in step with the TypeScript: ``test_keeper_value.py`` pins the
same worked examples.

One difference is deliberate. /value floors every dollar value at the $1
roster-spot price; here ``latent_dollars`` keeps the unfloored number, which can
be negative (a below-replacement season). The keeper model works on that latent
scale and floors at the end, so "how far below replacement" still informs the
fit while every keepable outcome is priced exactly as /value prices it.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from scripts.config import (
    BENCH_DEPTH_PER_TEAM,
    CAP_PER_TEAM,
    FLEX_POSITIONS,
    FLEX_SLOTS,
    MIN_GAMES,
    MIN_PLAYER_SALARY,
    NUM_TEAMS,
    ROSTER_SPOTS,
    STARTING_LINEUP,
)


def distributable_cap() -> float:
    """League cap minus the salary floor every roster spot commits."""
    return NUM_TEAMS * CAP_PER_TEAM - NUM_TEAMS * ROSTER_SPOTS * MIN_PLAYER_SALARY


def replacement_levels(values_by_position: Mapping[str, Sequence[float]]) -> dict[str, float]:
    """Value of the last player expected to start anywhere, per position.

    Same greedy allocation as ``allocateLineupDemand``: fixed starters first,
    then each flex + bench-depth slot goes to whichever position's next player
    is best.
    """
    ordered = {pos: sorted(vals, reverse=True) for pos, vals in values_by_position.items()}
    demand = {pos: per_team * NUM_TEAMS for pos, per_team in STARTING_LINEUP.items() if pos in ordered}
    eligible = [pos for pos in FLEX_POSITIONS if pos in ordered]
    remaining = (FLEX_SLOTS + BENCH_DEPTH_PER_TEAM) * NUM_TEAMS
    while remaining > 0:
        best_pos, best_val = None, float("-inf")
        for pos in eligible:
            i = demand.get(pos, 0)
            if i < len(ordered[pos]) and ordered[pos][i] > best_val:
                best_pos, best_val = pos, ordered[pos][i]
        if best_pos is None:
            break
        demand[best_pos] = demand.get(best_pos, 0) + 1
        remaining -= 1
    levels = {}
    for pos, vals in ordered.items():
        if not vals:
            levels[pos] = 0.0
            continue
        rank = min(max(demand.get(pos, 0), 1), len(vals))
        levels[pos] = vals[rank - 1]
    return levels


class Market:
    """One season's price of production.

    Built from a pool of ``(position, per_game_value, games)``. Only players
    with at least ``min(MIN_GAMES, deepest games in pool)`` games set the
    replacement level and the $/point rate — the same qualification as
    ``calculateVorp`` — but any per-game value can then be priced.
    """

    def __init__(self, pool: Sequence[tuple[str, float, int]]):
        deepest = max((g for _, _, g in pool), default=0)
        floor = min(MIN_GAMES, deepest) if deepest > 0 else MIN_GAMES
        by_pos: dict[str, list[float]] = {}
        for pos, value, games in pool:
            if pos == "K" or games < floor:
                continue
            by_pos.setdefault(pos, []).append(value)
        self.replacement = replacement_levels(by_pos)
        positive = sum(
            max(0.0, v - self.replacement[pos]) for pos, vals in by_pos.items() for v in vals
        )
        self.rate = distributable_cap() / positive if positive > 0 else 0.0

    def latent_dollars(self, position: str, per_game_value: float) -> float:
        """$1 + share of the cap for the value over replacement; may be < $1."""
        rep = self.replacement.get(position, 0.0)
        return MIN_PLAYER_SALARY + (per_game_value - rep) * self.rate

    def dollars(self, position: str, per_game_value: float) -> float:
        """The /value dollar value: latent dollars floored at the $1 roster spot."""
        return max(float(MIN_PLAYER_SALARY), self.latent_dollars(position, per_game_value))
