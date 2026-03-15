"""Feature registry for the projection system.

All features register themselves here. The registry maps feature name -> class.
"""

from scripts.feature_projections.features.weighted_ppg import WeightedPPGFeature
from scripts.feature_projections.features.age_curve import AgeCurveFeature
from scripts.feature_projections.features.stat_efficiency import StatEfficiencyFeature
from scripts.feature_projections.features.games_played import GamesPlayedFeature
from scripts.feature_projections.features.team_context import TeamContextFeature
from scripts.feature_projections.features.usage_share import UsageShareFeature

FEATURE_REGISTRY: dict[str, type] = {
    "weighted_ppg": WeightedPPGFeature,
    "age_curve": AgeCurveFeature,
    "stat_efficiency": StatEfficiencyFeature,
    "games_played": GamesPlayedFeature,
    "team_context": TeamContextFeature,
    "usage_share": UsageShareFeature,
}
