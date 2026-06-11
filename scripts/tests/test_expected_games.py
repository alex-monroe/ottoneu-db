"""Tests for the expected-games availability haircut (GH #587 stage a)."""

from scripts.feature_projections.expected_games import (
    FULL_SEASON_GAMES,
    YOUNG_PLAYER_GAMES_FLOOR,
    build_expected_games,
)


POS_MAP = {"rb1": "RB", "rb2": "RB", "wr1": "WR"}


def _stats():
    # rb1: durable (16, 17 games); rb2: injury-prone (4, 6); wr1: 12, 14.
    return [
        {"player_id": "rb1", "season": 2022, "games_played": 16},
        {"player_id": "rb1", "season": 2023, "games_played": 17},
        {"player_id": "rb2", "season": 2022, "games_played": 4},
        {"player_id": "rb2", "season": 2023, "games_played": 6},
        {"player_id": "wr1", "season": 2022, "games_played": 12},
        {"player_id": "wr1", "season": 2023, "games_played": 14},
    ]


def test_mode_none_returns_empty():
    assert build_expected_games(_stats(), POS_MAP, [2024], "none") == {}


def test_leakage_free_only_uses_prior_seasons():
    # Target 2023 may only see 2022 rows; rb1's 2023 (17) must not leak in.
    eg = build_expected_games(_stats(), POS_MAP, [2023], "history")
    assert eg[("rb1", 2023)] == 16  # only 2022 season available (16 > young floor)
    # rb2 has 1 prior played season (2022=4) → thin-history guard floors it at 12,
    # not 4. (The leakage check is rb1==16: 2023's 17 did not leak in.)
    assert eg[("rb2", 2023)] == 12


def test_history_is_per_player_recency_weighted():
    eg = build_expected_games(_stats(), POS_MAP, [2024], "history")
    # rb1 most-recent (2023=17) weighted 0.6, 2022=16 weighted 0.3 -> (17*.6+16*.3)/.9
    assert abs(eg[("rb1", 2024)] - (17 * 0.6 + 16 * 0.3) / 0.9) < 1e-9
    # Durable rb1 estimate > injury-prone rb2 estimate.
    assert eg[("rb1", 2024)] > eg[("rb2", 2024)]


def test_constant_is_per_position_mean():
    eg = build_expected_games(_stats(), POS_MAP, [2024], "constant")
    # RB constant = mean of all prior RB player-seasons (16,17,4,6) = 10.75.
    assert abs(eg[("rb1", 2024)] - (16 + 17 + 4 + 6) / 4) < 1e-9
    # Same constant for both RBs (it's positional, not per-player).
    assert eg[("rb1", 2024)] == eg[("rb2", 2024)]


def test_estimates_capped_at_full_season():
    stats = [{"player_id": "rb1", "season": 2023, "games_played": 25}]
    eg = build_expected_games(stats, POS_MAP, [2024], "history")
    assert eg[("rb1", 2024)] == FULL_SEASON_GAMES


def test_history_falls_back_to_position_constant():
    # rb2 has no prior games (all zero) on the target window -> use RB constant.
    stats = [
        {"player_id": "rb1", "season": 2023, "games_played": 17},
        {"player_id": "rb2", "season": 2023, "games_played": 0},
    ]
    eg = build_expected_games(stats, POS_MAP, [2024], "history")
    # rb2 fell back to the RB constant (only rb1's 17 counts; rb2's 0 excluded).
    assert eg[("rb2", 2024)] == 17


def test_thin_history_young_player_is_floored():
    # An ascending young RB with two low (role-ramp) seasons — k=2 < 3 prior
    # played seasons — is floored at YOUNG_PLAYER_GAMES_FLOOR, not its
    # recency-weighted ~6 games.
    stats = [
        {"player_id": "young", "season": 2023, "games_played": 5},
        {"player_id": "young", "season": 2024, "games_played": 7},
    ]
    eg = build_expected_games(stats, {"young": "RB"}, [2025], "history")
    assert eg[("young", 2025)] == YOUNG_PLAYER_GAMES_FLOOR


def test_established_chronic_player_is_not_floored():
    # A vet with 3+ played seasons all below the floor keeps the full history
    # discount — the guard only protects thin-history (young) players.
    stats = [
        {"player_id": "vet", "season": 2022, "games_played": 6},
        {"player_id": "vet", "season": 2023, "games_played": 6},
        {"player_id": "vet", "season": 2024, "games_played": 7},
    ]
    eg = build_expected_games(stats, {"vet": "RB"}, [2025], "history")
    # Recency-weighted ~6.4 games, well below the 12 floor, and NOT floored.
    assert eg[("vet", 2025)] < YOUNG_PLAYER_GAMES_FLOOR
