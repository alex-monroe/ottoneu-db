/**
 * The weekly recap — one completed NFL week, shaped into the things a podcast
 * talks about.
 *
 * Every number here is DERIVED at read time from rows three other subsystems
 * already store, exactly like the standings are:
 *
 *   `matchup_lineups`      who each team actually started, and what they scored
 *   `weekly_projections`   each player's forecast, frozen at his kickoff
 *   `league_matchups`      the head-to-head game log
 *   `power_ranking_*`      the hosts' consolidated ranking for that same week
 *
 * There is no recap table and there should not be one. A stored recap can only
 * be as fresh as the job that wrote it, and it can disagree with the box score
 * it was supposed to summarise — which is the one thing you cannot have happen
 * while two people are reading it out loud.
 *
 * ## Three different kinds of surprise
 *
 * The show argues about all three and they are not the same claim:
 *
 * 1. **Against the projection** (`RecapPlayer.surprise`) — a player against the
 *    third party's forecast for that specific game. This is the tightest of the
 *    three, because the projection was frozen at kickoff: the number a player is
 *    measured against is the one that was on the board before he played, not a
 *    revision published afterwards.
 * 2. **Against the projected total** (`RecapSide.beat`) — a team against the sum
 *    of its own starters' projections. A team can beat its projection and still
 *    lose, which is usually the more interesting sentence.
 * 3. **Against the power ranking** (`TeamWeek.powerSurprise`) — where the hosts
 *    had a team on Tuesday against where it finished the week in scoring. This
 *    one is about the hosts, not the teams, which is why each host's own
 *    placement rides along on the row: "you had them eleventh" is the segment.
 *
 * ## Hindsight is declared, not hidden
 *
 * `benchMisses` re-runs the lineup optimizer over the points players *actually*
 * scored. That is pure hindsight and the UI says so — nobody could have set that
 * lineup. It earns its place because the gap between what a roster scored and
 * what it held is a fact about the roster, and because "you started the wrong
 * running back" is the oldest bit in fantasy football.
 *
 * ## A missing projection is not a zero
 *
 * `projected` is null for a bye, an inactive, or a player the source does not
 * carry. Those players are excluded from the surprise lists rather than credited
 * with beating a forecast of zero, and the count of them is reported so the page
 * can say what it left out.
 *
 * ## Host ballots only
 *
 * The ranking side reads through `fetchWeekRankings`, which is host-scoped. The
 * recap is production material for the hosts; it does not count listeners and
 * cannot name one. See the note in ./power-rankings.
 */

import { cache } from "react";
import { getLeagueStatus } from "./matchups";
import { fetchLiveWeek } from "./matchup-lineups";
import { fetchWeekRankings, type VoterRank } from "./power-rankings";
import {
  SLOT_IDS,
  lineupTotal,
  optimizeLineup,
  type LineupPlayer,
} from "./lineup";
import { sideTotals, type LineupEntry, type LiveGame } from "./live-matchup";
import type { Matchup } from "./standings";
import { sameTeamName } from "./teams";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One player's week, from the roster that actually held him. */
export interface RecapPlayer {
  /** Ottoneu's player id — always present, unlike our own `player_id`. */
  ottoneuId: number;
  name: string;
  position: string | null;
  nflTeam: string | null;
  /** The fantasy team that started or benched him. */
  teamName: string;
  slot: string;
  isStarter: boolean;
  points: number;
  /** The forecast frozen at his kickoff. Null when there was none. */
  projected: number | null;
  /** `points - projected`, or null when there was no forecast to beat. */
  surprise: number | null;
  /** Ottoneu's own summary, e.g. "25-34 205yds 3TD 1INT". */
  statLine: string | null;
  /** Ottoneu's own words for the NFL game, e.g. "W 27-7 @LA". */
  gameInfo: string | null;
}

/** One side of one head-to-head game. */
export interface RecapSide {
  teamName: string;
  /** What the starters actually scored. */
  points: number;
  /** What the same starters were projected to score, before kickoff. */
  pregame: number | null;
  /** `points - pregame`, null when no lineup is stored. */
  beat: number | null;
}

export interface RecapGame {
  gameId: number;
  home: RecapSide;
  away: RecapSide;
  /** Absolute points margin. */
  margin: number;
  /** Null on a tie, or before the game is decided. */
  winner: string | null;
  /**
   * True when the side that was projected to score less won it. Null when
   * either side has no stored lineup, since there is nothing to have upset.
   */
  upset: boolean | null;
  /** Both sides added together — the shootout / the rock fight. */
  combined: number;
  final: boolean;
}

/** One fantasy team's week, from every angle the show uses. */
export interface TeamWeek {
  teamName: string;
  points: number;
  pregame: number | null;
  beat: number | null;
  /** 1 = the week's highest scorer. Ties share a rank. */
  scoringRank: number;
  result: "win" | "loss" | "tie" | null;
  opponent: string | null;
  opponentPoints: number | null;
  /** Where the hosts' consolidated ranking had them going into this week. */
  powerRank: number | null;
  /**
   * `powerRank - scoringRank`. Positive means they scored better than the hosts
   * ranked them; negative means the ranking was too kind. Null without a ranking.
   */
  powerSurprise: number | null;
  /** Each host's own placement, so the row can name who was furthest off. */
  votes: VoterRank[];
}

/** What a roster left on its own bench, scored in hindsight. */
export interface BenchMiss {
  teamName: string;
  /** What the lineup they set actually scored. */
  actual: number;
  /** What the best lineup available from the same roster would have scored. */
  optimal: number;
  /** `optimal - actual`. Never negative. */
  left: number;
  /** Benched players the optimal lineup would have started, best first. */
  shouldHaveStarted: RecapPlayer[];
  /** Starters it would have sat, worst first. */
  shouldHaveSat: RecapPlayer[];
}

export interface WeeklyRecap {
  season: number;
  week: number;
  /** Weeks with something to recap — at least one game under way or done. */
  weeks: RecapWeekOption[];
  /** Every regular-season game of the week is final. */
  complete: boolean;
  /** False when no lineups were scraped — most of the page cannot be built. */
  hasLineups: boolean;
  games: RecapGame[];
  /** Every team, highest scorer first. */
  teams: TeamWeek[];
  topPerformers: RecapPlayer[];
  overachievers: RecapPlayer[];
  busts: RecapPlayer[];
  topBench: RecapPlayer[];
  benchMisses: BenchMiss[];
  /** True when at least one host ballot was locked in for this week. */
  ranked: boolean;
  /** The hosts whose ballots counted. */
  voters: { userId: string; displayName: string }[];
  /** Starters with no forecast at all — excluded from the surprise lists. */
  unprojected: number;
  /** When the lineups were last read from Ottoneu. */
  asOf: string | null;
}

/** How many rows each list carries. Long enough to have options on air. */
const LIST_SIZE = 8;

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

/** A week the picker can offer, and whether it is still being played. */
export interface RecapWeekOption {
  week: number;
  /** A regular-season game of this week has not finished yet. */
  partial: boolean;
}

/**
 * Which weeks are worth recapping: the ones with at least one game that is not
 * still scheduled. A week whose games have not kicked off has nothing in it, and
 * offering Week 14 in September would be a picker full of empty pages.
 */
export function recapWeeks(matchups: readonly Matchup[]): RecapWeekOption[] {
  const started = matchups.filter((m) => m.status !== "scheduled").map((m) => m.week);
  return [...new Set(started)].sort((a, b) => a - b).map((week) => ({
    week,
    partial: matchups.some(
      (m) => m.week === week && m.game_type === "regular" && m.status !== "final",
    ),
  }));
}

/**
 * The week the page opens on.
 *
 * A recap looks backwards, so the default is the latest week that is *finished*
 * — on the Tuesday you record, that is the slate that just ended, not the one
 * about to start. A week still being played is reachable from the picker but is
 * never the default, because a half-played week reads as a league of busts.
 */
export function defaultRecapWeek(
  matchups: readonly Matchup[],
  requested?: number,
): number | null {
  const weeks = recapWeeks(matchups);
  if (weeks.length === 0) return null;
  if (requested != null && weeks.some((w) => w.week === requested)) return requested;

  const finished = matchups
    .filter((m) => m.game_type === "regular" && m.status === "final")
    .map((m) => m.week);
  return finished.length > 0 ? Math.max(...finished) : weeks[weeks.length - 1].week;
}

function toRecapPlayer(entry: LineupEntry): RecapPlayer {
  const points = entry.points ?? 0;
  return {
    ottoneuId: entry.ottoneu_id,
    name: entry.player_name,
    position: entry.position,
    nflTeam: entry.nfl_team,
    teamName: entry.team_name,
    slot: entry.slot,
    isStarter: entry.is_starter,
    points,
    projected: entry.projected,
    surprise: entry.projected == null ? null : points - entry.projected,
    statLine: entry.stat_line,
    gameInfo: entry.game_info,
  };
}

/** Every rostered player in the week, both benches included. */
export function recapPlayers(games: readonly LiveGame[]): RecapPlayer[] {
  return games.flatMap((game) =>
    [...game.home.entries, ...game.away.entries].map(toRecapPlayer),
  );
}

function byPoints(a: RecapPlayer, b: RecapPlayer): number {
  return b.points - a.points || a.name.localeCompare(b.name);
}

/**
 * The week's biggest hauls — **starters only**, so every performance on the list
 * is one that counted for somebody. The bench has its own list; a player would
 * otherwise appear in both and the two sections would stop being separate facts.
 */
export function topPerformers(
  players: readonly RecapPlayer[],
  limit = LIST_SIZE,
): RecapPlayer[] {
  return players.filter((p) => p.isStarter).sort(byPoints).slice(0, limit);
}

/** The biggest scores that never left the bench. */
export function topBench(
  players: readonly RecapPlayer[],
  limit = LIST_SIZE,
): RecapPlayer[] {
  return players.filter((p) => !p.isStarter).sort(byPoints).slice(0, limit);
}

/** Players with a forecast to be measured against — the only ones a surprise applies to. */
function projectedOnly(players: readonly RecapPlayer[]): RecapPlayer[] {
  return players.filter((p) => p.surprise !== null);
}

/**
 * Who most outran their forecast.
 *
 * Bench players are **included**: a benched player blowing past his projection
 * is a story about a manager who missed it, and one of the better ones. That
 * is the opposite of the rule for `busts` below, deliberately.
 */
export function overachievers(
  players: readonly RecapPlayer[],
  limit = LIST_SIZE,
): RecapPlayer[] {
  return projectedOnly(players)
    .sort((a, b) => (b.surprise as number) - (a.surprise as number))
    .slice(0, limit);
}

/**
 * Who most fell short of their forecast — **starters only**. A bench player
 * quietly failing to reach his projection cost nobody anything and is not an
 * item; the same shortfall in a starting slot lost somebody a game.
 *
 * Ranked on the raw shortfall rather than a ratio, which is what keeps the list
 * honest without a minimum-projection floor: a player forecast 3.2 who scored
 * nothing simply never outranks one forecast 18.4 who scored four.
 */
export function busts(
  players: readonly RecapPlayer[],
  limit = LIST_SIZE,
): RecapPlayer[] {
  return projectedOnly(players)
    .filter((p) => p.isStarter)
    .sort((a, b) => (a.surprise as number) - (b.surprise as number))
    .slice(0, limit);
}

/** Starters who had no forecast at all, and so are absent from both lists. */
export function unprojectedStarters(players: readonly RecapPlayer[]): number {
  return players.filter((p) => p.isStarter && p.projected == null).length;
}

/**
 * Score a roster's week twice: what it started, and the best it could have
 * started.
 *
 * The optimizer is the same greedy fill `/lineup` uses, run over the points
 * players actually scored instead of over a forecast. Reusing it rather than
 * re-deriving the slot maths is the point — the eligibility family is laminar
 * and the greedy fill is provably optimal over it, and that proof should live in
 * exactly one place.
 */
export function benchMissFor(
  teamName: string,
  roster: readonly RecapPlayer[],
): BenchMiss {
  // Keyed on the Ottoneu id: `matchup_lineups.player_id` (ours) can be null for
  // a player the ingest has not matched, and two nulls would collide.
  const asLineup: LineupPlayer[] = roster.map((p) => ({
    player_id: String(p.ottoneuId),
    name: p.name,
    position: p.position ?? "",
    nfl_team: p.nflTeam ?? "",
    ppg: 0,
    projected_ppg: 0,
    weekly_points: p.points,
  }));
  const byId = new Map(asLineup.map((p) => [p.player_id, p]));

  const best = optimizeLineup(asLineup, "weekly");
  const optimalIds = new Set(
    SLOT_IDS.map((id) => best[id]).filter((id): id is string => id != null),
  );
  const startedIds = new Set(
    roster.filter((p) => p.isStarter).map((p) => String(p.ottoneuId)),
  );

  const actual = roster
    .filter((p) => p.isStarter)
    .reduce((sum, p) => sum + p.points, 0);
  const optimal = lineupTotal(best, byId, "weekly");

  return {
    teamName,
    actual,
    optimal,
    // Floored at zero: the optimizer cannot do worse than the lineup that was
    // set, so a negative here would only ever be float noise.
    left: Math.max(0, optimal - actual),
    shouldHaveStarted: roster
      .filter((p) => optimalIds.has(String(p.ottoneuId)) && !startedIds.has(String(p.ottoneuId)))
      .sort(byPoints),
    shouldHaveSat: roster
      .filter((p) => startedIds.has(String(p.ottoneuId)) && !optimalIds.has(String(p.ottoneuId)))
      .sort((a, b) => a.points - b.points || a.name.localeCompare(b.name)),
  };
}

/** Every team's bench miss, biggest first. Teams that were perfect are kept. */
export function benchMisses(players: readonly RecapPlayer[]): BenchMiss[] {
  const rosters = new Map<string, RecapPlayer[]>();
  for (const player of players) {
    const list = rosters.get(player.teamName) ?? [];
    list.push(player);
    rosters.set(player.teamName, list);
  }
  return [...rosters.entries()]
    .map(([teamName, roster]) => benchMissFor(teamName, roster))
    .sort((a, b) => b.left - a.left || a.teamName.localeCompare(b.teamName));
}

/**
 * One side's totals. Falls back to the score stored on the game log when no
 * lineup has been scraped — a score with no lineup behind it still belongs on
 * the page, it just has nothing to be compared against.
 */
function sideOf(
  teamName: string,
  game: LiveGame | undefined,
  side: "home" | "away",
  fallback: number | null,
): RecapSide {
  const totals = game ? sideTotals(game[side].entries) : null;
  if (!totals || totals.starters === 0) {
    return { teamName, points: fallback ?? 0, pregame: null, beat: null };
  }
  return {
    teamName,
    // The box score's starters are what Ottoneu totals, so their sum *is* the
    // score — the same rule /scoreboard/[gameId] applies.
    points: totals.actual,
    pregame: totals.pregame,
    beat: totals.actual - totals.pregame,
  };
}

/** One week's games, joined to the lineups that produced the scores. */
export function recapGames(
  matchups: readonly Matchup[],
  lineups: Map<number, LiveGame>,
): RecapGame[] {
  return matchups.map((m) => {
    const game = lineups.get(m.game_id);
    const home = sideOf(m.home_team_name, game, "home", m.home_score);
    const away = sideOf(m.away_team_name, game, "away", m.away_score);
    const final = m.status === "final";
    const margin = Math.abs(home.points - away.points);

    const winner =
      !final || margin < 0.005
        ? null
        : home.points > away.points
          ? home.teamName
          : away.teamName;

    // An upset is the side that was projected lower winning it. Without both
    // projections there is nothing to have upset, so it stays null rather than
    // defaulting to false, which would read as "chalk".
    const upset =
      home.pregame == null || away.pregame == null || winner == null
        ? null
        : (home.pregame < away.pregame && winner === home.teamName) ||
          (away.pregame < home.pregame && winner === away.teamName);

    return {
      gameId: m.game_id,
      home,
      away,
      margin,
      winner,
      upset,
      combined: home.points + away.points,
      final,
    };
  });
}

/**
 * Competition ranking by points, 1 = highest. Teams level on points share a
 * rank — with two decimal places that is rare, but a shared week is a shared
 * week and inventing an order for it would put a fake fact on the page.
 */
function scoringRanks(points: { teamName: string; points: number }[]): Map<string, number> {
  const sorted = [...points].sort((a, b) => b.points - a.points);
  const ranks = new Map<string, number>();
  sorted.forEach((row, i) => {
    const previous = sorted[i - 1];
    ranks.set(
      row.teamName,
      previous && Math.abs(previous.points - row.points) < 0.005
        ? (ranks.get(previous.teamName) as number)
        : i + 1,
    );
  });
  return ranks;
}

/**
 * Every team's week, scoring order — the join between the game log, the stored
 * lineups and the ranking the hosts recorded before any of it was played.
 *
 * @param ranking Last recorded consolidated order for this week, best first,
 *                with each host's placement. Empty leaves the power-ranking
 *                columns null and the page says the week was never ranked.
 */
export function teamWeeks(
  games: readonly RecapGame[],
  ranking: readonly { teamName: string; rank: number; votes: VoterRank[] }[] = [],
): TeamWeek[] {
  const ranked = new Map(ranking.map((r) => [r.teamName, r]));
  const sides = games.flatMap((g) => [
    { side: g.home, opponent: g.away, game: g },
    { side: g.away, opponent: g.home, game: g },
  ]);
  const ranks = scoringRanks(sides.map((s) => ({ teamName: s.side.teamName, points: s.side.points })));

  return sides
    .map(({ side, opponent, game }) => {
      // Ranking and game log are assembled independently, so the two spellings
      // of a team name are matched rather than assumed identical.
      const entry =
        ranked.get(side.teamName) ??
        ranking.find((r) => sameTeamName(r.teamName, side.teamName)) ??
        null;
      const scoringRank = ranks.get(side.teamName) ?? 0;

      return {
        teamName: side.teamName,
        points: side.points,
        pregame: side.pregame,
        beat: side.beat,
        scoringRank,
        result: !game.final
          ? null
          : game.winner == null
            ? ("tie" as const)
            : game.winner === side.teamName
              ? ("win" as const)
              : ("loss" as const),
        opponent: opponent.teamName,
        opponentPoints: opponent.points,
        powerRank: entry?.rank ?? null,
        powerSurprise: entry ? entry.rank - scoringRank : null,
        votes: entry?.votes ?? [],
      };
    })
    .sort((a, b) => a.scoringRank - b.scoringRank || a.teamName.localeCompare(b.teamName));
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

/**
 * Assemble one week's recap.
 *
 * Returns null when the league has no stored schedule at all, or when the
 * requested season has no week worth recapping yet — the page renders an empty
 * state rather than a set of zeroes.
 *
 * React-cached so `generateMetadata` and the page body share one read; it is
 * four queries and a lineup optimisation per team.
 */
export const fetchWeeklyRecap = cache(
  async (requestedWeek?: number): Promise<WeeklyRecap | null> => {
    const league = await getLeagueStatus();
    if (!league) return null;

    const week = defaultRecapWeek(league.matchups, requestedWeek);
    if (week == null) return null;

    const weekGames = league.matchups.filter((m) => m.week === week);
    const teamNames = league.standings.map((row) => row.team_name);

    const [lineups, rankings] = await Promise.all([
      fetchLiveWeek(league.season, week),
      fetchWeekRankings(league.season, week, teamNames),
    ]);

    const players = recapPlayers([...lineups.values()]);
    const games = recapGames(weekGames, lineups);

    return {
      season: league.season,
      week,
      weeks: recapWeeks(league.matchups),
      complete: weekGames.every((m) => m.game_type !== "regular" || m.status === "final"),
      hasLineups: players.length > 0,
      games,
      teams: teamWeeks(games, rankings.rows),
      topPerformers: topPerformers(players),
      overachievers: overachievers(players),
      busts: busts(players),
      topBench: topBench(players),
      benchMisses: benchMisses(players),
      ranked: rankings.voters.length > 0,
      voters: rankings.voters,
      unprojected: unprojectedStarters(players),
      asOf: [...lineups.values()]
        .map((g) => g.scrapedAt)
        .filter((s): s is string => s != null)
        .sort()
        .pop() ?? null,
    };
  },
);
