"""Emit a compact league roster-economics snapshot for AI context.

This dumps the *raw inputs* a model needs to reason about roster construction —
every team's committed salary, cap space, and per-player salary vs. production
— in one small Markdown table.

Which production depends on the season phase (scripts/season.py):

- **Offseason** (arbitration, keepers, auction): this site's preseason projected
  PPG — the only forward-looking number available then, and what it was built for.
- **In season**: the season's *actual* PPG and games played. The preseason model
  is not updated once games start and is known to be inaccurate, and agents
  anchored on it for trade and keep/cut advice — so it is left out entirely.
  ``--source projection`` forces it back in, for looking back at it.
 It deliberately does NOT recompute
VORP/surplus: those formulas live in web/lib/{vorp,surplus}.ts (the source of
truth). Keeping this script to raw inputs avoids logic drift; the strategy
primer (docs/references/ottoneu-strategy.md) tells the model how to interpret
them.

Usage:
    venv/bin/python scripts/roster_context_pack.py [--season 2026] [--source auto|actual|projection]

Pipe the output into an AI question, or paste it alongside
docs/references/ottoneu-strategy.md.
"""

from __future__ import annotations

import argparse
from collections import defaultdict

from scripts.config import fetch_all_rows, get_supabase_client
from scripts.season import get_season_context

CAP_PER_TEAM = 400
NUM_TEAMS = 12


def resolve_source(phase: str, requested: str) -> str:
    """``actual`` in season, ``projection`` otherwise, unless explicitly requested."""
    if requested != "auto":
        return requested
    return "actual" if phase == "in_season" else "projection"


def fetch_rows(season: int, source: str):
    """Rostered players with salary and either projected or actual production for ``season``."""
    client = get_supabase_client()

    # NOTE: all three reads must paginate. `players` and `league_prices` each
    # exceed the PostgREST 1000-row cap (the scraper now writes ~900 free-agent
    # rows into league_prices), so a bare .execute() silently truncates to the
    # first 1000 rows — dropping rostered players and understating every team's
    # committed salary. See CLAUDE.md "Supabase pagination".
    players = {
        p["id"]: p
        for p in fetch_all_rows(client, "players", "id,name,position")
    }
    prices = fetch_all_rows(client, "league_prices", "player_id,price,team_name")
    if source == "projection":
        production = {
            p["player_id"]: (p["projected_ppg"], None)
            for p in fetch_all_rows(
                client,
                "player_projections",
                "player_id,projected_ppg,season",
                filters=[("eq", "season", season)],
            )
        }
    else:
        production = {
            p["player_id"]: (p["ppg"], p["games_played"])
            for p in fetch_all_rows(
                client,
                "player_stats",
                "player_id,ppg,games_played,season",
                filters=[("eq", "season", season)],
            )
        }

    rows = []
    for pr in prices:
        team = pr.get("team_name")
        if not team or team in ("FA", ""):
            continue
        pl = players.get(pr["player_id"])
        if not pl:
            continue
        ppg, games = production.get(pr["player_id"], (None, None))
        rows.append(
            {
                "team": team,
                "name": pl["name"],
                "position": pl["position"],
                "salary": pr["price"] or 0,
                "ppg": ppg,
                "games": games,
            }
        )
    return rows


def render(rows, season: int, source: str, phase: str) -> str:
    label = "preseason projections" if source == "projection" else "actual production"
    out = [f"# League Roster-Economics Snapshot — {season} {label}\n"]
    out.append(
        "Raw inputs only. Interpret surplus/VORP/QB-scarcity via "
        "`docs/references/ottoneu-strategy.md`. Salaries reflect current "
        "`league_prices` (already include the prior +$4/+$1 raise).\n"
    )
    if source == "projection" and phase == "in_season":
        out.append(
            "**WARNING:** the season is underway and these are this site's PRESEASON "
            "projections — not updated in season and known to be inaccurate. Do not base "
            "trade or keep/cut advice on them.\n"
        )
    elif source == "actual":
        out.append(
            f"PPG is actual {season} production (GP = games played). Mid-season this is a "
            "small, noisy sample: weigh it alongside weekly projections and public "
            "rest-of-season rankings, not on its own.\n"
        )

    by_team: dict[str, list] = defaultdict(list)
    for r in rows:
        by_team[r["team"]].append(r)

    # Cap summary table
    out.append("## Cap summary\n")
    out.append("| Team | Players | Committed | Cap space | QBs |")
    out.append("|------|--------:|----------:|----------:|----:|")
    for team in sorted(by_team):
        roster = by_team[team]
        committed = sum(r["salary"] for r in roster)
        qbs = sum(1 for r in roster if r["position"] == "QB")
        out.append(
            f"| {team} | {len(roster)} | ${committed} | "
            f"${CAP_PER_TEAM - committed} | {qbs} |"
        )

    # Per-team rosters
    if source == "projection":
        out.append("\n## Rosters (salary vs. preseason projected PPG)\n")
    else:
        out.append(f"\n## Rosters (salary vs. actual {season} PPG)\n")
    for team in sorted(by_team):
        out.append(f"### {team}\n")
        if source == "projection":
            out.append("| Player | Pos | Salary | Proj PPG |")
            out.append("|--------|-----|-------:|---------:|")
        else:
            out.append("| Player | Pos | Salary | PPG | GP |")
            out.append("|--------|-----|-------:|----:|---:|")
        roster = sorted(
            by_team[team],
            key=lambda r: (r["ppg"] is None, -(r["ppg"] or 0)),
        )
        for r in roster:
            ppg = "—" if r["ppg"] is None else f"{r['ppg']:.1f}"
            row = f"| {r['name']} | {r['position']} | ${r['salary']} | {ppg} |"
            if source != "projection":
                row += f" {'—' if r['games'] is None else r['games']} |"
            out.append(row)
        out.append("")

    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--season", type=int, default=None,
        help="Season to read (default: the resolver's projection season offseason, stats season in season)",
    )
    ap.add_argument(
        "--source", choices=["auto", "actual", "projection"], default="auto",
        help="auto = actual production in season, preseason projections otherwise",
    )
    args = ap.parse_args()
    ctx = get_season_context()
    source = resolve_source(ctx["phase"], args.source)
    season = args.season or (ctx["projection_season"] if source == "projection" else ctx["stats_season"])
    rows = fetch_rows(season, source)
    print(render(rows, season, source, ctx["phase"]))


if __name__ == "__main__":
    main()
