"""Qualifying-population coverage analysis (GH #599).

The #579 diagnostic found the eval-population mean PPG fell from ~9.7 (2021–2023)
to ~7.0 (2024–2025) and attributed it "largely to coverage". This script
root-causes that: it compares the Ottoneu `player_stats` qualifying population
(games ≥ MIN_GAMES) against the stable nflverse `nfl_stats` denominator
(same scoring — `nfl_stats.ppg` matches `player_stats.ppg` to <0.01 for the vast
majority of overlapping rows), per season and position.

The finding (2026-06): `player_stats` **under-covers 2021–2023** (≈30–40% of the
nflverse qualifying population) while 2018–2020 and 2024–2025 sit at ≈80%. The
players that *were* ingested in the thin seasons are the prominent high scorers,
so the mean PPG is inflated (~8–10 vs the true ~6.5). The cross-season "level
drift" is therefore an **ingestion-coverage artifact, not football** — which
changes how the #579 over-projection result and #591's level-matched-window
premise should be read.

Usage:
    venv/bin/python scripts/feature_projections/coverage_analysis.py \
        [--output docs/generated/coverage-analysis.md]
"""

from __future__ import annotations

import argparse
import os
from collections import defaultdict
from datetime import datetime
from typing import Optional

from scripts.config import get_supabase_client, fetch_all_rows, POSITIONS, MIN_GAMES

repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _per_season(rows: list, pos_map: dict, min_games: int):
    """Aggregate qualifying counts + mean PPG per season (and per position)."""
    total = defaultdict(int)
    qual = defaultdict(int)
    ppg_sum = defaultdict(float)
    qual_pos = defaultdict(lambda: defaultdict(int))
    for r in rows:
        s = r.get("season")
        if s is None:
            continue
        s = int(s)
        total[s] += 1
        if (r.get("games_played") or 0) < min_games:
            continue
        qual[s] += 1
        if r.get("ppg") is not None:
            ppg_sum[s] += float(r["ppg"])
        pos = pos_map.get(r["player_id"])
        if pos:
            qual_pos[s][pos] += 1
    return total, qual, ppg_sum, qual_pos


def gather(min_games: int = MIN_GAMES) -> dict:
    """Pull both populations and the player→position map (all paginated)."""
    sb = get_supabase_client()
    players = fetch_all_rows(sb, "players", "id, position")
    pos_map = {p["id"]: p["position"] for p in players}
    ps = fetch_all_rows(sb, "player_stats", "player_id, season, games_played, ppg")
    ns = fetch_all_rows(sb, "nfl_stats", "player_id, season, games_played, ppg")

    ps_total, ps_qual, ps_ppg, ps_qpos = _per_season(ps, pos_map, min_games)
    ns_total, ns_qual, ns_ppg, ns_qpos = _per_season(ns, pos_map, min_games)

    # Qualifying nflverse player-seasons absent from player_stats, per season.
    ps_keys = {(r["player_id"], int(r["season"])) for r in ps}
    missing = defaultdict(int)
    for r in ns:
        if r.get("season") is None or (r.get("games_played") or 0) < min_games:
            continue
        if (r["player_id"], int(r["season"])) not in ps_keys:
            missing[int(r["season"])] += 1

    return {
        "ps_total": ps_total, "ps_qual": ps_qual, "ps_ppg": ps_ppg, "ps_qpos": ps_qpos,
        "ns_qual": ns_qual, "ns_ppg": ns_ppg, "missing": missing,
        "min_games": min_games,
    }


def _fmt_pct(num, den) -> str:
    return f"{num / den * 100:.0f}%" if den else "—"


def render(data: dict) -> str:
    ps_total, ps_qual, ps_ppg = data["ps_total"], data["ps_qual"], data["ps_ppg"]
    ps_qpos, ns_qual, ns_ppg = data["ps_qpos"], data["ns_qual"], data["ns_ppg"]
    missing, min_games = data["missing"], data["min_games"]
    seasons = sorted(set(ps_total) | set(ns_qual))

    lines: list[str] = []
    lines.append("# Qualifying-Population Coverage Analysis (GH #599)\n")
    lines.append(f"_Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}_\n")
    lines.append(
        f"Coverage of the Ottoneu `player_stats` qualifying population (games ≥ "
        f"{min_games}) against the stable nflverse `nfl_stats` denominator (same "
        f"scoring). **Coverage %** = player_stats qualifiers ÷ nfl_stats qualifiers. "
        f"**Missing** = qualifying nflverse player-seasons absent from `player_stats`.\n"
    )

    lines.append("## Per-season coverage\n")
    lines.append(
        "| Season | PS total | PS games≥{g} | PS mean PPG | nflverse games≥{g} | Coverage % | Missing |"
        .format(g=min_games)
    )
    lines.append("| --- | --- | --- | --- | --- | --- | --- |")
    for s in seasons:
        mean = (ps_ppg[s] / ps_qual[s]) if ps_qual[s] else None
        lines.append(
            f"| {s} | {ps_total[s]} | {ps_qual[s]} | "
            f"{('%.2f' % mean) if mean is not None else '—'} | "
            f"{ns_qual.get(s, 0)} | {_fmt_pct(ps_qual[s], ns_qual.get(s, 0))} | "
            f"{missing.get(s, 0)} |"
        )
    lines.append("")

    lines.append("## Mean PPG of qualifiers — player_stats vs nflverse\n")
    lines.append(
        "_If the level drift were football, both columns would move together. They "
        "don't: the inflated `player_stats` mean tracks the coverage dip, not the "
        "nflverse population._\n"
    )
    lines.append("| Season | PS mean PPG | nflverse mean PPG | Coverage % |")
    lines.append("| --- | --- | --- | --- |")
    for s in seasons:
        ps_m = (ps_ppg[s] / ps_qual[s]) if ps_qual[s] else None
        ns_m = (ns_ppg[s] / ns_qual[s]) if ns_qual.get(s) else None
        lines.append(
            f"| {s} | {('%.2f' % ps_m) if ps_m is not None else '—'} | "
            f"{('%.2f' % ns_m) if ns_m is not None else '—'} | "
            f"{_fmt_pct(ps_qual[s], ns_qual.get(s, 0))} |"
        )
    lines.append("")

    lines.append("## Qualifying count by position (player_stats)\n")
    lines.append("| Season | " + " | ".join(POSITIONS) + " |")
    lines.append("| " + " | ".join(["---"] * (len(POSITIONS) + 1)) + " |")
    for s in seasons:
        cells = [str(ps_qpos[s].get(p, 0)) for p in POSITIONS]
        lines.append(f"| {s} | " + " | ".join(cells) + " |")
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="Qualifying-population coverage analysis (#599)")
    parser.add_argument("--min-games", type=int, default=MIN_GAMES)
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    data = gather(min_games=args.min_games)
    report = render(data)

    output = args.output or os.path.join(repo_root, "docs", "generated", "coverage-analysis.md")
    os.makedirs(os.path.dirname(output), exist_ok=True)
    with open(output, "w") as f:
        f.write(report)
    print(report)
    print(f"\nReport written to: {output}")


if __name__ == "__main__":
    main()
