"""Script to generate player projections and update the player_projections database table.

This script acts as a bridge to the new feature_projections system. It looks
up the model currently flagged ``is_active=True`` in ``projection_models``,
runs it for ``TARGET_SEASONS``, promotes its outputs into ``player_projections``,
and then upserts rookie/college-prospect projections for players with no
NFL track record.

To switch which model the website serves, promote a different model:
    python scripts/feature_projections/cli.py promote --model v25_draft_capital_residual
"""

from __future__ import annotations

import pandas as pd

from scripts.config import get_supabase_client, MIN_GAMES
from scripts.analysis_utils import fetch_multi_season_stats
from scripts.projection_methods import CollegeProspectPPG, RookieDraftCapitalPPG
from scripts.feature_projections.runner import run_model
from scripts.feature_projections.promote import promote_model

TARGET_SEASONS = [2024, 2025, 2026]

# How many seasons before the target a player can have been drafted and still
# get a rookie projection when they have no NFL stats. player_stats only goes
# back to 2019, so without this guard retired pre-2019 high picks (Andrew Luck,
# Trent Richardson, ...) get treated as projectable rookies. A window of 2
# covers current-year rookies plus drafted-last-year holdovers who haven't yet
# taken an NFL snap. See GH #488.
ROOKIE_SEASON_WINDOW = 2


def recent_drafted_no_stats(
    drafted_no_stats: set[str],
    season_drafted_by_player: dict[str, int],
    target_season: int,
    window: int = ROOKIE_SEASON_WINDOW,
) -> set[str]:
    """Filter drafted-no-stats players to those drafted recently enough.

    Only players with a known draft season within ``window`` seasons of
    ``target_season`` qualify for a rookie projection. Older draftees without
    NFL stats are retired players we can't project (GH #488). Players with no
    recorded draft season are dropped — without it we can't gauge recency.
    """
    return {
        pid
        for pid in drafted_no_stats
        if pid in season_drafted_by_player
        and target_season - season_drafted_by_player[pid] <= window
    }


def get_active_model_name() -> str:
    """Return the name of the model currently flagged is_active=True.

    Raises a clear error if zero or multiple models are active so the operator
    can fix the inconsistency before regenerating production projections.
    """
    supabase = get_supabase_client()
    res = supabase.table("projection_models").select("name").eq("is_active", True).execute()
    rows = res.data or []
    if not rows:
        raise RuntimeError(
            "No projection_models row has is_active=True. Promote one first:\n"
            "  python scripts/feature_projections/cli.py promote --model <name>"
        )
    if len(rows) > 1:
        names = ", ".join(r["name"] for r in rows)
        raise RuntimeError(
            f"Multiple projection_models flagged is_active=True ({names}). "
            "Promote a single model to disambiguate."
        )
    return rows[0]["name"]


def compute_avg_rookie_ppg(multi_season_df: pd.DataFrame, players_df: pd.DataFrame,
                           min_games: int = MIN_GAMES) -> dict[str, float]:
    """Compute average PPG of first-year NFL players by position."""
    if multi_season_df.empty or players_df.empty:
        return {}
    pos_map = dict(zip(players_df['player_id_ref'], players_df['position']))
    grouped = multi_season_df.groupby('player_id')
    rookie_ppgs: dict[str, list[float]] = {}
    for player_id, group in grouped:
        if len(group) != 1:
            continue
        row = group.iloc[0]
        if int(row['games_played']) < min_games:
            continue
        pos = pos_map.get(str(player_id))
        if not pos or pos == 'K':
            continue
        rookie_ppgs.setdefault(pos, []).append(float(row['ppg']))
    return {pos: sum(ppgs) / len(ppgs) for pos, ppgs in rookie_ppgs.items() if ppgs}


def compute_rookie_draft_samples(multi_season_df: pd.DataFrame, players_df: pd.DataFrame,
                                  pick_by_player: dict[str, int],
                                  min_games: int = MIN_GAMES) -> list[tuple[str, int, float]]:
    """Build (position, overall_pick, year1_ppg) samples from historical rookies.

    A "rookie sample" is a player whose only season in the window is their
    first, who qualifies by min_games, has a known position, and has a
    ``draft_capital`` row. Used to fit RookieDraftCapitalPPG's per-position OLS.
    """
    if multi_season_df.empty or players_df.empty or not pick_by_player:
        return []
    pos_map = dict(zip(players_df['player_id_ref'], players_df['position']))
    samples: list[tuple[str, int, float]] = []
    for player_id, group in multi_season_df.groupby('player_id'):
        if len(group) != 1:
            continue
        row = group.iloc[0]
        if int(row['games_played']) < min_games:
            continue
        pos = pos_map.get(str(player_id))
        if not pos or pos == 'K':
            continue
        pick = pick_by_player.get(str(player_id))
        if not pick or int(pick) <= 0:
            continue
        samples.append((pos, int(pick), float(row['ppg'])))
    return samples


def generate_college_projections(avg_rookie_ppg: dict[str, float],
                                  college_players: list[dict], target_season: int,
                                  rookie_method: RookieDraftCapitalPPG | None = None,
                                  pick_by_player: dict[str, int] | None = None) -> pd.DataFrame:
    """Generate projections for rookies (drafted + true college).

    Drafted rookies (have an entry in ``pick_by_player``) are projected via
    ``rookie_method`` using their overall pick and tagged
    ``rookie_draft_capital``. Other rookies fall back to the position-mean
    ``CollegeProspectPPG``. Rows without a usable projection are skipped.
    """
    if not college_players:
        return pd.DataFrame()
    college_method = CollegeProspectPPG(avg_rookie_ppg) if avg_rookie_ppg else None
    pick_by_player = pick_by_player or {}
    records = []
    for player in college_players:
        pid = str(player['id'])
        position = player['position']
        pick = pick_by_player.get(pid)
        projected: float | None = None
        method_name: str | None = None

        if rookie_method is not None and pick:
            projected = rookie_method.project_ppg([], position=position, overall_pick=pick)
            method_name = rookie_method.name

        if projected is None and college_method is not None:
            projected = college_method.project_ppg([], position=position)
            method_name = college_method.name

        if projected is not None and method_name is not None:
            records.append({
                'player_id': pid,
                'season': target_season,
                'projected_ppg': float(projected),
                'projection_method': method_name,
            })
    return pd.DataFrame(records)


def upsert_college_projections():
    """Generate and upsert rookie/college-prospect projections.

    Covers two flavors of "no NFL track record yet" players:
      - is_college=True: still in college (Ottoneu allows rostering them).
      - Recently drafted: is_college=False with a draft_capital row but no
        player_stats history. After the draft we flip is_college off, so
        relying on that flag alone would orphan their projection.
    Both groups receive the position-average rookie PPG.
    """
    supabase = get_supabase_client()
    # Paginated fetch — the players table exceeds the 1000-row default page size
    # and a plain .execute() silently truncates, dropping newly-inserted rookies.
    from scripts.config import fetch_all_rows
    players_data = fetch_all_rows(supabase, 'players', 'id, position, is_college')
    players_df = pd.DataFrame(players_data)
    players_df = players_df.rename(columns={'id': 'player_id_ref'})

    if players_df.empty:
        return

    pick_by_player: dict[str, int] = {}
    season_drafted_by_player: dict[str, int] = {}
    drafted_no_stats_all: set[str] = set()
    has_is_college = 'is_college' in players_df.columns
    if has_is_college:
        # Players with real NFL history go through the full feature_projections
        # pipeline. Rows with games_played == 0 don't count — the roster scraper
        # writes a placeholder stats row (0 games) when it first sees a player,
        # which would otherwise mask actual rookies (e.g. drafted college players
        # who were rostered before they took an NFL snap).
        all_stats = fetch_all_rows(supabase, 'player_stats', 'player_id, games_played')
        with_stats = {
            r['player_id'] for r in all_stats if (r.get('games_played') or 0) > 0
        }
        all_draft = fetch_all_rows(
            supabase, 'draft_capital', 'player_id, overall_pick, season_drafted'
        )
        drafted = {r['player_id'] for r in all_draft}
        pick_by_player = {
            r['player_id']: int(r['overall_pick'])
            for r in all_draft
            if r.get('overall_pick') is not None
        }
        season_drafted_by_player = {
            r['player_id']: int(r['season_drafted'])
            for r in all_draft
            if r.get('season_drafted') is not None
        }
        non_college_ids = set(
            players_df[players_df['is_college'] == False]['player_id_ref'].tolist()  # noqa: E712
        )
        # Drafted-but-no-stats candidates. player_stats only goes back to 2019,
        # so this set still includes retired pre-2019 draftees; the per-season
        # recency guard below filters them out (see GH #488).
        drafted_no_stats_all = (drafted & non_college_ids) - with_stats

    college_ids = set()
    position_by_player: dict[str, str] = {}
    if has_is_college:
        college_ids = set(
            players_df[players_df['is_college'] == True]['player_id_ref'].tolist()  # noqa: E712
        )
        position_by_player = dict(
            zip(players_df['player_id_ref'], players_df['position'])
        )

    def college_players_for_season(target_season: int) -> list[dict]:
        """Rookie/college set for a target season.

        is_college players are always eligible. Drafted-no-stats players are
        only eligible if drafted within ROOKIE_SEASON_WINDOW seasons of the
        target — older draftees without stats are retired players we can't
        project and shouldn't surface in player_projections (GH #488).
        """
        if not has_is_college:
            return []
        recent_draftees = recent_drafted_no_stats(
            drafted_no_stats_all, season_drafted_by_player, target_season
        )
        eligible = college_ids | recent_draftees
        return [
            {'id': pid, 'position': position_by_player.get(pid)}
            for pid in eligible
        ]

    all_records = []
    for season in TARGET_SEASONS:
        college_players = college_players_for_season(season)
        historical_seasons = list(range(season - 3, season))
        multi_season_df = fetch_multi_season_stats(historical_seasons)
        avg_rookie_ppg = compute_avg_rookie_ppg(multi_season_df, players_df)

        rookie_method: RookieDraftCapitalPPG | None = None
        samples = compute_rookie_draft_samples(multi_season_df, players_df, pick_by_player)
        if samples:
            coef = RookieDraftCapitalPPG.fit(samples)
            if coef:
                rookie_method = RookieDraftCapitalPPG(coef, avg_rookie_ppg)
                print(f"  Rookie draft-capital fit for {season}: "
                      f"{ {p: (round(a, 2), round(b, 2)) for p, (a, b) in coef.items()} }")

        if avg_rookie_ppg or rookie_method is not None:
            if avg_rookie_ppg:
                print(f"  Avg rookie PPG for {season}: {avg_rookie_ppg}")
            college_df = generate_college_projections(
                avg_rookie_ppg, college_players, season,
                rookie_method=rookie_method, pick_by_player=pick_by_player,
            )
            if not college_df.empty:
                all_records.extend(college_df.to_dict('records'))

    if all_records:
        print(f"Upserting {len(all_records)} college projections...")
        batch_size = 500
        for i in range(0, len(all_records), batch_size):
            batch = all_records[i:i+batch_size]
            supabase.table('player_projections').upsert(
                batch, on_conflict='player_id,season'
            ).execute()


def update_projections() -> None:
    """Calculate projections and upsert them into the database."""
    active_model = get_active_model_name()
    print(f"Generating projections across seasons {TARGET_SEASONS} using model '{active_model}'...")

    # 1. Run the active model for the target seasons.
    run_count = run_model(active_model, TARGET_SEASONS)
    print(f"Generated {run_count} model projections.")

    # 2. Promote into player_projections.
    promoted = promote_model(active_model)
    print(f"Promoted {promoted} projections into player_projections.")

    # 3. Rookie/college fallback — feature_projections only emits rows for
    # players with NFL stats history, so 0-history players are layered on top.
    upsert_college_projections()

    print("Successfully updated player projections.")


if __name__ == '__main__':
    update_projections()

