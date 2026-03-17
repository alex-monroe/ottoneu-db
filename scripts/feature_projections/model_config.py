"""Model definitions for the feature projection system.

Each model specifies which features to use and their weights.
Models are defined here and registered in the database by the runner.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ModelDefinition:
    """Definition of a projection model."""

    name: str
    version: int
    description: str
    features: list[str]
    weights: dict[str, float] = field(default_factory=dict)
    is_baseline: bool = False


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
