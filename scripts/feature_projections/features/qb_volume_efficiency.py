"""QB volume × regressed-efficiency base reconstruction (GH #667, L5).

QB is the worst position (highest MAE) and — in this Superflex league — the most
valuable, so a small QB gain beats a larger gain elsewhere in decision value. L5
is L1's "regress on expected, not realized" applied where it matters most and
done *fully*: reconstruct each QB season as

    stable_volume (attempts/game, kept realized) × heavily-regressed efficiency

where passing efficiency (YPA, TD-rate, INT-rate) and rushing efficiency (YPC,
rush-TD-rate) are each shrunk toward the QB population mean with strength
proportional to volume (``att / (att + β)``). Volume — pass and designed-rush
attempts per game — is the stable, year-to-year-predictable part of QB scoring;
efficiency (especially TD rate) is the noise that regresses hard. Stripping that
noise *before* the recency-weighted base sees it is the thing same-season-MAE
experiments (#640 QB volume features, L1 TD-only xFP) could not capture.

Implementation mirrors ``WeightedXFPTunedNoQBFeature``: only the **per-season
PPG** fed into the (inherited) recency-weighting machinery changes, and **only
for QB** — every other position falls straight through to the tuned base, so this
is a clean QB-only base swap. A QB season below ``MIN_ATTEMPTS`` (a
backup/cameo) or with no matching nfl_stats row keeps its realized PPG.
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.config import SCORING_SETTINGS
from scripts.feature_projections.features.weighted_ppg import WeightedPPGTunedNoQBFeature


# QB population efficiency rates, computed offline from 2018–2025 nfl_stats over
# starter-ish seasons (≥100 pass attempts) — the embedded-constant pattern used
# elsewhere (ROOKIE_GROWTH_CURVES, TD_RATE_PRIORS).
QB_POP = {
    "ypa": 7.1495,          # passing yards / attempt
    "pass_td_rate": 0.04507,  # passing TDs / attempt
    "int_rate": 0.02238,      # interceptions / attempt
    "rush_ypc": 4.4861,       # rushing yards / carry
    "rush_td_rate": 0.04871,  # rushing TDs / carry
}

# Empirical-Bayes prior strength (in attempts) for the efficiency shrink. A
# full-time passing season (~550 att) lands near a 0.5 self-weight; a rushing
# QB's carries (~90/season) likewise. Deliberately heavy — efficiency is the
# noisy half of QB scoring, and the recency base already blends across seasons.
BETA_PASS = 550.0
BETA_RUSH = 90.0

MIN_ATTEMPTS = 50  # below this a QB-season is a backup/cameo — keep realized PPG

_PASS_YD = SCORING_SETTINGS["passing_yards"]
_PASS_TD = SCORING_SETTINGS["passing_tds"]
_INT = SCORING_SETTINGS["interceptions"]
_RUSH_YD = SCORING_SETTINGS["rushing_yards"]
_RUSH_TD = SCORING_SETTINGS["rushing_tds"]


def _shrink(player_rate: float, opp: float, beta: float, pop_rate: float) -> float:
    """Volume-weighted shrink of a per-opportunity rate toward the population rate."""
    if opp <= 0:
        return pop_rate
    w = opp / (opp + beta)
    return w * player_rate + (1.0 - w) * pop_rate


class WeightedQBVolumeEfficiencyFeature(WeightedPPGTunedNoQBFeature):
    """Tuned base, but QB seasons are reconstructed as volume × regressed efficiency."""

    @property
    def name(self) -> str:
        return "weighted_qb_volume_efficiency"

    @property
    def is_base(self) -> bool:
        return True

    @staticmethod
    def _xqb_ppg(nfl: pd.Series, games: float) -> Optional[float]:
        """Reconstructed expected QB PPG for one season; None if too little volume."""
        pass_att = float(nfl.get("passing_attempts") or 0)
        rush_att = float(nfl.get("rushing_attempts") or 0)
        if pass_att < MIN_ATTEMPTS or games <= 0:
            return None

        ypa = _shrink(float(nfl.get("passing_yards") or 0) / pass_att, pass_att, BETA_PASS, QB_POP["ypa"])
        ptd = _shrink(float(nfl.get("passing_tds") or 0) / pass_att, pass_att, BETA_PASS, QB_POP["pass_td_rate"])
        intr = _shrink(float(nfl.get("interceptions") or 0) / pass_att, pass_att, BETA_PASS, QB_POP["int_rate"])
        pass_pts = pass_att * (ypa * _PASS_YD + ptd * _PASS_TD + intr * _INT)

        rush_pts = 0.0
        if rush_att > 0:
            rypc = _shrink(float(nfl.get("rushing_yards") or 0) / rush_att, rush_att, BETA_RUSH, QB_POP["rush_ypc"])
            rtd = _shrink(float(nfl.get("rushing_tds") or 0) / rush_att, rush_att, BETA_RUSH, QB_POP["rush_td_rate"])
            rush_pts = rush_att * (rypc * _RUSH_YD + rtd * _RUSH_TD)

        return (pass_pts + rush_pts) / games

    def _qb_adjust(self, history_df: pd.DataFrame, nfl_stats_df: pd.DataFrame) -> pd.DataFrame:
        """Return history_df with QB `ppg` replaced by the reconstructed expected PPG."""
        if history_df.empty or nfl_stats_df is None or nfl_stats_df.empty:
            return history_df
        nfl_by_season = {
            int(r["season"]): r
            for _, r in nfl_stats_df.iterrows()
            if pd.notna(r.get("season"))
        }
        out = history_df.copy()
        new_ppg = []
        for _, row in out.iterrows():
            nfl = nfl_by_season.get(int(row["season"])) if pd.notna(row.get("season")) else None
            games = float(row.get("games_played") or 0)
            recon = self._xqb_ppg(nfl, games) if nfl is not None else None
            new_ppg.append(recon if recon is not None else row.get("ppg"))
        out["ppg"] = new_ppg
        return out

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        if position == "QB":
            history_df = self._qb_adjust(history_df, nfl_stats_df)
        return super().compute(player_id, position, history_df, nfl_stats_df, context)
