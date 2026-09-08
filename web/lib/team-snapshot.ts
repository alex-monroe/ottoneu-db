/**
 * One team's week at a glance: the optimal lineup, what it projects, and who
 * is left on the bench.
 *
 * This is the thing you want while arguing about power rankings. The standings
 * tell you what a team *has done*; the number here tells you what its roster is
 * about to do, which is the half of the argument the standings cannot settle —
 * a 1-4 team whose starters project 130 this week is a different team from a
 * 1-4 team whose starters project 95.
 *
 * The optimal lineup is the same greedy fill `/lineup` uses (`optimizeLineup`
 * in `./lineup`), scored on the `weekly` metric — the third party's forecast
 * for that specific week, not a season average. That matters: a season average
 * cheerfully starts a player who is on bye, and a bye week is exactly the kind
 * of thing a power ranking should notice.
 *
 * Pure. `fetchTeamWeekSnapshots` does the I/O; everything below it is a
 * function of a roster, so the reasoning is testable without a database.
 */

import {
  LINEUP_SLOTS,
  SLOT_IDS,
  hasWeeklyData,
  lineupTotal,
  optimizeLineup,
  type LineupPlayer,
  type SlotId,
} from "./lineup";
import { fetchLineupWeek, type LineupTeam } from "./lineup-data";
import { sameTeamName } from "./teams";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnapshotPlayer {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  /**
   * Projected points for this week, or null when the source has no row —
   * a bye or an inactive player. Null is not zero, and the UI says so.
   */
  points: number | null;
  /** This week's NFL opponent, when known. */
  opponent: string | null;
}

export interface SnapshotSlot {
  slot: SlotId;
  /** Display label; several slots share one (two "RB"). */
  label: string;
  /** Null when the roster cannot fill the slot at all — no kicker, say. */
  player: SnapshotPlayer | null;
}

export interface TeamWeekSnapshot {
  teamName: string;
  /** Sum of the starters' weekly projections. */
  projectedPoints: number;
  starters: SnapshotSlot[];
  /** Everyone not starting, best projection first, byes last. */
  bench: SnapshotPlayer[];
  /**
   * Bench players the source has no row for this week — a bye, an inactive, or
   * a name it does not carry. Deliberately not called a bye count: in week 1
   * there are no byes and the number is still non-zero.
   */
  benchUnprojected: number;
}

/** What one week's snapshots are, and whether there are any. */
export interface TeamWeekSnapshots {
  /** The week these score. Null when no week has stored projections. */
  week: number | null;
  /**
   * False when the requested week has no third-party projections — a snapshot
   * built from nothing would read as "every team projects 0.0", which is worse
   * than showing nothing.
   */
  available: boolean;
  /** Keyed by the caller's own team names (see `fetchTeamWeekSnapshots`). */
  byTeam: Record<string, TeamWeekSnapshot>;
}

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

function toSnapshotPlayer(p: LineupPlayer): SnapshotPlayer {
  return {
    playerId: p.player_id,
    name: p.name,
    position: p.position,
    nflTeam: p.nfl_team,
    points: hasWeeklyData(p) ? (p.weekly_points as number) : null,
    opponent: p.weekly_opponent ?? null,
  };
}

/**
 * Bench ordering: best forecast first, and everyone without a forecast last
 * regardless of how good they are. A star on bye belongs at the bottom of the
 * list you are scanning for "who could they start instead", not the top.
 */
function benchOrder(a: SnapshotPlayer, b: SnapshotPlayer): number {
  if (a.points == null && b.points == null) return a.name.localeCompare(b.name);
  if (a.points == null) return 1;
  if (b.points == null) return -1;
  return b.points - a.points || a.name.localeCompare(b.name);
}

/** Optimal lineup, its total, and the bench, for one team in one week. */
export function buildTeamWeekSnapshot(team: LineupTeam): TeamWeekSnapshot {
  const lineup = optimizeLineup(team.players, "weekly");
  const byId = new Map(team.players.map((p) => [p.player_id, p]));

  const starters: SnapshotSlot[] = LINEUP_SLOTS.map((slot) => {
    const pid = lineup[slot.id];
    const player = pid ? byId.get(pid) : undefined;
    return {
      slot: slot.id,
      label: slot.label,
      player: player ? toSnapshotPlayer(player) : null,
    };
  });

  const starting = new Set(
    SLOT_IDS.map((id) => lineup[id]).filter((pid): pid is string => pid != null),
  );
  const bench = team.players
    .filter((p) => !starting.has(p.player_id))
    .map(toSnapshotPlayer)
    .sort(benchOrder);

  return {
    teamName: team.team_name,
    projectedPoints: lineupTotal(lineup, byId, "weekly"),
    starters,
    bench,
    benchUnprojected: bench.filter((p) => p.points == null).length,
  };
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

/**
 * Every team's snapshot for one week.
 *
 * @param week      The week to score. Snapshots come back `available: false`
 *                  if that week has no stored projections, rather than a set of
 *                  0.0s that would read as a forecast.
 * @param teamNames The names the caller wants the result keyed by — standings
 *                  names, typically. Rosters are keyed by the scraped
 *                  `league_prices.team_name`, which is the same team spelled
 *                  the same way in practice, but the two lists are assembled
 *                  independently so they are matched with `sameTeamName`
 *                  rather than assumed identical.
 * @param hasProjections Whether the viewer may see our seasonal model. It does
 *                  not affect anything here — the weekly metric is the third
 *                  party's — but `fetchLineupWeek` needs it and lying to it
 *                  would put gated numbers in an ungated object.
 */
export async function fetchTeamWeekSnapshots(
  week: number | undefined,
  teamNames: readonly string[],
  hasProjections: boolean,
): Promise<TeamWeekSnapshots> {
  const ctx = await fetchLineupWeek(week, hasProjections);

  // fetchLineupWeek falls back to the newest week with data when the one asked
  // for has none. For a power ranking that fallback is a lie — "week 5's
  // projection" showing week 3's numbers — so it is rejected rather than used.
  const available = ctx.hasWeekly && ctx.week != null && (week == null || ctx.week === week);
  if (!available) return { week: ctx.week, available: false, byTeam: {} };

  const byTeam: Record<string, TeamWeekSnapshot> = {};
  for (const name of teamNames) {
    const team = ctx.teams.find((t) => sameTeamName(t.team_name, name));
    if (team) byTeam[name] = buildTeamWeekSnapshot(team);
  }
  return { week: ctx.week, available: true, byTeam };
}
