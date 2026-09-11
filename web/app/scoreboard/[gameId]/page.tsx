import { cache } from "react";
import { notFound } from "next/navigation";
import { LEAGUE_ID } from "@/lib/config";
import { fetchMatchup } from "@/lib/matchups";
import { fetchLiveGame } from "@/lib/matchup-lineups";
import { fetchWeeklyAsOf } from "@/lib/weekly-projections";
import {
  benchOf,
  expectedPoints,
  pairStarters,
  type LineupEntry,
  type SideTotals,
} from "@/lib/live-matchup";
import type { Matchup } from "@/lib/standings";
import { getViewerTeam } from "@/lib/viewer-team";
import { sameTeamName } from "@/lib/teams";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import PositionBadge from "@/components/PositionBadge";
import PlayerName from "@/components/PlayerName";
import TeamName from "@/components/TeamName";

/**
 * One head-to-head game: both actual lineups, slot against slot, with each
 * player's original projection beside what he has scored — and the matchup
 * projection that falls out of the two as the week is played.
 *
 * Public, like /scoreboard: lineups and scores are league-wide facts on
 * Ottoneu's own box score, and the weekly projections shown here are the same
 * third-party numbers /lineup shows to anyone.
 */

// Lineups are re-scraped every half hour through game windows; five minutes
// keeps the page cheap without it ever being visibly behind a scrape.
export const revalidate = 300;

interface Props {
  params: Promise<{ gameId: string }>;
}

const TYPE_LABELS: Record<string, string> = {
  regular: "Regular season",
  playoff: "Playoff",
  championship: "Championship",
  third_place: "Third place",
  consolation: "Consolation",
};

// Request-scoped, so generateMetadata and the page share one read.
const fetchGame = cache(async (segment: string) => {
  const gameId = Number(segment);
  if (!Number.isInteger(gameId) || gameId <= 0) return null;
  return fetchMatchup(gameId);
});

async function load(params: Props["params"]) {
  return fetchGame((await params).gameId);
}

export async function generateMetadata({ params }: Props) {
  const game = await load(params);
  return {
    title: game
      ? `Week ${game.week}: ${game.home_team_name} vs ${game.away_team_name} | Ottoneu Analytics`
      : "Game | Ottoneu Analytics",
    description: "Both lineups, original projections, and the live matchup projection.",
  };
}

function fmt(value: number | null | undefined): string {
  return value == null ? "—" : value.toFixed(1);
}

function signed(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

/** The NFL game line with its state: a live dot, "Final", or the kickoff. */
function GameLine({ entry, align }: { entry: LineupEntry; align: "left" | "right" }) {
  const label =
    entry.game_state === "final"
      ? `Final · ${entry.game_info ?? ""}`
      : entry.game_state === "bye"
        ? "Bye"
        : (entry.game_info ?? entry.nfl_team ?? "");
  return (
    <span
      className={`flex items-center gap-1 text-xs text-ink-subtle ${
        align === "right" ? "flex-row-reverse" : ""
      }`}
    >
      {entry.game_state === "in_progress" && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-positive" aria-label="In progress" />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * Points over projection, stacked. Whichever of the two currently counts
 * toward the live projection is the prominent one: the projection until the
 * player's game starts, his points from then on.
 */
function Numbers({
  entry,
  align,
  compact = false,
}: {
  entry: LineupEntry;
  align: "left" | "right";
  /** Inline under the name, for phones, instead of a column beside it. */
  compact?: boolean;
}) {
  const started = entry.game_state !== "scheduled";
  const beat =
    entry.game_state === "final" && entry.points != null && entry.projected != null
      ? entry.points - entry.projected
      : null;
  return (
    <span
      className={
        compact
          ? `flex flex-wrap items-baseline gap-x-1.5 tabular-nums ${align === "right" ? "justify-end" : ""}`
          : `flex w-16 shrink-0 flex-col tabular-nums ${align === "right" ? "items-start" : "items-end"}`
      }
    >
      <span className={`text-sm font-semibold ${started ? "text-ink" : "text-ink-subtle"}`}>
        {started ? (entry.points ?? 0).toFixed(2) : "—"}
      </span>
      <span className="text-[11px] text-ink-subtle" title="Original weekly projection, frozen at kickoff">
        proj {fmt(entry.projected)}
        {beat != null && Math.abs(beat) >= 0.05 && (
          <span className={beat > 0 ? "text-positive" : "text-negative"}> {signed(beat)}</span>
        )}
      </span>
      {entry.game_state === "in_progress" && (
        <span className="text-[11px] text-ink-muted" title="Points so far plus the unplayed share of the projection">
          → {fmt(expectedPoints(entry))}
        </span>
      )}
    </span>
  );
}

function Player({
  entry,
  align,
  emptyText,
}: {
  entry: LineupEntry | null;
  align: "left" | "right";
  /** What an unfilled row says — a starting slot left empty is worth flagging; a shorter bench is not. */
  emptyText: string | null;
}) {
  if (!entry) {
    return (
      <span
        className={`block py-1 text-sm italic text-negative ${align === "right" ? "text-right" : ""}`}
      >
        {emptyText}
      </span>
    );
  }
  return (
    <span
      className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}
    >
      {/* The slot label already names the position on a phone; the badge
          would cost the player's name half its width. */}
      <span className="hidden shrink-0 sm:inline-flex">
        <PositionBadge position={entry.position ?? entry.slot} size="sm" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`flex items-baseline gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
          <span className="truncate">
            <PlayerName name={entry.player_name} ottoneuId={entry.ottoneu_id} />
          </span>
          {entry.injury_status && (
            <span className="shrink-0 text-[11px] font-semibold text-negative">
              {entry.injury_status}
            </span>
          )}
        </span>
        <GameLine entry={entry} align={align} />
        {entry.stat_line && (
          <span className="hidden truncate text-[11px] text-ink-subtle sm:block">{entry.stat_line}</span>
        )}
        <span className="block sm:hidden">
          <Numbers entry={entry} align={align} compact />
        </span>
      </span>
      <span className="hidden sm:flex">
        <Numbers entry={entry} align={align} />
      </span>
    </span>
  );
}

function Row({
  label,
  home,
  away,
  muted = false,
}: {
  label: string;
  home: LineupEntry | null;
  away: LineupEntry | null;
  /** Bench rows: shaded, and a missing entry is just a shorter bench. */
  muted?: boolean;
}) {
  const emptyText = muted ? null : "empty slot";
  return (
    <li
      className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2 px-2 py-2 sm:gap-x-4 sm:px-3 ${
        muted ? "bg-sunken/60" : "bg-raised"
      }`}
    >
      <Player entry={home} align="left" emptyText={emptyText} />
      <span className="w-9 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-subtle sm:w-10">
        {label}
      </span>
      <Player entry={away} align="right" emptyText={emptyText} />
    </li>
  );
}

function SideSummary({
  name,
  totals,
  score,
  align,
  mine,
  noLineup,
}: {
  name: string;
  totals: SideTotals;
  score: number;
  align: "left" | "right";
  mine: boolean;
  noLineup: boolean;
}) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      <div className="truncate text-sm font-semibold">
        <TeamName name={name} mine={mine} />
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-ink sm:text-3xl">{score.toFixed(2)}</div>
      <dl className="mt-2 space-y-0.5 text-xs tabular-nums sm:text-sm">
        <div className={`flex gap-2 ${align === "right" ? "justify-end" : ""}`}>
          <dt className="text-ink-subtle">
            Live<span className="hidden sm:inline"> projection</span>
          </dt>
          <dd className="font-semibold text-ink">{totals.live.toFixed(1)}</dd>
        </div>
        <div className={`flex gap-2 ${align === "right" ? "justify-end" : ""}`}>
          <dt className="text-ink-subtle">Pre-game</dt>
          <dd className="text-ink-muted">{totals.pregame.toFixed(1)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-xs text-ink-subtle">
        {noLineup
          ? "No lineup set"
          : `${totals.finished} done · ${totals.playing} playing · ${totals.toPlay} to play`}
      </p>
    </div>
  );
}

function Scoreboard({
  game,
  home,
  away,
  viewerTeam,
}: {
  game: Matchup;
  home: { name: string; totals: SideTotals };
  away: { name: string; totals: SideTotals };
  viewerTeam: string | null;
}) {
  // The box score's starters are what Ottoneu totals, so their sum is the
  // score; the stored team total is the fallback before the first scrape.
  const homeScore = home.totals.starters > 0 ? home.totals.actual : (game.home_score ?? 0);
  const awayScore = away.totals.starters > 0 ? away.totals.actual : (game.away_score ?? 0);
  const margin = home.totals.live - away.totals.live;
  const final = game.status === "final";
  const leader = margin >= 0 ? home.name : away.name;

  return (
    <section className="rounded-lg border border-line bg-raised p-4 sm:p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-3">
        <SideSummary
          name={home.name}
          totals={home.totals}
          score={homeScore}
          align="left"
          mine={sameTeamName(home.name, viewerTeam)}
          noLineup={home.totals.starters === 0}
        />
        <div className="flex w-20 flex-col items-center pt-7 text-center sm:w-28">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
            {final ? "Final" : "Projected"}
          </span>
          {!final && (
            <>
              <span
                className={`text-lg font-bold tabular-nums ${
                  Math.abs(margin) < 0.05 ? "text-ink-subtle" : "text-ink"
                }`}
              >
                {Math.abs(margin).toFixed(1)}
              </span>
              <span className="w-full truncate text-[11px] text-ink-subtle">
                {Math.abs(margin) < 0.05 ? "dead even" : `to ${leader}`}
              </span>
            </>
          )}
        </div>
        <SideSummary
          name={away.name}
          totals={away.totals}
          score={awayScore}
          align="right"
          mine={sameTeamName(away.name, viewerTeam)}
          noLineup={away.totals.starters === 0}
        />
      </div>
    </section>
  );
}

export default async function GamePage({ params }: Props) {
  const game = await load(params);
  if (!game) notFound();

  const [live, asOf, viewerTeam] = await Promise.all([
    fetchLiveGame(game.season, game.week, game.game_id),
    fetchWeeklyAsOf(game.season, game.week),
    getViewerTeam(),
  ]);

  const ottoneuUrl = `https://ottoneu.fangraphs.com/football/${LEAGUE_ID}/game/${game.game_id}`;
  const header = (
    <PageHeader
      eyebrow={`Week ${game.week} · ${TYPE_LABELS[game.game_type] ?? "Game"}`}
      title={
        <>
          <TeamName name={game.home_team_name} /> vs <TeamName name={game.away_team_name} />
        </>
      }
      links={[
        { href: `/scoreboard?week=${game.week}&season=${game.season}`, label: "Scoreboard" },
        { href: ottoneuUrl, label: "Box score on Ottoneu", external: true },
      ]}
    />
  );

  if (!live) {
    return (
      <PageShell width="narrow">
        {header}
        <EmptyState title="No lineups stored for this game">
          Lineups are read from Ottoneu&apos;s box score while a week is being played
          (<code>just scrape-lineups</code>, every half hour through game windows).
          Games from before lineups were first captured, and weeks not yet under way,
          have none.
        </EmptyState>
      </PageShell>
    );
  }

  const pairings = pairStarters(live.home.entries, live.away.entries);
  const homeBench = benchOf(live.home.entries);
  const awayBench = benchOf(live.away.entries);
  const benchRows = Math.max(homeBench.length, awayBench.length);

  return (
    <PageShell>
      {header}

      <Scoreboard
        game={game}
        home={{ name: live.home.team_name || game.home_team_name, totals: live.home.totals }}
        away={{ name: live.away.team_name || game.away_team_name, totals: live.away.totals }}
        viewerTeam={viewerTeam}
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
          Starters
        </h2>
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {pairings.map((p, i) => (
            <Row key={`${p.label}-${i}`} label={p.label} home={p.home} away={p.away} />
          ))}
        </ul>
      </section>

      {benchRows > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
            Bench
            <span className="ml-2 font-normal normal-case tracking-normal">
              points here do not count
            </span>
          </h2>
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
            {Array.from({ length: benchRows }, (_, i) => (
              <Row
                key={i}
                label="BN"
                home={homeBench[i] ?? null}
                away={awayBench[i] ?? null}
                muted
              />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2 text-xs text-ink-subtle">
        <p>
          <strong className="font-semibold text-ink-muted">Live projection</strong> = points
          from starters whose game is over, plus each unplayed starter&apos;s original
          projection, plus — for a starter mid-game — his points so far and the share of
          his projection the clock has not yet run through. <strong className="font-semibold text-ink-muted">Pre-game</strong> is
          the same lineup&apos;s original projections, summed.
        </p>
        <p>
          Projections are Sleeper&apos;s per-game forecasts re-scored under league
          rules, and each is <em>frozen at kickoff</em>: the number beside a player who
          has played is the one he was projected before his game, not a later revision.
          A player with no projection counts zero toward the live total.
          {asOf && ` Projections last refreshed ${new Date(asOf).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET.`}
          {live.scrapedAt &&
            ` Lineups and points read from Ottoneu ${new Date(live.scrapedAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET.`}
        </p>
      </section>
    </PageShell>
  );
}
