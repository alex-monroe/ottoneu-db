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
    # focused on rookies/sophs/3rd-year players, and positions=["QB"] fits
    # (and applies) the residual only for those positions (GH #592).
    base_model_name: str | None = None
    training_filter: dict = field(default_factory=dict)


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
    "v26_vegas_residual": ModelDefinition(
        name="v26_vegas_residual",
        version=1,
        description=(
            "Stacked residual: v25 (v22 + draft_capital residual) as the "
            "frozen base, plus a tiny secondary Ridge on "
            "implied_team_total_raw + implied_team_total_raw*position fit "
            "to v25 residuals across all players (no training filter — "
            "Vegas signal is informative for every position). Fit with "
            "fit_intercept=False so a player on a league-average team "
            "(centered implied total ≈ 0) receives an exactly-zero residual "
            "contribution. Designed to add the market-efficient team "
            "scoring signal without disturbing v25's veteran-stable "
            "predictions. Replaces the broken team_context feature. "
            "GH #378."
        ),
        features=["implied_team_total_raw"],
        combiner_type="residual",
        base_model_name="v25_draft_capital_residual",
        interaction_terms=["implied_team_total_raw*position"],
        training_filter={},
    ),
    "v27_vegas_full_refit": ModelDefinition(
        name="v27_vegas_full_refit",
        version=1,
        description=(
            "Full Ridge refit on v23's feature set (usage + advanced "
            "receiving + draft_capital) plus implied_team_total_raw, with "
            "interaction terms for position-conditional Vegas effects. "
            "Tests whether jointly fitting all signals captures interactions "
            "the residual stack misses, at the risk of v23-style coefficient "
            "drift on veterans. GH #378."
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
            "implied_team_total_raw",
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
            "implied_team_total_raw*position",
        ],
    ),
    "v28_reliability_weighting": ModelDefinition(
        name="v28_reliability_weighting",
        version=1,
        description=(
            "v22 (advanced receiving learned ridge) with the base feature swapped "
            "from weighted_ppg_no_qb_trajectory to weighted_ppg_reliability_no_qb: "
            "the per-season games-played reliability factor uses exponent 1.5 "
            "instead of linear 1.0, so a recent low-games season is down-weighted "
            "more aggressively relative to an older full season. Isolated A/B vs "
            "v22 — only the base feature's small-sample handling differs. "
            "Addresses the concern that a 3-game recent season carries less signal "
            "than a 17-game season two years prior."
        ),
        features=[
            "weighted_ppg_reliability_no_qb",
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
    "v29_reliability_residual": ModelDefinition(
        name="v29_reliability_residual",
        version=1,
        description=(
            "v25's residual stack rebuilt on the reliability base: "
            "v28_reliability_weighting (v22 with the steeper games-played "
            "reliability exponent) frozen as the base, plus the same tiny "
            "draft_capital_raw + draft_capital_raw*position residual fit to "
            "v28 residuals on rookie/soph/3rd-year samples (seasons_since_draft "
            "<= 3, fit_intercept=False). Folds the low-games down-weighting "
            "into the active v25 architecture. GH #553 follow-up."
        ),
        features=["draft_capital_raw"],
        combiner_type="residual",
        base_model_name="v28_reliability_weighting",
        interaction_terms=["draft_capital_raw*position"],
        training_filter={"max_seasons_since_draft": 3},
    ),
    "v30_reliability_full_refit": ModelDefinition(
        name="v30_reliability_full_refit",
        version=1,
        description=(
            "v27's full Ridge refit (advanced receiving + draft_capital + "
            "Vegas implied team total) with the base feature swapped from "
            "weighted_ppg_no_qb_trajectory to weighted_ppg_reliability_no_qb "
            "(games-played reliability exponent 1.5). Folds the low-games "
            "down-weighting into the best-performing model. GH #553 follow-up."
        ),
        features=[
            "weighted_ppg_reliability_no_qb",
            "age_curve",
            "regression_to_mean",
            "qb_backup_penalty",
            "usage_share_raw",
            "target_share_raw",
            "air_yards_share_raw",
            "wopr_raw",
            "racr_raw",
            "draft_capital_raw",
            "implied_team_total_raw",
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
            "implied_team_total_raw*position",
        ],
    ),
    "v31_depth_chart": ModelDefinition(
        name="v31_depth_chart",
        version=1,
        description=(
            "Full Ridge refit on v27's feature set (usage + advanced receiving "
            "+ draft_capital + Vegas implied team total) plus two opening-day "
            "depth-chart signals: depth_chart_position_raw (starter score "
            "2 - depth_team) and role_change_raw (year-over-year depth-tier "
            "change). Adds a depth_chart_position_raw*position interaction so "
            "the combiner can find position-specific role effects. Tests "
            "whether forward-looking role information — invisible to the 3-year "
            "weighted-PPG base — improves early-season accuracy and finally "
            "replaces the failed historical team_context feature. GH #391."
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
            "implied_team_total_raw",
            "depth_chart_position_raw",
            "role_change_raw",
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
            "implied_team_total_raw*position",
            "depth_chart_position_raw*position",
        ],
    ),
    "v32_pruned": ModelDefinition(
        name="v32_pruned",
        version=1,
        description=(
            "#588 honest feature ablation result: v31_depth_chart minus the five "
            "feature groups whose removal was not significant on the rolling "
            "held-out harness (age_curve, qb_backup_penalty, usage_share_raw, "
            "draft_capital_raw, implied_team_total_raw). Keeps the base, "
            "regression_to_mean, advanced receiving (significantly load-bearing "
            "at WR), and the depth-chart group (significantly load-bearing "
            "overall). 13→8 features, 9→4 interactions."
        ),
        features=[
            "weighted_ppg_no_qb_trajectory",
            "regression_to_mean",
            "target_share_raw",
            "air_yards_share_raw",
            "wopr_raw",
            "racr_raw",
            "depth_chart_position_raw",
            "role_change_raw",
        ],
        combiner_type="learned",
        interaction_terms=[
            "target_share_raw*position",
            "wopr_raw*base_ppg",
            "wopr_raw^2",
            "depth_chart_position_raw*position",
        ],
    ),
    "v33_tuned_base": ModelDefinition(
        name="v33_tuned_base",
        version=1,
        description=(
            "v31_depth_chart with the base feature swapped to "
            "weighted_ppg_tuned_no_qb: recency weights tuned on the inner "
            "folds (GH #589/#595) from [0.55, 0.25, 0.20] to "
            "[0.65, 0.20, 0.15] — heavier on the most recent season. The "
            "games-reliability exponent grid confirmed linear (1.0) is "
            "optimal. Everything else identical to v31."
        ),
        features=[
            "weighted_ppg_tuned_no_qb",
            "age_curve",
            "regression_to_mean",
            "qb_backup_penalty",
            "usage_share_raw",
            "target_share_raw",
            "air_yards_share_raw",
            "wopr_raw",
            "racr_raw",
            "draft_capital_raw",
            "implied_team_total_raw",
            "depth_chart_position_raw",
            "role_change_raw",
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
            "implied_team_total_raw*position",
            "depth_chart_position_raw*position",
        ],
    ),
    "v34_qb_residual": ModelDefinition(
        name="v34_qb_residual",
        version=1,
        description=(
            "QB-specific bounded bet (GH #592): v33_tuned_base frozen as the "
            "base, plus a tiny QB-only residual Ridge on the strongest "
            "QB signals — depth_chart_position_raw (the largest learned QB "
            "interaction), qb_backup_penalty (manual starter designations) "
            "and implied_team_total_raw (team scoring environment) — fit to "
            "v33 residuals on QB samples only (training_filter positions=QB, "
            "fit_intercept=False). predict_residual gates application by the "
            "same filter, so RB/WR/TE/K predictions are byte-identical to "
            "v33: 'neutral elsewhere' holds by construction. VERDICT: "
            "NEGATIVE (bounded bet, stopped on tie) — held-out QB MAE "
            "3.846 vs v33's 3.830 (Δ+0.015, CI [−0.016, +0.049], p=0.36, "
            "rolling 2023–24); residual coefficients ≈0. The global model's "
            "QB interactions already capture these signals."
        ),
        features=[
            "depth_chart_position_raw",
            "qb_backup_penalty",
            "implied_team_total_raw",
        ],
        combiner_type="residual",
        base_model_name="v33_tuned_base",
        interaction_terms=["depth_chart_position_raw^2"],
        training_filter={"positions": ["QB"]},
    ),
    "v35_pos_tuned_base": ModelDefinition(
        name="v35_pos_tuned_base",
        version=1,
        description=(
            "Per-position base tuning (GH #639): v33_tuned_base with the base "
            "feature swapped to weighted_ppg_pos_tuned_no_qb, which uses a "
            "per-position recency-weight vector (and per-position history "
            "window via vector length) chosen on the inner tuning folds "
            "(2022-2024, honest protocol GH #595) instead of #589's single "
            "global vector. Motivated by #589's win concentrating at RB/WR "
            "while QB/TE moved slightly the wrong way. Everything else "
            "identical to v33. VERDICT: NEGATIVE (stopped on iteration look, "
            "confirmation window not burned) — the sweep only changed RB "
            "([0.70, 0.20, 0.10], inner-fold gain −0.003), and held-out "
            "rolling 2023-24 the RB gain is noise (Δ −0.005, p=0.46) while "
            "full-refit coefficient drift nets ALL Δ +0.015 vs v33 "
            "(CI [−0.001, +0.032], p=0.066 — trending worse)."
        ),
        features=[
            "weighted_ppg_pos_tuned_no_qb",
            "age_curve",
            "regression_to_mean",
            "qb_backup_penalty",
            "usage_share_raw",
            "target_share_raw",
            "air_yards_share_raw",
            "wopr_raw",
            "racr_raw",
            "draft_capital_raw",
            "implied_team_total_raw",
            "depth_chart_position_raw",
            "role_change_raw",
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
            "implied_team_total_raw*position",
            "depth_chart_position_raw*position",
        ],
    ),
    "v36_pos_regression": ModelDefinition(
        name="v36_pos_regression",
        version=1,
        description=(
            "Per-position regression strength (GH #639): v33_tuned_base plus a "
            "regression_to_mean*position interaction. In a learned combiner a "
            "per-position REGRESSION_FACTOR is exactly a per-position "
            "coefficient on the regression delta, so the ridge learns each "
            "position's mean-reversion strength directly instead of a "
            "hand-swept factor. regression_to_mean is the most load-bearing "
            "feature in the #588 ablation (Δ +0.075 when removed) and its "
            "strength has never varied by position. VERDICT: NEGATIVE "
            "(stopped on iteration look) — held-out rolling 2023-24 ALL Δ "
            "+0.021 vs v33 (CI [−0.009, +0.053], p=0.18) with QB ρ −0.015; "
            "the 4 extra interaction columns add variance, not signal — the "
            "global regression coefficient was already right."
        ),
        features=[
            "weighted_ppg_tuned_no_qb",
            "age_curve",
            "regression_to_mean",
            "qb_backup_penalty",
            "usage_share_raw",
            "target_share_raw",
            "air_yards_share_raw",
            "wopr_raw",
            "racr_raw",
            "draft_capital_raw",
            "implied_team_total_raw",
            "depth_chart_position_raw",
            "role_change_raw",
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
            "implied_team_total_raw*position",
            "depth_chart_position_raw*position",
            "regression_to_mean*position",
        ],
    ),
    "v37_qb_volume": ModelDefinition(
        name="v37_qb_volume",
        version=1,
        description=(
            "QB volume signal (GH #640) — the genuinely-new QB signal the "
            "#592 postmortem asked for: v33_tuned_base's feature set plus "
            "qb_rush_volume_raw (recency-weighted rushing attempts/game; "
            "designed-run roles persist and rushing points are less "
            "TD-variance-driven than passing) and qb_pass_volume_raw "
            "(recency-weighted pass attempts/game; separates full-time "
            "starters from committee/partial-season QBs). Both are QB-only "
            "(None elsewhere), so each global coefficient is effectively a "
            "QB coefficient — no *position interaction needed. Full Ridge "
            "refit; if non-QB drift appears, fall back to the #592 residual "
            "machinery with these features. VERDICT: NEGATIVE (bounded bet, "
            "stopped on tie; confirmation window not burned) — held-out "
            "rolling 2023-24: ALL Δ +0.003 vs v33 (p=0.83, dead tie); QB Δ "
            "−0.027 in the right direction but unresolvable at N=62 QB "
            "clusters (CI [−0.245, +0.186], p=0.82); QB ρ +0.011. The "
            "in-sample fit assigns the new features ≈0 coefficients — rush "
            "volume is already priced into PPG history + depth chart. QB "
            "volume *levels* are not the missing QB signal."
        ),
        features=[
            "weighted_ppg_tuned_no_qb",
            "age_curve",
            "regression_to_mean",
            "qb_backup_penalty",
            "usage_share_raw",
            "target_share_raw",
            "air_yards_share_raw",
            "wopr_raw",
            "racr_raw",
            "draft_capital_raw",
            "implied_team_total_raw",
            "depth_chart_position_raw",
            "role_change_raw",
            "qb_rush_volume_raw",
            "qb_pass_volume_raw",
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
            "implied_team_total_raw*position",
            "depth_chart_position_raw*position",
        ],
    ),
    "naive_prior_season_ppg": ModelDefinition(
        name="naive_prior_season_ppg",
        version=1,
        description=(
            "Naïve floor (GH #575): next season = most recent prior season's PPG, "
            "no weighting/age/regression. Honest lower bound — any model worth its "
            "complexity must beat 'just use last year'."
        ),
        features=["naive_prior_ppg"],
    ),
    "position_mean_baseline": ModelDefinition(
        name="position_mean_baseline",
        version=1,
        description=(
            "Zero-information floor (GH #575): every player projected at their "
            "position's mean PPG (from the prior-season window). Cannot rank players "
            "(R² ≈ 0); isolates how much accuracy is just knowing positional scale."
        ),
        features=["position_mean"],
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
