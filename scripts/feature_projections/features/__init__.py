"""Feature registry for the projection system.

All features register themselves here. The registry maps feature name -> class.
"""

from scripts.feature_projections.features.weighted_ppg import (
    WeightedPPGFeature,
    WeightedPPGNoQBTrajectoryFeature,
    WeightedPPGPerPositionTunedFeature,
    WeightedPPGReliabilityNoQBFeature,
    WeightedPPGRookieGrowthFeature,
    WeightedPPGRookieGrowthNoQBFeature,
    WeightedPPGTunedNoQBFeature,
    WeightedXFPTunedNoQBFeature,
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
from scripts.feature_projections.features.partial_pooling import (
    PartialPoolingFeature,
    PartialPoolingEBFeature,
)
from scripts.feature_projections.features.qb_volume_efficiency import (
    WeightedQBVolumeEfficiencyFeature,
)
from scripts.feature_projections.features.xfp_redzone import (
    WeightedXFPRedZoneFeature,
    TDRegressionRawFeature,
)
from scripts.feature_projections.features.ngs_passing import (
    NGSCPOERawFeature,
    NGSAirYardsToSticksRawFeature,
    NGSAggressivenessRawFeature,
    NGSTimeToThrowRawFeature,
    NGSAirYardsDifferentialRawFeature,
)
from scripts.feature_projections.features.snap_trend import SnapTrendFeature
from scripts.feature_projections.features.qb_starter_usage import (
    QBStarterUsageFeature,
    QBStarterBackupPenaltyFeature,
)
from scripts.feature_projections.features.advanced_receiving import (
    TargetShareRawFeature,
    AirYardsShareRawFeature,
    WOPRRawFeature,
    RACRRawFeature,
)
from scripts.feature_projections.features.draft_capital import DraftCapitalRawFeature
from scripts.feature_projections.features.vegas_team_total import (
    ImpliedTeamTotalRawFeature,
)
from scripts.feature_projections.features.depth_chart import (
    DepthChartPositionFeature,
    RoleChangeFeature,
)
from scripts.feature_projections.features.qb_volume import (
    QBPassVolumeRawFeature,
    QBRushVolumeRawFeature,
)
from scripts.feature_projections.features.team_qb_quality import (
    TeamQBChangedFeature,
    TeamQBQualityFeature,
)
from scripts.feature_projections.features.naive_prior_ppg import NaivePriorSeasonPPGFeature
from scripts.feature_projections.features.position_mean import PositionMeanFeature
from scripts.feature_projections.features.coaching_change import (
    CoachingChangeFeature,
    CoachTenureFeature,
)

FEATURE_REGISTRY: dict[str, type] = {
    "weighted_ppg": WeightedPPGFeature,
    "weighted_ppg_no_qb_trajectory": WeightedPPGNoQBTrajectoryFeature,
    "weighted_ppg_reliability_no_qb": WeightedPPGReliabilityNoQBFeature,
    "weighted_ppg_tuned_no_qb": WeightedPPGTunedNoQBFeature,
    "weighted_xfp_tuned_no_qb": WeightedXFPTunedNoQBFeature,
    "weighted_qb_volume_efficiency": WeightedQBVolumeEfficiencyFeature,
    "weighted_xfp_redzone": WeightedXFPRedZoneFeature,
    "td_regression_raw": TDRegressionRawFeature,
    "ngs_cpoe_raw": NGSCPOERawFeature,
    "ngs_air_yards_to_sticks_raw": NGSAirYardsToSticksRawFeature,
    "ngs_aggressiveness_raw": NGSAggressivenessRawFeature,
    "ngs_time_to_throw_raw": NGSTimeToThrowRawFeature,
    "ngs_air_yards_differential_raw": NGSAirYardsDifferentialRawFeature,
    "weighted_ppg_pos_tuned_no_qb": WeightedPPGPerPositionTunedFeature,
    "age_curve": AgeCurveFeature,
    "stat_efficiency": StatEfficiencyFeature,
    "games_played": GamesPlayedFeature,
    "team_context": TeamContextFeature,
    "usage_share": UsageShareFeature,
    "usage_share_raw": UsageShareRawFeature,
    "regression_to_mean": RegressionToMeanFeature,
    "partial_pooling": PartialPoolingFeature,
    "partial_pooling_eb": PartialPoolingEBFeature,
    "regression_to_mean_tiered": RegressionToMeanTieredFeature,
    "snap_trend": SnapTrendFeature,
    "qb_starter_usage": QBStarterUsageFeature,
    "qb_backup_penalty": QBStarterBackupPenaltyFeature,
    "weighted_ppg_rookie_growth": WeightedPPGRookieGrowthFeature,
    "weighted_ppg_rookie_growth_no_qb": WeightedPPGRookieGrowthNoQBFeature,
    "target_share_raw": TargetShareRawFeature,
    "air_yards_share_raw": AirYardsShareRawFeature,
    "wopr_raw": WOPRRawFeature,
    "racr_raw": RACRRawFeature,
    "draft_capital_raw": DraftCapitalRawFeature,
    "implied_team_total_raw": ImpliedTeamTotalRawFeature,
    "depth_chart_position_raw": DepthChartPositionFeature,
    "role_change_raw": RoleChangeFeature,
    "team_qb_quality_raw": TeamQBQualityFeature,
    "team_qb_changed_raw": TeamQBChangedFeature,
    "qb_rush_volume_raw": QBRushVolumeRawFeature,
    "qb_pass_volume_raw": QBPassVolumeRawFeature,
    "naive_prior_ppg": NaivePriorSeasonPPGFeature,
    "position_mean": PositionMeanFeature,
    "coaching_change_raw": CoachingChangeFeature,
    "coach_tenure_raw": CoachTenureFeature,
}
