"""Model definitions for the feature projection system.

Each model specifies which features to use and their weights.
Models are defined here and registered in the database by the runner.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PositionOverride:
    """Per-position feature override for a model."""

    features: list[str]
    weights: dict[str, float] = field(default_factory=dict)


@dataclass
class ModelDefinition:
    """Definition of a projection model."""

    name: str
    version: int
    description: str
    features: list[str]
    weights: dict[str, float] = field(default_factory=dict)
    is_baseline: bool = False
    position_overrides: dict[str, PositionOverride] = field(default_factory=dict)
    combiner_type: str = "additive"  # "additive" | "learned" | "residual"
    interaction_terms: list[str] = field(default_factory=list)
    # Residual combiner — leaves base model untouched and adds a learned delta.
    # `base_model_name` names a pre-trained model whose JSON we load and call
    # for the base prediction. `features` and `interaction_terms` describe the
    # tiny secondary Ridge model trained on (actual − base_pred), which is
    # fit with fit_intercept=False so vets (whose feature values are zero)
    # receive a residual contribution of exactly zero — and therefore the
    # base model's prediction byte-for-byte. `training_filter` restricts the
    # residual training set; max_seasons_since_draft=3 keeps the residual
    # focused on rookies/sophs/3rd-year players.
    base_model_name: str | None = None
    training_filter: dict[str, int] = field(default_factory=dict)


# === Model Definitions ===

MODELS: dict[str, ModelDefinition] = {
    "v1_baseline_weighted_ppg": ModelDefinition(
        name="v1_baseline_weighted_ppg",
        version=1,
        description="Exact port of existing WeightedAveragePPG + RookieTrajectoryPPG. Control baseline.",
        features=["weighted_ppg"],
        is_baseline=True,
    ),
    "v2_age_adjusted": ModelDefinition(
        name="v2_age_adjusted",
        version=1,
        description="Baseline + positional age curve adjustment.",
        features=["weighted_ppg", "age_curve"],
    ),
    "v3_stat_weighted": ModelDefinition(
        name="v3_stat_weighted",
        version=1,
        description="Age-adjusted + per-stat efficiency projection from nfl_stats.",
        features=["weighted_ppg", "age_curve", "stat_efficiency"],
    ),
    "v4_availability_adjusted": ModelDefinition(
        name="v4_availability_adjusted",
        version=1,
        description="Stat-weighted + games-played availability adjustment.",
        features=["weighted_ppg", "age_curve", "stat_efficiency", "games_played"],
    ),
    "v5_team_context": ModelDefinition(
        name="v5_team_context",
        version=1,
        description="Availability-adjusted + team offensive quality adjustment.",
        features=["weighted_ppg", "age_curve", "stat_efficiency", "games_played", "team_context"],
    ),
    "v6_usage_share": ModelDefinition(
        name="v6_usage_share",
        version=1,
        description="Team context + target/touch/attempt share projection.",
        features=[
            "weighted_ppg",
            "age_curve",
            "stat_efficiency",
            "games_played",
            "team_context",
            "usage_share",
        ],
    ),
    "v7_regression_to_mean": ModelDefinition(
        name="v7_regression_to_mean",
        version=1,
        description="Usage-share model + regression toward positional mean PPG.",
        features=[
            "weighted_ppg",
            "age_curve",
            "stat_efficiency",
            "games_played",
            "team_context",
            "usage_share",
            "regression_to_mean",
        ],
    ),
    "v8_age_regression": ModelDefinition(
        name="v8_age_regression",
        version=1,
        description="Optimal feature combo from exhaustive sweep: base + age curve + regression to mean.",
        features=["weighted_ppg", "age_curve", "regression_to_mean"],
    ),
    "v9_pos_specific": ModelDefinition(
        name="v9_pos_specific",
        version=1,
        description=(
            "Data-driven per-position sweep confirms v8's uniform feature set "
            "(age_curve + regression_to_mean) is optimal for all positions. "
            "No position overrides needed."
        ),
        features=["weighted_ppg", "age_curve", "regression_to_mean"],
        position_overrides={},
    ),
    "v10_stat_efficiency_v2": ModelDefinition(
        name="v10_stat_efficiency_v2",
        version=1,
        description="v8 (age_curve + regression_to_mean) + rewritten stat_efficiency v2 with rate-based efficiency deltas.",
        features=["weighted_ppg", "age_curve", "regression_to_mean", "stat_efficiency"],
    ),
    "v11_team_context_v2": ModelDefinition(
        name="v11_team_context_v2",
        version=1,
        description=(
            "v8 (age_curve + regression_to_mean) + fixed team_context v2: "
            "position-specific scaling (0.02-0.05), kicker exclusion, "
            "historical team tracking, team-change dampening."
        ),
        features=["weighted_ppg", "age_curve", "regression_to_mean", "team_context"],
    ),
    "v12_no_qb_trajectory": ModelDefinition(
        name="v12_no_qb_trajectory",
        version=1,
        description=(
            "v8 (age_curve + regression_to_mean) with snap trajectory disabled for QB and K. "
            "First-year QBs and Ks use raw season PPG instead of H2/H1 snap multiplier, "
            "since a starting QB's snap share reflects mid-season role change, not future signal."
        ),
        features=["weighted_ppg_no_qb_trajectory", "age_curve", "regression_to_mean"],
    ),
    "v13_qb_starter": ModelDefinition(
        name="v13_qb_starter",
        version=1,
        description=(
            "v8 + QB starter volume trend (scaling=0.3, clamp=±15%). "
            "Superseded by v14 — volume trend tuning added only noise."
        ),
        features=["weighted_ppg", "age_curve", "regression_to_mean", "qb_starter_usage"],
    ),
    "v14_qb_starter": ModelDefinition(
        name="v14_qb_starter",
        version=1,
        description=(
            "v12 (no_qb_trajectory) + backup QB penalty. Uses manual QB starter "
            "designations to apply a 15% PPG penalty to non-starter QBs, deflating "
            "small-sample heroics from backup stints. Starters are unaffected. "
            "Best combined model: ALL MAE 2.515, QB MAE 3.801, QB R² 0.344."
        ),
        features=["weighted_ppg_no_qb_trajectory", "age_curve", "regression_to_mean", "qb_backup_penalty"],
    ),
    "v15_snap_trend": ModelDefinition(
        name="v15_snap_trend",
        version=1,
        description=(
            "v2 (weighted_ppg + age_curve) + snap count trajectory adjustment. "
            "Tests whether snap trend adds value over base age-adjusted model."
        ),
        features=["weighted_ppg", "age_curve", "snap_trend"],
    ),
    "v16_snap_trend_full": ModelDefinition(
        name="v16_snap_trend_full",
        version=1,
        description=(
            "v14 (current best) + snap count trajectory adjustment. "
            "Tests whether snap trend improves the best combined model."
        ),
        features=[
            "weighted_ppg_no_qb_trajectory",
            "age_curve",
            "regression_to_mean",
            "qb_backup_penalty",
            "snap_trend",
        ],
    ),
    "v17_rookie_growth": ModelDefinition(
        name="v17_rookie_growth",
        version=1,
        description=(
            "v14 + position-specific rookie growth curves and small-sample blending. "
            "Small-sample rookies (<4 games) blend PPG toward positional rookie mean. "
            "Dampened growth delta applied only when snap trajectory data is absent. "
            "Neutral to v14 overall (ALL MAE 2.516 vs 2.515); WR MAE slightly improved."
        ),
        features=["weighted_ppg_rookie_growth_no_qb", "age_curve", "regression_to_mean", "qb_backup_penalty"],
    ),
    "v18_usage_level": ModelDefinition(
        name="v18_usage_level",
        version=1,
        description=(
            "v2 (weighted_ppg + age_curve) + rewritten usage_share v2: share level "
            "(not trend) as role stability signal. Isolated test of the new feature. "
            "GH #285."
        ),
        features=["weighted_ppg", "age_curve", "usage_share"],
    ),
    "v19_usage_level_full": ModelDefinition(
        name="v19_usage_level_full",
        version=1,
        description=(
            "v14 (current best) + rewritten usage_share v2: share level as role "
            "stability signal. Integration test — must not degrade v14. GH #285."
        ),
        features=[
            "weighted_ppg_no_qb_trajectory",
            "age_curve",
            "regression_to_mean",
            "qb_backup_penalty",
            "usage_share",
        ],
    ),
    "v20_learned_usage": ModelDefinition(
        name="v20_learned_usage",
        version=1,
        description=(
            "Ridge regression with raw usage share and interaction terms. "
            "Learns optimal nonlinear mapping from share → PPG adjustment "
            "including share × position and share × base_ppg interactions. "
            "GH #367."
        ),
        features=[
            "weighted_ppg_no_qb_trajectory",
            "age_curve",
            "regression_to_mean",
            "qb_backup_penalty",
            "usage_share_raw",
        ],
        combiner_type="learned",
        interaction_terms=[
            "usage_share_raw*position",
            "usage_share_raw*base_ppg",
            "usage_share_raw^2",
        ],
    ),
    "v21_tiered_regression": ModelDefinition(
        name="v21_tiered_regression",
        version=1,
        description=(
            "v14 with tiered regression: three-zone factors — standard "
            "(0.12) above mean, mild downward (-0.05) floor-to-mean, "
            "strong downward (-0.20) below floor. Reduces bench-tier "
            "over-projection bias from -1.27 to -0.87. GH #304."
        ),
        features=[
            "weighted_ppg_no_qb_trajectory",
            "age_curve",
            "regression_to_mean_tiered",
            "qb_backup_penalty",
        ],
    ),
    "v22_advanced_receiving": ModelDefinition(
        name="v22_advanced_receiving",
        version=1,
        description=(
            "v20 (learned ridge w/ usage_share_raw) + advanced receiving metrics "
            "from nflverse: target_share, air_yards_share, wopr, racr. WR/TE only. "
            "Captures opportunity independent of efficiency — the strongest WR/TE "
            "volume signal. Interaction terms target_share*position and "
            "wopr*base_ppg let the learned combiner find position-specific "
            "and volume-conditional effects. GH #375."
        ),
        features=[
            "weighted_ppg_no_qb_trajectory",
            "age_curve",
            "regression_to_mean",
            "qb_backup_penalty",
            "usage_share_raw",
            "target_share_raw",
            "air_yards_share_raw",
            "wopr_raw",
            "racr_raw",
        ],
        combiner_type="learned",
        interaction_terms=[
            "usage_share_raw*position",
            "usage_share_raw*base_ppg",
            "usage_share_raw^2",
            "target_share_raw*position",
            "wopr_raw*base_ppg",
            "wopr_raw^2",
        ],
    ),
    "v23_draft_capital": ModelDefinition(
        name="v23_draft_capital",
        version=1,
        description=(
            "v22 (advanced receiving learned ridge) + draft_capital_raw: "
            "log-scaled overall pick for players in their first three NFL "
            "seasons, 0 for veterans. Injects pre-NFL signal that age_curve "
            "and regression_to_mean cannot capture for rookies/sophomores. "
            "Interaction term draft_capital_raw*position lets the learned "
            "combiner find position-specific effects (e.g. RB vs WR rookies). "
            "GH #376."
        ),
        features=[
            "weighted_ppg_no_qb_trajectory",
            "age_curve",
            "regression_to_mean",
            "qb_backup_penalty",
            "usage_share_raw",
            "target_share_raw",
            "air_yards_share_raw",
            "wopr_raw",
            "racr_raw",
            "draft_capital_raw",
        ],
        combiner_type="learned",
        interaction_terms=[
            "usage_share_raw*position",
            "usage_share_raw*base_ppg",
            "usage_share_raw^2",
            "target_share_raw*position",
            "wopr_raw*base_ppg",
            "wopr_raw^2",
            "draft_capital_raw*position",
        ],
    ),
    "v25_draft_capital_residual": ModelDefinition(
        name="v25_draft_capital_residual",
        version=1,
        description=(
            "Two-stage residual model: v22 (advanced receiving learned ridge) "
            "as the unchanged base, plus a tiny secondary Ridge on "
            "draft_capital_raw + draft_capital_raw*position fit to v22 "
            "residuals on rookie/sophomore/3rd-year samples only "
            "(seasons_since_draft <= 3). Fit with fit_intercept=False so "
            "veterans (whose feature value is 0) receive an exactly-zero "
            "residual contribution — their predictions are byte-identical "
            "to v22. Designed to deliver the rookie/soph lift v23 produced "
            "without v23's collateral veteran regression. GH #376 follow-up."
        ),
        features=["draft_capital_raw"],
        combiner_type="residual",
        base_model_name="v22_advanced_receiving",
        interaction_terms=["draft_capital_raw*position"],
        training_filter={"max_seasons_since_draft": 3},
    ),
    "external_fantasypros_v1": ModelDefinition(
        name="external_fantasypros_v1",
        version=1,
        description="FantasyPros consensus seasonal projections (stat-line → Ottoneu Half-PPR PPG)",
        features=["external"],
        is_baseline=False,
    ),
}


def get_model(name: str) -> ModelDefinition:
    """Look up a model definition by name."""
    if name not in MODELS:
        available = ", ".join(sorted(MODELS.keys()))
        raise ValueError(f"Unknown model '{name}'. Available: {available}")
    return MODELS[name]
