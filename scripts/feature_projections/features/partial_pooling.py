"""Empirical-Bayes partial-pooling feature (GH #667, L3).

Replaces the fixed-factor ``regression_to_mean`` shrinkage with **sample-size-
scaled** partial pooling. ``regression_to_mean`` pulls every player toward the
positional mean by the same constant factor (0.12) regardless of how much data
underlies their estimate — so a 3-game fluke season and a 16-game career are
shrunk identically, which is the wrong thing on each side of the mean (the
lessons-learned critique behind this lever).

Partial pooling instead shrinks each player toward a prior ``μ_g`` with strength
that scales to the player's **observed sample size** ``n_p`` (here: effective
full-season-equivalents of games played across their history window):

    μ_p   = w_p · base_ppg + (1 − w_p) · μ_g,   w_p = n_p / (n_p + k)
    delta = μ_p − base_ppg = (1 − w_p) · (μ_g − base_ppg)
          = ( k / (n_p + k) ) · (μ_g − base_ppg)

A 16-game workhorse (n_p ≈ 1 full season per year of history) keeps most of its
own estimate; a 3-game player (n_p ≈ 0.18) is pulled hard toward the prior. The
learned combiner still fits the coefficient on this delta, so ``k`` only sets the
*shape* of how trust grows with sample size — not the overall magnitude.

This v1 uses the positional mean as the prior (identical to ``regression_to_mean``,
to isolate the sample-size-scaling change) and a single global ``k`` of one
effective full season. A hierarchical prior (position → position×age → role) and
a per-position / per-fold-estimated ``k`` — plus the posterior P10/P50/P90 that
falls out of this formulation — are the scoped follow-ups (see
docs/exec-plans/structural-projection-levers-667.md).
"""

from __future__ import annotations

from typing import Any, Optional

import pandas as pd

from scripts.feature_projections.features.base import ProjectionFeature


class PartialPoolingFeature(ProjectionFeature):
    """Sample-size-scaled shrinkage toward the positional mean (empirical Bayes)."""

    # Prior strength k, in effective-full-season units: a player with one full
    # season of history (n_p ≈ 1) lands at w_p = 0.5 (pulled halfway), a three-
    # full-season vet (n_p ≈ 3) at w_p = 0.75 (pulled a quarter), a 3-game sample
    # (n_p ≈ 0.18) at w_p ≈ 0.15 (pulled ~85% toward the prior). One full season
    # ≈ the population prior in evidentiary weight — an interpretable neutral
    # default, not a per-position eyeballed knob.
    PRIOR_STRENGTH = 1.0

    # Full NFL season length, for converting games played into season-equivalents.
    FULL_SEASON_GAMES = 17.0

    @property
    def name(self) -> str:
        return "partial_pooling"

    def _effective_seasons(self, history_df: pd.DataFrame) -> float:
        """Sum games-played/17 across the history window — the player's n_p.

        Total full-season-equivalents of data, the natural "how much do we trust
        this estimate" quantity (unlike the recency weighting in the base, which
        governs *what* the estimate is). Games are capped at a full season so a
        17-game year never counts as more than 1.0.
        """
        if history_df.empty or "games_played" not in history_df.columns:
            return 0.0
        games = pd.to_numeric(history_df["games_played"], errors="coerce").fillna(0.0)
        games = games.clip(upper=self.FULL_SEASON_GAMES)
        return float((games / self.FULL_SEASON_GAMES).sum())

    def compute(
        self,
        player_id: str,
        position: str,
        history_df: pd.DataFrame,
        nfl_stats_df: pd.DataFrame,
        context: dict[str, Any],
    ) -> Optional[float]:
        base_ppg = context.get("base_ppg")
        positional_mean_ppg = context.get("positional_mean_ppg")

        if base_ppg is None or positional_mean_ppg is None:
            return None

        n_p = self._effective_seasons(history_df)
        k = self._pooling_strength(context)
        # Shrinkage weight on the prior = (1 − w_p) = k / (n_p + k); n_p = 0 ⇒ full
        # shrink to the prior, large n_p ⇒ negligible shrink.
        shrink = k / (n_p + k)
        return (positional_mean_ppg - base_ppg) * shrink

    def _pooling_strength(self, context: dict[str, Any]) -> float:
        """Prior strength k. Base feature uses the fixed global default."""
        return self.PRIOR_STRENGTH


class PartialPoolingEBFeature(PartialPoolingFeature):
    """Partial pooling with a per-position, empirically-estimated k (GH #667, L3).

    Identical to ``PartialPoolingFeature`` except the pooling strength is read
    from ``context["pooling_k"]`` — the method-of-moments estimate
    ``k_g = σ²_g / τ²_g`` computed per position from the training population by
    ``runner._compute_pooling_k`` (leakage-free; re-estimated per held-out fold).
    This makes the shrinkage curve genuinely *empirical* Bayes rather than the
    hand-set global ``k=1`` of the parent. Falls back to the parent default when
    the context key is absent (e.g. a thin fold that couldn't estimate k).
    """

    @property
    def name(self) -> str:
        return "partial_pooling_eb"

    def _pooling_strength(self, context: dict[str, Any]) -> float:
        k = context.get("pooling_k")
        return float(k) if k is not None else self.PRIOR_STRENGTH
