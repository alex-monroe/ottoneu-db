"""Emit a compact league roster-economics snapshot for AI context.

This dumps the *raw inputs* a model needs to reason about roster construction —
every team's committed salary, cap space, and per-player salary vs. projected
production — in one small Markdown table. It deliberately does NOT recompute
VORP/surplus: those formulas live in web/lib/{vorp,surplus}.ts (the source of
truth). Keeping this script to raw inputs avoids logic drift; the strategy
primer (docs/references/ottoneu-strategy.md) tells the model how to interpret
them.

Usage:
    venv/bin/python scripts/roster_context_pack.py [--season 2026]

Pipe the output into an AI question, or paste it alongside
docs/references/ottoneu-strategy.md.
"""

from __future__ import annotations

import argparse
from collections import defaultdict

from scripts.config import LEAGUE_ID, fetch_all_rows, get_supabase_client

CAP_PER_TEAM = 400
NUM_TEAMS = 12


def fetch_rows(season: int):
    client = get_supabase_client()

    # players and player_projections both exceed the 1000-row PostgREST cap;
    # unpaginated reads silently truncated rosters and projections here.
    players = {
        p["id"]: p
        for p in fetch_all_rows(client, "players", "id,name,position")
    }
    prices = fetch_all_rows(
        client,
        "league_prices",
        "player_id,price,team_name",
        filters=[("eq", "league_id", LEAGUE_ID)],
    )
    projections = {
        p["player_id"]: p["projected_ppg"]
        for p in fetch_all_rows(
            client,
            "player_projections",
            "player_id,projected_ppg",
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
        ppg = projections.get(pr["player_id"])
        rows.append(
            {
                "team": team,
                "name": pl["name"],
                "position": pl["position"],
                "salary": pr["price"] or 0,
                "proj_ppg": ppg,
            }
        )
    return rows


def render(rows, season: int) -> str:
    out = [f"# League Roster-Economics Snapshot — {season} projections\n"]
    out.append(
        "Raw inputs only. Interpret surplus/VORP/QB-scarcity via "
        "`docs/references/ottoneu-strategy.md`. Salaries reflect current "
        "`league_prices` (already include the prior +$4/+$1 raise).\n"
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
    out.append("\n## Rosters (salary vs. projected PPG)\n")
    for team in sorted(by_team):
        out.append(f"### {team}\n")
        out.append("| Player | Pos | Salary | Proj PPG |")
        out.append("|--------|-----|-------:|---------:|")
        roster = sorted(
            by_team[team],
            key=lambda r: (r["proj_ppg"] is None, -(r["proj_ppg"] or 0)),
        )
        for r in roster:
            ppg = "—" if r["proj_ppg"] is None else f"{r['proj_ppg']:.1f}"
            out.append(f"| {r['name']} | {r['position']} | ${r['salary']} | {ppg} |")
        out.append("")

    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--season", type=int, default=2026)
    args = ap.parse_args()
    rows = fetch_rows(args.season)
    print(render(rows, args.season))


if __name__ == "__main__":
    main()
