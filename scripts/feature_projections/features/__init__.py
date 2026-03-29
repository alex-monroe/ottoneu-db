"""Feature registry for the projection system.

All features register themselves here. The registry maps feature name -> class.
"""

from scripts.feature_projections.features.weighted_ppg import (
    WeightedPPGFeature,
    WeightedPPGNoQBTrajectoryFeature,
    WeightedPPGRookieGrowthFeature,
    WeightedPPGRookieGrowthNoQBFeature,
)
from scripts.feature_projections.features.age_curve import AgeCurveFeature
from scripts.feature_projections.features.stat_efficiency import StatEfficiencyFeature
from scripts.feature_projections.features.games_played import GamesPlayedFeature
from scripts.feature_projections.features.team_context import TeamContextFeature
from scripts.feature_projections.features.usage_share import (
    UsageShareFeature,
    UsageShareRawFeature,
)
from scripts.feature_projections.features.regression_to_mean import (
    RegressionToMeanFeature,
    RegressionToMeanTieredFeature,
)
from scripts.feature_projections.features.snap_trend import SnapTrendFeature
from scripts.feature_projections.features.qb_starter_usage import (
    QBStarterUsageFeature,
    QBStarterBackupPenaltyFeature,
)
from scripts.feature_projections.features.elite_consistency import EliteConsistencyFeature

FEATURE_REGISTRY: dict[str, type] = {
    "weighted_ppg": WeightedPPGFeature,
    "weighted_ppg_no_qb_trajectory": WeightedPPGNoQBTrajectoryFeature,
    "age_curve": AgeCurveFeature,
    "stat_efficiency": StatEfficiencyFeature,
    "games_played": GamesPlayedFeature,
    "team_context": TeamContextFeature,
    "usage_share": UsageShareFeature,
    "usage_share_raw": UsageShareRawFeature,
    "regression_to_mean": RegressionToMeanFeature,
    "regression_to_mean_tiered": RegressionToMeanTieredFeature,
    "snap_trend": SnapTrendFeature,
    "qb_starter_usage": QBStarterUsageFeature,
    "qb_backup_penalty": QBStarterBackupPenaltyFeature,
    "weighted_ppg_rookie_growth": WeightedPPGRookieGrowthFeature,
    "weighted_ppg_rookie_growth_no_qb": WeightedPPGRookieGrowthNoQBFeature,
    "elite_consistency": EliteConsistencyFeature,
}
