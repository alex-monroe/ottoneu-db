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
import { POSITIONS, type Heat, type Position, type PositionalRank, type RankTable } from "./types";

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
 * The fewest games a player needs for his PPG to be ranked when judging
 * fire/ice: a quarter of the games played so far this season, and never fewer
 * than one. A player who has been out most of the year has a rate built on too
 * little football to call him anything.
 */
export function minGamesForHeat(seasonGames: number): number {
  return Math.max(1, Math.ceil(HEAT_MIN_GAMES_SHARE * seasonGames));
}

/**
 * The fire/ice thresholds. Deliberately severe — the icon should be rare
 * enough that seeing one means something. All three must hold:
 *
 *   - the ranks are at least {@link HEAT_MIN_GAP} spots apart,
 *   - the worse rank is at least {@link HEAT_MIN_RATIO}× the better one, so a
 *     12-spot gap at WR90 (noise) does not count the way one at WR6 does, and
 *   - the better of the two is inside the top {@link HEAT_MAX_BETTER_RANK},
 *     because nobody needs telling that WR99 by total is WR48 by rate.
 *
 * Calibrated against the league's actual seasons: 14 flags in 2025 and 16 in
 * 2024 (~3% of qualifying players), almost all fire — stars who missed games.
 * Ice is structurally rarer (a full-season compiler whose rate lags his total
 * by half): two in 2024, none in 2025.
 */
export const HEAT_MIN_GAMES_SHARE = 0.25;
export const HEAT_MIN_GAP = 12;
export const HEAT_MIN_RATIO = 2;
export const HEAT_MAX_BETTER_RANK = 36;

/**
 * "fire" when the PPG rank is far better than the total-points rank (he scores
 * at a higher rate than his total says — usually missed games), "ice" when far
 * worse (the total is volume, not rate). Null when neither is dramatic.
 */
export function classifyHeat(pointsRank: number, ppgRank: number): Heat | null {
  const better = Math.min(pointsRank, ppgRank);
  const worse = Math.max(pointsRank, ppgRank);
  if (
    worse - better < HEAT_MIN_GAP ||
    worse < HEAT_MIN_RATIO * better ||
    better > HEAT_MAX_BETTER_RANK
  ) {
    return null;
  }
  return ppgRank < pointsRank ? "fire" : "ice";
}

/**
 * Rank players within each position by **PPG**, counting only those with at
 * least `minGames` games. Equal PPG breaks towards more total points, then
 * player_id. Same shape as {@link rankByPosition}; `of` is the qualifying count.
 */
export function rankByPpg(
  players: readonly RankablePlayer[],
  season: number,
  minGames: number,
): Map<string, PositionalRank> {
  return rankWithin(
    players.filter((p) => p.games_played >= Math.max(1, minGames)),
    season,
    (a, b) =>
      b.ppg - a.ppg ||
      b.total_points - a.total_points ||
      a.player_id.localeCompare(b.player_id),
  );
}

/**
 * Rank every player in `players` within his position, keyed by player_id.
 *
 * Ranks are unique (1, 2, 3 …, never 1, 1, 3): equal points break towards the
 * higher PPG — the same points in fewer games — then by player_id so the order
 * is stable across renders.
 *
 * With `seasonGames` (how many games deep the season is — `observedGames` in
 * stat-window.ts), each player who has played at least
 * {@link minGamesForHeat} games also carries his PPG rank among those players,
 * and a `heat` when the two ranks disagree dramatically ({@link classifyHeat}).
 */
export function rankByPosition(
  players: readonly RankablePlayer[],
  season: number,
  seasonGames?: number,
): Map<string, PositionalRank> {
  const out = rankWithin(
    players,
    season,
    (a, b) =>
      b.total_points - a.total_points ||
      b.ppg - a.ppg ||
      a.player_id.localeCompare(b.player_id),
  );
  if (seasonGames == null) return out;

  const minGames = minGamesForHeat(seasonGames);
  for (const [id, ppgRank] of rankByPpg(players, season, minGames)) {
    const r = out.get(id)!;
    const heat = classifyHeat(r.rank, ppgRank.rank);
    out.set(id, {
      ...r,
      ppg_rank: ppgRank.rank,
      ppg_min_games: minGames,
      ...(heat ? { heat } : {}),
    });
  }
  return out;
}

function rankWithin(
  players: readonly RankablePlayer[],
  season: number,
  compare: (a: RankablePlayer, b: RankablePlayer) => number,
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
    list.sort(compare);
    list.forEach((p, i) => {
      out.set(p.player_id, { position, rank: i + 1, of: list.length, season });
    });
  }
  return out;
}

/**
 * Pack a season's ranks (keyed by player_id) into a {@link RankTable} keyed by
 * Ottoneu ID. Players with no Ottoneu ID are dropped — nothing can look them up.
 */
export function packRankTable(
  ranks: ReadonlyMap<string, PositionalRank>,
  ottoneuIdByPlayerId: ReadonlyMap<string, number>,
  season: number,
): RankTable {
  const rows: RankTable["rows"] = {};
  let minGames: number | null = null;
  for (const [playerId, r] of ranks) {
    const ottoneuId = ottoneuIdByPlayerId.get(playerId);
    if (!ottoneuId) continue;
    rows[ottoneuId] = [r.position, r.rank, r.of, r.ppg_rank ?? null, r.heat ?? null];
    minGames ??= r.ppg_min_games ?? null;
  }
  return { season, ppg_min_games: minGames, rows };
}

/** One player's rank back out of a {@link RankTable}, or null. */
export function unpackRank(
  table: RankTable | null,
  ottoneuId: number | null | undefined,
): PositionalRank | null {
  const row = ottoneuId ? table?.rows[ottoneuId] : undefined;
  if (!table || !row) return null;
  const [position, rank, of, ppgRank, heat] = row;
  return {
    position,
    rank,
    of,
    season: table.season,
    ...(ppgRank != null ? { ppg_rank: ppgRank, ppg_min_games: table.ppg_min_games ?? 1 } : {}),
    ...(heat ? { heat } : {}),
  };
}

/** "QB6". */
export function formatPositionalRank(r: Pick<PositionalRank, "position" | "rank">): string {
  return `${r.position}${r.rank}`;
}

/**
 * "WR17 🔥" — the rank tag as plain text, for places that cannot hold the chip
 * (a `<select>`'s options).
 */
export function formatRankTagText(r: PositionalRank): string {
  const icon = r.heat === "fire" ? " 🔥" : r.heat === "ice" ? " ❄️" : "";
  return `${formatPositionalRank(r)}${icon}`;
}

/** "6th of 38 QBs in 2026 by total points" — the badge's tooltip. */
export function describePositionalRank(r: PositionalRank): string {
  return `${ordinal(r.rank)} of ${r.of} ${r.position}s in ${r.season} by total points`;
}

/** The fire/ice icon's explanation, or null when there is no heat. */
export function describeHeat(r: PositionalRank): string | null {
  if (!r.heat || r.ppg_rank == null) return null;
  const byPpg = `${r.position}${r.ppg_rank} by PPG`;
  const byTotal = `${r.position}${r.rank} by total points`;
  const min = `min ${r.ppg_min_games} ${r.ppg_min_games === 1 ? "game" : "games"}`;
  return r.heat === "fire"
    ? `Scoring at a far better rate than his total shows: ${byPpg} vs ${byTotal} (${min})`
    : `His total outruns his rate: ${byPpg} vs ${byTotal} (${min})`;
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
