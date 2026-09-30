/**
 * Positional rank — where a player finishes at his position: "QB6", "WR17".
 *
 * The ordering is **total fantasy points**, the conventional meaning of a
 * positional finish. Mid-season that rewards availability as well as rate —
 * a WR who missed two games sits below one who didn't — which is what "WR17
 * so far" means in every other fantasy tool, and why the rankings page lets
 * you sort by PPG when you want the rate instead.
 *
 * Only players who have played are ranked. A healthy scratch with zero games
 * has no finish yet; ranking him last would make "of 38" count people who
 * never took the field.
 *
 * Like earned value, a rank is a property of the whole season's pool, not of a
 * player's own row, so it is derived on read (see positional-rank-data.ts) and
 * never stored.
 */
import { POSITIONS, type Position, type PositionalRank } from "./types";

/** The fields ranking needs — `Player` satisfies it, so does a bare stats row. */
export interface RankablePlayer {
  player_id: string;
  position: string;
  total_points: number;
  games_played: number;
  ppg: number;
}

function isPosition(p: string): p is Position {
  return (POSITIONS as readonly string[]).includes(p);
}

/**
 * Rank every player in `players` within his position, keyed by player_id.
 *
 * Ranks are unique (1, 2, 3 …, never 1, 1, 3): equal points break towards the
 * higher PPG — the same points in fewer games — then by player_id so the order
 * is stable across renders.
 */
export function rankByPosition(
  players: readonly RankablePlayer[],
  season: number,
): Map<string, PositionalRank> {
  const byPosition = new Map<Position, RankablePlayer[]>();
  for (const p of players) {
    if (!isPosition(p.position) || !(p.games_played > 0)) continue;
    const list = byPosition.get(p.position);
    if (list) list.push(p);
    else byPosition.set(p.position, [p]);
  }

  const out = new Map<string, PositionalRank>();
  for (const [position, list] of byPosition) {
    list.sort(
      (a, b) =>
        b.total_points - a.total_points ||
        b.ppg - a.ppg ||
        a.player_id.localeCompare(b.player_id),
    );
    list.forEach((p, i) => {
      out.set(p.player_id, { position, rank: i + 1, of: list.length, season });
    });
  }
  return out;
}

/** "QB6". */
export function formatPositionalRank(r: Pick<PositionalRank, "position" | "rank">): string {
  return `${r.position}${r.rank}`;
}

/** "6th of 38 QBs in 2026 by total points" — the badge's tooltip. */
export function describePositionalRank(r: PositionalRank): string {
  return `${ordinal(r.rank)} of ${r.of} ${r.position}s in ${r.season} by total points`;
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
