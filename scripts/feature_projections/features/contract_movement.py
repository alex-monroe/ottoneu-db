"""Contract-movement features — offseason role-securing signal (spike #651, #3).

A player who signs a new (especially large) deal has a more secure / larger
role than his stale PPG history shows — the "ascending role" case the coarse
depth tier misses. Contract value is a **non-market-projection** proxy for how a
team values a player (it prices the team's own role expectation, not a fantasy
consensus), so it clears the spike's hard constraint. Free agency opens mid-March
and the bulk of deals land March–April, before the offseason projection run, so
a deal signed in the target offseason is leakage-free w.r.t. that season.

Both features read the player's own contract for the *target* season from
``contracts_by_player_year`` (OTC ``year_signed``-dated history, so point-in-time
clean):

- ``new_contract_value_raw``: OTC "APY as % of cap at signing" (cap-inflation
  normalized, comparable across years) of a deal the player signed in the target
  offseason; exactly 0.0 when he signed no new tracked deal that offseason. Dense
  and 0 for the majority each year → **residual-safe**: in a fit_intercept=False
  two-stage residual the no-new-deal players get a byte-identical base prediction
  (mirrors draft_capital #376 / coaching_change #651). Carries magnitude, so it
  subsumes the binary event below.
- ``contract_signed_raw``: 1.0 if the player signed any new deal in the target
  offseason, else 0.0 — the pure event, for a learned model / ablation.
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


def _new_contract(context: dict[str, Any], player_id: str) -> Optional[dict]:
    """The player's contract signed in the target offseason, if any."""
    target_season = context.get("target_season")
    contracts: dict = context.get("contracts_by_player_year", {})
    if target_season is None or not contracts:
        return None
    return contracts.get((player_id, int(target_season)))


class NewContractValueFeature(ProjectionFeature):
    """APY-%-of-cap of a deal signed this offseason (0.0 if none) — role magnitude."""

    @property
    def name(self) -> str:
        return "new_contract_value_raw"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        if context.get("target_season") is None:
            return None
        # No tracked new deal this offseason → exactly 0.0 (residual-safe).
        if not context.get("contracts_by_player_year"):
            return None
        record = _new_contract(context, player_id)
        if record is None:
            return 0.0
        pct = record.get("apy_cap_pct")
        return 0.0 if pct is None else float(pct)


class ContractSignedFeature(ProjectionFeature):
    """Binary: did the player sign a new deal this offseason?"""

    @property
    def name(self) -> str:
        return "contract_signed_raw"

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        if context.get("target_season") is None:
            return None
        if not context.get("contracts_by_player_year"):
            return None
        return 1.0 if _new_contract(context, player_id) is not None else 0.0
