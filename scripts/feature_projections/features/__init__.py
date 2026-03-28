"""Feature registry for the projection system.

All features register themselves here. The registry maps feature name -> class.
"""

from scripts.feature_projections.features.weighted_ppg import WeightedPPGFeature, WeightedPPGNoQBTrajectoryFeature
from scripts.feature_projections.features.age_curve import AgeCurveFeature
from scripts.feature_projections.features.stat_efficiency import StatEfficiencyFeature
from scripts.feature_projections.features.games_played import GamesPlayedFeature
from scripts.feature_projections.features.team_context import TeamContextFeature
from scripts.feature_projections.features.usage_share import UsageShareFeature
from scripts.feature_projections.features.regression_to_mean import RegressionToMeanFeature
from scripts.feature_projections.features.snap_trend import SnapTrendFeature
from scripts.feature_projections.features.qb_starter_usage import (
    QBStarterUsageFeature,
    QBStarterBackupPenaltyFeature,
)

FEATURE_REGISTRY: dict[str, type] = {
    "weighted_ppg": WeightedPPGFeature,
    "weighted_ppg_no_qb_trajectory": WeightedPPGNoQBTrajectoryFeature,
    "age_curve": AgeCurveFeature,
    "stat_efficiency": StatEfficiencyFeature,
    "games_played": GamesPlayedFeature,
    "team_context": TeamContextFeature,
    "usage_share": UsageShareFeature,
    "regression_to_mean": RegressionToMeanFeature,
    "snap_trend": SnapTrendFeature,
    "qb_starter_usage": QBStarterUsageFeature,
    "qb_backup_penalty": QBStarterBackupPenaltyFeature,
}
