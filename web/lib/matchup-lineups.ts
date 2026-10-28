/**
 * Server-side fetchers for `matchup_lineups` — who each team actually started.
 *
 * Rows are written by `scripts/scrape_lineups.py` from Ottoneu's public box
 * scores. Each row is joined here to the player's weekly projection
 * (`weekly_projections.projected_points`, frozen at kickoff by the ingest), and
 * everything computed from the pair — the live projected total, the pre-game
 * total, the slot pairings — lives in lib/live-matchup.ts as pure functions.
 */

import { supabase, fetchAllRows } from "./supabase";
import { LEAGUE_ID } from "./config";
import { fetchWeeklyByPlayer } from "./weekly-projections";
import {
  groupGames,
  type LineupEntry,
  type LineupGameState,
  type LiveGame,
} from "./live-matchup";
import type { ScoreHistory } from "./score-worm";

// One literal so Supabase's generated types can infer the row shape.
const COLUMNS =
  "game_id, side, team_id, team_name, ottoneu_id, player_id, player_name, nfl_team, position, slot, slot_number, is_starter, points, game_state, game_info, injury_status, stat_line, scraped_at";

const GAME_STATES: LineupGameState[] = ["scheduled", "in_progress", "final", "bye"];

/**
 * Coerce the free-text `game_state` to its union. An unrecognised value is
 * treated as not-yet-played, so it is projected rather than counted as a zero.
 */
function asGameState(value: unknown): LineupGameState {
  return GAME_STATES.includes(value as LineupGameState)
    ? (value as LineupGameState)
    : "scheduled";
}

function num(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function shape(row: Record<string, unknown>, projected: number | null): LineupEntry {
  return {
    game_id: Number(row.game_id),
    side: row.side === "away" ? "away" : "home",
    team_id: Number(row.team_id),
    team_name: String(row.team_name ?? ""),
    ottoneu_id: Number(row.ottoneu_id),
    player_id: (row.player_id as string) ?? null,
    player_name: String(row.player_name ?? ""),
    nfl_team: (row.nfl_team as string) ?? null,
    position: (row.position as string) ?? null,
    slot: String(row.slot ?? "BN"),
    slot_number: Number(row.slot_number ?? 0),
    is_starter: Boolean(row.is_starter),
    points: num(row.points),
    game_state: asGameState(row.game_state),
    game_info: (row.game_info as string) ?? null,
    injury_status: (row.injury_status as string) ?? null,
    stat_line: (row.stat_line as string) ?? null,
    projected,
  };
}

/**
 * Every stored game of one week, lineups joined to projections.
 *
 * A game with no scraped lineup is simply absent from the map — callers show
 * the team totals alone rather than a projection built from nothing.
 */
export async function fetchLiveWeek(
  season: number,
  week: number,
): Promise<Map<number, LiveGame>> {
  const [rows, weekly] = await Promise.all([
    fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from("matchup_lineups")
        .select(COLUMNS)
        .eq("league_id", LEAGUE_ID)
        .eq("season", season)
        .eq("week", week)
        .order("game_id")
        .order("side")
        .order("ottoneu_id")
        .order("id")
        .range(from, to),
    ),
    fetchWeeklyByPlayer(season, week),
  ]);

  const scrapedAt = new Map<number, string>();
  const entries = rows.map((row) => {
    const gameId = Number(row.game_id);
    const stamp = String(row.scraped_at ?? "");
    if (stamp && (scrapedAt.get(gameId) ?? "") < stamp) scrapedAt.set(gameId, stamp);
    const projection = row.player_id ? weekly.get(String(row.player_id)) : undefined;
    return shape(row, projection?.projected_points ?? null);
  });
  return groupGames(entries, scrapedAt);
}

/** One game's lineups, or null when none have been scraped for it. */
export async function fetchLiveGame(
  season: number,
  week: number,
  gameId: number,
): Promise<LiveGame | null> {
  return (await fetchLiveWeek(season, week)).get(gameId) ?? null;
}

/**
 * One game's score history, oldest first — the data behind the score worm.
 * Once the week has been rebuilt from play-by-play (`matchup_score_plays`)
 * that is every scoring play; before then it is the live lineup scrapes
 * (`matchup_score_snapshots`). Empty when neither is stored or a read fails:
 * the worm is an extra, never a reason for the game page to error.
 */
export async function fetchScoreSnapshots(gameId: number): Promise<ScoreHistory> {
  try {
    const plays = await fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from("matchup_score_plays")
        .select("play_at, home_points, away_points, note, home_progress, away_progress, home_win_prob, home_proj_remaining, away_proj_remaining")
        .eq("league_id", LEAGUE_ID)
        .eq("game_id", gameId)
        .order("seq")
        .order("id")
        .range(from, to),
    );
    if (plays.length > 0) {
      return {
        source: "plays",
        snapshots: plays.map((row) => ({
          scraped_at: String(row.play_at),
          home_points: Number(row.home_points),
          away_points: Number(row.away_points),
          note: row.note == null ? null : String(row.note),
          home_progress: row.home_progress == null ? null : Number(row.home_progress),
          away_progress: row.away_progress == null ? null : Number(row.away_progress),
          home_win_prob: row.home_win_prob == null ? null : Number(row.home_win_prob),
          home_proj_remaining: row.home_proj_remaining == null ? null : Number(row.home_proj_remaining),
          away_proj_remaining: row.away_proj_remaining == null ? null : Number(row.away_proj_remaining),
        })),
      };
    }

    const rows = await fetchAllRows<Record<string, unknown>>((from, to) =>
      supabase
        .from("matchup_score_snapshots")
        .select("scraped_at, home_points, away_points")
        .eq("league_id", LEAGUE_ID)
        .eq("game_id", gameId)
        .order("scraped_at")
        .order("id")
        .range(from, to),
    );
    return {
      source: "scrapes",
      snapshots: rows.map((row) => ({
        scraped_at: String(row.scraped_at),
        home_points: Number(row.home_points),
        away_points: Number(row.away_points),
      })),
    };
  } catch (error) {
    console.error("fetchScoreSnapshots failed:", error);
    return { source: "scrapes", snapshots: [] };
  }
}
