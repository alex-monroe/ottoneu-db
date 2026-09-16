import Link from "next/link";
import { Flame, Snowflake, ListOrdered, Sofa, Trophy } from "lucide-react";
import { requirePodcaster } from "@/lib/auth";
import {
  fetchWeeklyRecap,
  type BenchMiss,
  type RecapGame,
  type RecapPlayer,
  type TeamWeek,
  type WeeklyRecap,
} from "@/lib/weekly-recap";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import { Th } from "@/components/TableParts";
import PositionBadge from "@/components/PositionBadge";
import PlayerName from "@/components/PlayerName";
import TeamName from "@/components/TeamName";
import WeekPicker from "./WeekPicker";

/**
 * The weekly recap — the page the hosts read off while recording.
 *
 * It is one week, looked at backwards, in the order the show tends to talk
 * about it: what happened in the six games, who went off, who did not, where the
 * ranking we recorded on Tuesday turned out to be wrong, and what was sitting on
 * everybody's bench. Every number is derived at read time in
 * `web/lib/weekly-recap.ts`; nothing here is stored.
 *
 * Deliberately a *wide* page of dense lists rather than a narrow article. It is
 * scanned live with a microphone open, so the job is to put as many usable facts
 * on one screen as will fit and label each one with where it came from.
 */

export const metadata = {
  title: "Weekly Recap | Ottoneu Analytics",
  description: "Episode prep: the week that was, from every angle the show uses",
};

// Lineups are re-scraped through the game windows and the hosts open this while
// a week is still settling, so it is never served from a cache.
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ week?: string }>;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function pts(value: number | null | undefined): string {
  return value == null ? "—" : value.toFixed(2);
}

function signed(value: number | null | undefined, digits = 1): string {
  if (value == null) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;
}

/** Green above, red below, quiet at zero — used for every delta on the page. */
function deltaClass(value: number | null | undefined): string {
  if (value == null || Math.abs(value) < 0.05) return "text-ink-subtle";
  return value > 0 ? "text-positive" : "text-negative";
}

function Delta({ value, digits = 1 }: { value: number | null; digits?: number }) {
  return (
    <span className={`tabular-nums ${deltaClass(value)}`}>{signed(value, digits)}</span>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  /** One line under the heading saying what the numbers mean. */
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
        {icon}
        {title}
      </h2>
      {hint && <p className="mt-1 max-w-prose text-sm text-ink-subtle">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** A headline number with the thing it belongs to underneath it. */
function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-sunken p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
      {detail && <p className="mt-0.5 truncate text-sm text-ink-muted">{detail}</p>}
    </div>
  );
}

function Chip({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "positive" | "negative" | "accent";
}) {
  const classes = {
    neutral: "bg-sunken text-ink-muted",
    positive: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
    negative: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
    accent: "bg-accent-soft text-accent-ink",
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${classes}`}
    >
      {children}
    </span>
  );
}

/** One side of a game card: name over score, with the projection beneath. */
function GameSide({
  teamName,
  points,
  pregame,
  beat,
  won,
  align,
}: {
  teamName: string;
  points: number;
  pregame: number | null;
  beat: number | null;
  won: boolean;
  align: "left" | "right";
}) {
  return (
    <div className={`min-w-0 ${align === "right" ? "text-right" : ""}`}>
      {/* Plain, not a TeamName link: the whole card is already a link to the
          game, and an anchor inside an anchor is invalid HTML that swallows
          clicks meant for the card. */}
      <div className="truncate text-sm font-semibold text-ink">{teamName}</div>
      <div
        className={`mt-0.5 text-xl font-bold tabular-nums sm:text-2xl ${
          won ? "text-ink" : "text-ink-muted"
        }`}
      >
        {pts(points)}
      </div>
      <div className="text-[11px] tabular-nums text-ink-subtle">
        proj {pts(pregame)} <Delta value={beat} />
      </div>
    </div>
  );
}

function GameCard({ game }: { game: RecapGame }) {
  return (
    <Link
      href={`/scoreboard/${game.gameId}`}
      className="block rounded-lg border border-line bg-raised p-4 transition-colors hover:border-accent"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 sm:gap-3">
        <GameSide
          teamName={game.away.teamName}
          points={game.away.points}
          pregame={game.away.pregame}
          beat={game.away.beat}
          won={game.winner === game.away.teamName}
          align="left"
        />
        <div className="flex w-16 flex-col items-center gap-1 pt-5 text-center sm:w-20">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
            {game.final ? "Final" : "Live"}
          </span>
          <span className="text-sm font-semibold tabular-nums text-ink-muted">
            {game.margin.toFixed(1)}
          </span>
        </div>
        <GameSide
          teamName={game.home.teamName}
          points={game.home.points}
          pregame={game.home.pregame}
          beat={game.home.beat}
          won={game.winner === game.home.teamName}
          align="right"
        />
      </div>
      {(game.upset || !game.final) && (
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          {game.upset && <Chip tone="accent">Upset</Chip>}
          {!game.final && <Chip>Still playing</Chip>}
        </div>
      )}
    </Link>
  );
}

/** Player identity cell, shared by all four player lists. */
function Player({ player }: { player: RecapPlayer }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="hidden shrink-0 sm:inline-flex">
        <PositionBadge position={player.position ?? player.slot} size="sm" />
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-1.5">
          <span className="truncate">
            <PlayerName name={player.name} ottoneuId={player.ottoneuId} />
          </span>
          {!player.isStarter && <Chip>Bench</Chip>}
        </span>
        <span className="block truncate text-[11px] text-ink-subtle">
          {player.nflTeam ?? "—"}
          {player.gameInfo ? ` · ${player.gameInfo}` : ""}
        </span>
      </span>
    </span>
  );
}

/**
 * One of the four player lists. They share a shape — who, for whom, what he
 * scored, what he was projected — and differ only in what they are sorted on,
 * so they share a renderer rather than four near-identical tables.
 */
function PlayerTable({
  players,
  empty,
}: {
  players: RecapPlayer[];
  empty: string;
}) {
  if (players.length === 0) {
    return <EmptyState title={empty} />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse">
        <thead className="bg-sunken">
          <tr>
            <Th>Player</Th>
            <Th>Roster</Th>
            <Th right>Pts</Th>
            <Th right>Proj</Th>
            <Th right>+/−</Th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr key={`${player.teamName}-${player.ottoneuId}`} className="border-t border-line">
              <td className="px-3 py-2 text-sm text-ink">
                <Player player={player} />
                {player.statLine && (
                  <span className="mt-0.5 block truncate text-[11px] text-ink-subtle">
                    {player.statLine}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-sm">
                <span className="block max-w-[10rem] truncate">
                  <TeamName name={player.teamName} />
                </span>
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-ink">
                {pts(player.points)}
              </td>
              <td className="px-3 py-2 text-right text-sm tabular-nums text-ink-subtle">
                {pts(player.projected)}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold">
                <Delta value={player.surprise} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const RESULT_TONE = {
  win: "text-positive",
  loss: "text-negative",
  tie: "text-ink-muted",
} as const;

/**
 * Where the ranking was wrong. Sorted by the size of the miss in both
 * directions, with each host's own placement spelled out — the argument is
 * about who ranked them there, not about the team.
 */
function RankingTable({
  teams,
  voters,
}: {
  teams: TeamWeek[];
  // Matched on userId, not on the display name: that name falls back to an
  // email's local part, which two accounts can share.
  voters: { userId: string; displayName: string }[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full min-w-[520px] border-collapse">
        <thead className="bg-sunken">
          <tr>
            <Th>Team</Th>
            <Th right>Scored</Th>
            <Th right>Scoring rank</Th>
            <Th right>Ranked</Th>
            <Th right>Miss</Th>
            {voters.map((voter) => (
              <Th key={voter.userId} right>
                {voter.displayName}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.teamName} className="border-t border-line">
              <td className="px-3 py-2 text-sm text-ink">
                <span className="block max-w-[12rem] truncate">
                  <TeamName name={team.teamName} />
                </span>
                {team.result && (
                  <span className={`text-[11px] font-medium ${RESULT_TONE[team.result]}`}>
                    {team.result === "win" ? "W" : team.result === "loss" ? "L" : "T"}{" "}
                    <span className="text-ink-subtle">
                      {pts(team.points)}–{pts(team.opponentPoints)} vs {team.opponent}
                    </span>
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-ink">
                {pts(team.points)}
                <span className="block text-[11px] font-normal">
                  <Delta value={team.beat} /> vs proj
                </span>
              </td>
              <td className="px-3 py-2 text-right text-sm tabular-nums text-ink-muted">
                {team.scoringRank}
              </td>
              <td className="px-3 py-2 text-right text-sm tabular-nums text-ink-muted">
                {team.powerRank ?? "—"}
              </td>
              <td className="px-3 py-2 text-right text-sm font-semibold">
                <Delta value={team.powerSurprise} digits={0} />
              </td>
              {voters.map((voter) => {
                const vote = team.votes.find((v) => v.userId === voter.userId);
                return (
                  <td
                    key={voter.userId}
                    className="px-3 py-2 text-right text-sm tabular-nums text-ink-subtle"
                    title={vote?.note ?? undefined}
                  >
                    {vote ? vote.rank : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BenchCard({ miss }: { miss: BenchMiss }) {
  return (
    <div className="rounded-lg border border-line bg-raised p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold">
          <TeamName name={miss.teamName} />
        </span>
        <span className="shrink-0 text-lg font-bold tabular-nums text-negative">
          −{miss.left.toFixed(1)}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] tabular-nums text-ink-subtle">
        started {miss.actual.toFixed(1)} of a possible {miss.optimal.toFixed(1)}
      </p>
      {miss.shouldHaveStarted.length > 0 ? (
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              Sat on the bench
            </dt>
            <dd className="text-ink">
              {miss.shouldHaveStarted.map((p) => (
                <span key={p.ottoneuId} className="mr-2 inline-block whitespace-nowrap">
                  {p.name}{" "}
                  <span className="tabular-nums text-positive">{pts(p.points)}</span>
                </span>
              ))}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
              Started instead
            </dt>
            <dd className="text-ink-muted">
              {miss.shouldHaveSat.map((p) => (
                <span key={p.ottoneuId} className="mr-2 inline-block whitespace-nowrap">
                  {p.name} <span className="tabular-nums">{pts(p.points)}</span>
                </span>
              ))}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-3 text-sm text-positive">Perfect lineup — nothing to say here.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function Headline({ recap }: { recap: WeeklyRecap }) {
  const scored = [...recap.teams].sort((a, b) => b.points - a.points);
  const high = scored[0];
  const low = scored[scored.length - 1];
  const closest = [...recap.games]
    .filter((g) => g.final)
    .sort((a, b) => a.margin - b.margin)[0];
  const leftTotal = recap.benchMisses.reduce((sum, m) => sum + m.left, 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {high && (
        <Stat label="Highest score" value={high.points.toFixed(2)} detail={high.teamName} />
      )}
      {low && (
        <Stat label="Lowest score" value={low.points.toFixed(2)} detail={low.teamName} />
      )}
      {closest && (
        <Stat
          label="Closest game"
          value={closest.margin.toFixed(2)}
          detail={`${closest.away.teamName} at ${closest.home.teamName}`}
        />
      )}
      <Stat
        label="Left on benches"
        value={leftTotal.toFixed(1)}
        detail="league-wide, in hindsight"
      />
    </div>
  );
}

export default async function WeeklyRecapPage({ searchParams }: Props) {
  const { week: weekParam } = await searchParams;
  await requirePodcaster("/podcast/recap");

  const requested = weekParam ? Number.parseInt(weekParam, 10) : undefined;
  const recap = await fetchWeeklyRecap(
    Number.isFinite(requested) ? requested : undefined,
  );

  if (!recap) {
    return (
      <PageShell width="narrow">
        <PageHeader
          eyebrow="Podcast"
          title="Weekly recap"
          description="The week that was, shaped for the show."
          links={[{ href: "/podcast", label: "Podcast tools" }]}
        />
        <EmptyState title="No week to recap yet">
          A recap needs a week with games in it. Once the first slate is under way,
          the schedule scrape (<code>just scrape-matchups</code>) and the lineup
          scrape (<code>just scrape-lineups</code>) fill this in.
        </EmptyState>
      </PageShell>
    );
  }

  // Both ends of the ranking miss, biggest first — the teams the ranking was
  // most wrong about in either direction, which is the whole segment.
  const rankingMisses = recap.ranked
    ? [...recap.teams]
        .filter((t) => t.powerSurprise != null)
        .sort((a, b) => Math.abs(b.powerSurprise as number) - Math.abs(a.powerSurprise as number))
    : [];

  return (
    <PageShell width="wide" gap="loose">
      <PageHeader
        eyebrow="Podcast · Episode prep"
        title={`Week ${recap.week} recap`}
        badge={recap.complete ? undefined : <Chip tone="negative">Week not finished</Chip>}
        description="Everything that happened, in the order the show tends to talk about it. Nothing here is stored — it is derived from the box scores, the projections frozen at kickoff, and the ranking you two recorded before any of it was played."
        links={[
          { href: `/scoreboard?week=${recap.week}`, label: "Scoreboard" },
          { href: `/podcast/power-rankings`, label: "This week's ballot" },
          { href: "/podcast", label: "Podcast tools" },
        ]}
      />

      <WeekPicker week={recap.week} weeks={recap.weeks} />

      {!recap.hasLineups && (
        <EmptyState title="No lineups stored for this week">
          Scores come from the game log, but the player-level sections need the box
          scores (<code>just scrape-lineups</code>). Until those land, this page can
          only show the six results.
        </EmptyState>
      )}

      <Headline recap={recap} />

      <Section
        icon={<Trophy size={18} className="text-ink-subtle" aria-hidden="true" />}
        title="The games"
        hint="Each side's actual against the sum of its own starters' pre-kickoff projections. An upset is the lower-projected side winning."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {recap.games.map((game) => (
            <GameCard key={game.gameId} game={game} />
          ))}
        </div>
      </Section>

      {recap.hasLineups && (
        <>
          <Section
            icon={<Flame size={18} className="text-ink-subtle" aria-hidden="true" />}
            title="Top performers"
            hint="The week's biggest hauls from players who were actually started, so every one of these counted for somebody."
          >
            <PlayerTable players={recap.topPerformers} empty="No scores stored yet" />
          </Section>

          <Section
            title="Biggest surprises against the projection"
            hint={
              <>
                Each player against the forecast frozen at his own kickoff — the number
                that was on the board before he played, not a revision published after.
                Overachievers include benched players, because a bench blow-up is a story
                about the manager; busts are starters only, because a quiet bench cost
                nobody anything.
                {recap.unprojected > 0 &&
                  ` ${recap.unprojected} started player${recap.unprojected === 1 ? "" : "s"} had no forecast at all and ${recap.unprojected === 1 ? "is" : "are"} left out of both lists.`}
              </>
            }
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
                  <Flame size={14} aria-hidden="true" />
                  Blew past it
                </h3>
                <PlayerTable players={recap.overachievers} empty="Nobody with a forecast to beat" />
              </div>
              <div>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
                  <Snowflake size={14} aria-hidden="true" />
                  Fell short of it
                </h3>
                <PlayerTable players={recap.busts} empty="Nobody with a forecast to miss" />
              </div>
            </div>
          </Section>
        </>
      )}

      <Section
        icon={<ListOrdered size={18} className="text-ink-subtle" aria-hidden="true" />}
        title={`Biggest surprises against the Week ${recap.week} ranking`}
        hint={
          recap.ranked ? (
            <>
              Where the consolidated ranking had each team on Tuesday against where they
              finished the week in scoring. <strong>Miss</strong> is ranked position minus
              scoring position: <span className="text-positive">positive</span> means they
              outscored the ranking, <span className="text-negative">negative</span> means
              it was too kind. The last columns are each host&apos;s own placement — hover
              one for the on-air note that went with it.
            </>
          ) : null
        }
      >
        {rankingMisses.length > 0 ? (
          <RankingTable teams={rankingMisses} voters={recap.voters} />
        ) : (
          <EmptyState title={`Week ${recap.week} was never ranked`}>
            No host ballot was locked in before this week, so there is no consolidated
            order to be wrong.{" "}
            <Link href={`/podcast/power-rankings?week=${recap.week}`} className="text-accent hover:underline">
              The Week {recap.week} ballot
            </Link>{" "}
            is still there if you want to see what you had.
          </EmptyState>
        )}
      </Section>

      {recap.hasLineups && (
        <Section
          icon={<Sofa size={18} className="text-ink-subtle" aria-hidden="true" />}
          title="Left on the bench"
          hint="Pure hindsight: the best lineup each roster could have set, scored on what players actually did. Nobody could have known — that is the bit."
        >
          <div className="grid gap-3 lg:grid-cols-3">
            {recap.benchMisses.slice(0, 3).map((miss) => (
              <BenchCard key={miss.teamName} miss={miss} />
            ))}
          </div>
          {recap.topBench.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
                Biggest scores that never counted
              </h3>
              <PlayerTable players={recap.topBench} empty="Every bench was quiet" />
            </div>
          )}
        </Section>
      )}

      <section className="space-y-2 border-t border-line pt-4 text-xs text-ink-subtle">
        <p>
          Scores and lineups are Ottoneu&apos;s own box scores. Projections are
          Sleeper&apos;s per-game forecasts re-scored under league rules and{" "}
          <em>frozen at kickoff</em>, so a player is measured against the number he
          carried into his game. A player with no forecast is left out of the surprise
          lists rather than credited with beating zero.
          {recap.asOf &&
            ` Lineups last read from Ottoneu ${new Date(recap.asOf).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })} ET.`}
        </p>
        <p>
          This page is a first pass and is meant to grow — new segments go in
          <code className="mx-1">web/lib/weekly-recap.ts</code> as pure functions over the
          same rows, then get a section here.
        </p>
      </section>
    </PageShell>
  );
}
