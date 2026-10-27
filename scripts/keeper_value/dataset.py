"""One row per player-season, "as of" an NFL week, with next season's outcome.

A row (player, season N, as-of week w) holds only what was knowable after week
w of season N: season N through week w, all of season N−1, the career before
N, and draft capital. Its outcome is season N+1's value in dollars, priced in
N+1's own market (``market.Market``) — so the target is in the same units as
/value and as a salary.

**Value is availability-inclusive**: points per *scheduled* game (total points
÷ the season's team games), so a player who misses half the season is worth
half as much. That is what a keeper actually delivers, and it matches the
projected-mode VORP since #614.

**Population**: everyone who has played a regular-season game in N by week w,
or played in N−1, or was drafted in N. A rookie drafted in April is in the week-0
population with no games at all — he is priced on the prior alone.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from scripts.config import MIN_PLAYER_SALARY
from scripts.keeper_value import nflverse
from scripts.keeper_value.market import Market
from scripts.scoring import EXTRA_KEYS, FULL_SCORING, add_nflverse_extras

# Ottoneu's trade deadline is the start of December (2026-12-01, league_calendar),
# i.e. after NFL week 12. Historical deadlines are not stored, so week 12 stands in.
DEADLINE_WEEK = 12

# Latent dollars below this are clipped. Anything under $1 is uncuttable-worthless
# either way; the clip only stops 0-game seasons (−$150 and worse) from
# dominating means and least squares.
LATENT_FLOOR = -30.0

EXPERIENCE_BUCKETS = ("1", "2", "3", "4", "5-6", "7+")
DRAFT_BUCKETS = ("R1", "R2", "R3", "R4-5", "R6-7", "UDFA")

# nflverse weekly column → Ottoneu scoring key (skill-position scoring only), plus
# the SCORING_EXTRAS columns add_nflverse_extras derives under their own names.
_SCORING_COLUMNS = {
    "passing_yards": "passing_yards",
    "passing_tds": "passing_tds",
    "passing_interceptions": "interceptions",
    "rushing_yards": "rushing_yards",
    "rushing_tds": "rushing_tds",
    "receptions": "receptions",
    "receiving_yards": "receiving_yards",
    "receiving_tds": "receiving_tds",
    **{key: key for key in EXTRA_KEYS},
}


def experience_bucket(years: int) -> str:
    if years <= 4:
        return str(max(years, 1))
    return "5-6" if years <= 6 else "7+"


def draft_bucket(draft_round: float | None) -> str:
    if draft_round is None or pd.isna(draft_round):
        return "UDFA"
    r = int(draft_round)
    if r <= 3:
        return f"R{r}"
    return "R4-5" if r <= 5 else "R6-7"


@dataclass
class SeasonData:
    """Per-game rows for every season loaded, plus the player file."""

    games: pd.DataFrame       # one row per player-game
    team_weeks: pd.DataFrame  # (season, team, week) a team played
    players: pd.DataFrame     # nflverse player file, indexed by gsis_id
    first_season: int
    last_season: int          # newest season with any games
    complete_through: int     # newest season whose regular season is over


def _game_rows(weekly: pd.DataFrame, snaps: pd.DataFrame, pfr_to_gsis: dict[str, str]) -> pd.DataFrame:
    df = add_nflverse_extras(weekly.copy())
    pts = np.zeros(len(df))
    for col, key in _SCORING_COLUMNS.items():
        pts += df[col].fillna(0).to_numpy(dtype=float) * float(FULL_SCORING[key])
    df["points"] = pts
    for col in ("targets", "carries", "attempts"):
        df[col] = df[col].fillna(0).astype(float)
    team = df.groupby(["season", "week", "team"])[["targets", "carries", "attempts"]].transform("sum")
    share = lambda num, den: np.where(den > 0, num / den.where(den > 0, 1), 0.0)  # noqa: E731
    rb_opp = share(df["carries"] + df["targets"], team["carries"] + team["targets"])
    rec_opp = share(df["targets"], team["targets"])
    qb_opp = share(df["attempts"], team["attempts"])
    df["opp_share"] = np.select(
        [df["position"] == "RB", df["position"] == "QB"], [rb_opp, qb_opp], default=rec_opp,
    )
    if not snaps.empty:
        s = snaps.copy()
        s["player_id"] = s["pfr_player_id"].map(pfr_to_gsis)
        s = s.dropna(subset=["player_id"]).groupby(["season", "week", "player_id"], as_index=False)["offense_pct"].max()
        df = df.merge(s, on=["season", "week", "player_id"], how="left")
    else:
        df["offense_pct"] = np.nan
    return df[["player_id", "player_display_name", "position", "season", "week", "team",
               "points", "opp_share", "offense_pct"]]


def load(current_season: int, first_season: int = nflverse.FIRST_SEASON) -> SeasonData:
    """Load every season from ``first_season`` through ``current_season``."""
    players = nflverse.load_players(refresh=True)
    pfr_to_gsis = dict(players.dropna(subset=["pfr_id", "gsis_id"])[["pfr_id", "gsis_id"]].values)
    frames, team_weeks = [], []
    for year in range(first_season, current_season + 1):
        weekly = nflverse.load_weekly(year, current_season)
        if weekly.empty:
            continue
        frames.append(_game_rows(weekly, nflverse.load_snaps(year, current_season), pfr_to_gsis))
        team_weeks.append(weekly[["season", "team", "week"]].drop_duplicates())
    games = pd.concat(frames, ignore_index=True)
    tw = pd.concat(team_weeks, ignore_index=True)
    last = int(games["season"].max())
    # A season is complete once a full slate of weeks exists (17 games → 18 weeks
    # since 2021; 16 → 17 before). The current one is still being played.
    complete = last if last < current_season else last - 1
    return SeasonData(
        games=games,
        team_weeks=tw,
        players=players.dropna(subset=["gsis_id"]).drop_duplicates("gsis_id").set_index("gsis_id"),
        first_season=int(games["season"].min()),
        last_season=last,
        complete_through=complete,
    )


def _aggregate(games: pd.DataFrame) -> pd.DataFrame:
    """Per-player totals over a slice of games."""
    g = games.groupby("player_id")
    out = pd.DataFrame({
        "games": g.size(),
        "points": g["points"].sum(),
        "snap": g["offense_pct"].mean(),
        "opp": g["opp_share"].mean(),
        "team": g["team"].last(),
        "position": g["position"].agg(lambda s: s.mode().iat[0]),
        "name": g["player_display_name"].last(),
    })
    return out


def _team_games(team_weeks: pd.DataFrame, season: int, through_week: int) -> pd.Series:
    tw = team_weeks[(team_weeks["season"] == season) & (team_weeks["week"] <= through_week)]
    return tw.groupby("team").size()


def season_totals(data: SeasonData, season: int, through_week: int = 99) -> tuple[pd.DataFrame, Market | None]:
    """Season ``season`` through ``through_week``, priced in its own market.

    Value per game is points ÷ the team's games so far (availability-inclusive).
    The market is built from that same pool.
    """
    sl = data.games[(data.games["season"] == season) & (data.games["week"] <= through_week)]
    if sl.empty:
        return pd.DataFrame(), None
    agg = _aggregate(sl)
    team_games = _team_games(data.team_weeks, season, through_week)
    denom = agg["team"].map(team_games).fillna(team_games.median()).clip(lower=1)
    agg["team_games"] = denom
    agg["per_game"] = agg["points"] / denom
    market = Market(list(zip(agg["position"], agg["per_game"], agg["games"].astype(int))))
    agg["latent"] = [
        max(LATENT_FLOOR, market.latent_dollars(p, v)) for p, v in zip(agg["position"], agg["per_game"])
    ]
    return agg, market


def build_rows(data: SeasonData, season: int, as_of_week: int) -> pd.DataFrame:
    """Every population row for (season, as-of week), with outcome when known."""
    now, _ = season_totals(data, season, as_of_week) if as_of_week > 0 else (pd.DataFrame(), None)
    prev, _ = season_totals(data, season - 1)
    nxt = None
    if season + 1 <= data.complete_through:
        nxt, _ = season_totals(data, season + 1)

    meta = data.players
    drafted_now = meta.index[(meta["draft_year"] == season) & meta["position"].isin(nflverse.SKILL_POSITIONS)]
    ids = set(now.index) | set(prev.index) | set(drafted_now)
    if not ids:
        return pd.DataFrame()
    idx = pd.Index(sorted(ids), name="player_id")
    df = pd.DataFrame(index=idx)

    def col(frame: pd.DataFrame, name: str, fill=np.nan):
        return frame[name].reindex(idx) if not frame.empty else pd.Series(fill, index=idx)

    m = meta.reindex(idx)
    df["name"] = col(now, "name").fillna(col(prev, "name")).fillna(m["display_name"])
    df["position"] = col(now, "position").fillna(col(prev, "position")).fillna(m["position"])
    df = df[df["position"].isin(nflverse.SKILL_POSITIONS)]
    idx = df.index
    m = meta.reindex(idx)

    df["season"] = season
    df["as_of_week"] = as_of_week
    first_seen = data.games.groupby("player_id")["season"].min().reindex(idx)
    rookie = m["rookie_season"].fillna(m["draft_year"]).fillna(first_seen).fillna(season)
    df["years"] = (season - rookie + 1).clip(lower=1).astype(int)
    df["exp_bucket"] = df["years"].map(experience_bucket)
    df["draft_bucket"] = m["draft_round"].map(draft_bucket)
    birth = pd.to_datetime(m["birth_date"], errors="coerce")
    df["age"] = (pd.Timestamp(f"{season}-09-01") - birth).dt.days / 365.25

    df["games_now"] = col(now, "games", 0).fillna(0).astype(int)
    df["team_games_now"] = col(now, "team_games", 0).fillna(0)
    df["latent_now"] = col(now, "latent")
    df["snap_now"] = col(now, "snap")
    df["opp_now"] = col(now, "opp")
    df["games_prev"] = col(prev, "games", 0).fillna(0).astype(int)
    df["latent_prev"] = col(prev, "latent")
    df["snap_prev"] = col(prev, "snap")
    df["opp_prev"] = col(prev, "opp")
    before = data.games[data.games["season"] < season].groupby("player_id").size().reindex(idx).fillna(0)
    df["career_games"] = (before + df["games_now"]).astype(int)

    # The current method's point estimate: this season's pace, else last season.
    point = df["latent_now"].where(df["games_now"] > 0, df["latent_prev"])
    df["point_value"] = point.fillna(MIN_PLAYER_SALARY).clip(lower=MIN_PLAYER_SALARY)

    if nxt is not None:
        # Missing next season = played no games: the worst outcome there is.
        df["latent_next"] = col(nxt, "latent").reindex(idx).fillna(LATENT_FLOOR)
        df["value_next"] = df["latent_next"].clip(lower=MIN_PLAYER_SALARY)
    return df.reset_index()


def build_panel(data: SeasonData, seasons: list[int], as_of_week: int) -> pd.DataFrame:
    frames = [build_rows(data, s, as_of_week) for s in seasons]
    frames = [f for f in frames if not f.empty]
    return pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
