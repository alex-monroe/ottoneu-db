import Link from "next/link";
import { Lock } from "lucide-react";
import { getLiveAccessState } from "@/lib/auth";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import { Th } from "@/components/TableParts";
import { formatLeagueTime } from "@/lib/community-rankings";
import {
  fetchBoard,
  fetchDisplayName,
  fetchOwnPicks,
  fetchPickemWeek,
  pickResult,
  type Board,
  type GameSplit,
  type PickResult,
} from "@/lib/pickem";
import type { Matchup } from "@/lib/standings";
import PickSheet from "./PickSheet";
import WeekPicker from "./WeekPicker";

export const metadata = {
  title: "Pick'em | Ottoneu Analytics",
  description: "Pick the winner of every league matchup each week, and see how everyone did",
};

// Picks lock on a clock, the board is live on Sunday, and the sheet is per-account.
export const revalidate = 0;

interface Props {
  searchParams: Promise<{ week?: string }>;
}

const RESULT_STYLES: Record<PickResult, string> = {
  won: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  lost: "border-red-200 bg-red-50 text-red-800 line-through decoration-red-400/60 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200",
  push: "border-line bg-sunken text-ink-muted",
  pending: "border-line bg-raised text-ink-muted",
};

/** A game's score line, once there is one to show. */
function scoreLine(game: Matchup): string {
  if (game.status === "scheduled") return "Not started";
  const score = `${(game.away_score ?? 0).toFixed(2)} – ${(game.home_score ?? 0).toFixed(2)}`;
  return game.status === "final" ? `Final · ${score}` : `Live · ${score}`;
}

/** One side of a locked game: the team, and who picked it. */
function SidePickers({
  game,
  teamId,
  teamName,
  pickers,
  viewerPicked,
}: {
  game: Matchup;
  teamId: number;
  teamName: string;
  pickers: string[];
  viewerPicked: boolean;
}) {
  const result = pickResult(game, teamId);
  return (
    <div className="min-w-0">
      <p
        className={`text-sm ${result === "won" ? "font-semibold text-ink" : "text-ink-muted"}`}
      >
        {teamName}
        <span className="ml-1.5 text-xs font-normal text-ink-subtle">
          {pickers.length} pick{pickers.length === 1 ? "" : "s"}
        </span>
      </p>
      {pickers.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {pickers.map((name) => (
            <li
              key={name}
              className={`rounded border px-1.5 py-0.5 text-xs ${RESULT_STYLES[result]}`}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
      {viewerPicked && <p className="mt-1 text-xs font-medium text-accent">Your pick</p>}
    </div>
  );
}

function LockedGames({
  games,
  splits,
  ownPicks,
}: {
  games: Matchup[];
  splits: GameSplit[];
  ownPicks: Record<number, number>;
}) {
  const byGame = new Map(splits.map((s) => [s.gameId, s]));
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {games.map((game) => {
        const split = byGame.get(game.game_id);
        return (
          <li key={game.game_id} className="rounded-lg border border-line bg-raised p-3">
            <p className="mb-2 text-xs text-ink-subtle">{scoreLine(game)}</p>
            <div className="grid grid-cols-2 gap-3">
              <SidePickers
                game={game}
                teamId={game.away_team_id}
                teamName={game.away_team_name}
                pickers={split?.awayPickers ?? []}
                viewerPicked={ownPicks[game.game_id] === game.away_team_id}
              />
              <SidePickers
                game={game}
                teamId={game.home_team_id}
                teamName={game.home_team_name}
                pickers={split?.homePickers ?? []}
                viewerPicked={ownPicks[game.game_id] === game.home_team_id}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StandingsBoard({ board, games }: { board: Board; games: number }) {
  if (board.rows.length === 0) {
    return (
      <EmptyState title="Nobody played this week">
        The board fills in once someone makes a pick.
      </EmptyState>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-raised">
      <table className="w-full text-sm">
        <thead className="border-b border-line">
          <tr>
            <Th right>#</Th>
            <Th>Player</Th>
            <Th right>Correct</Th>
            <Th right>Wrong</Th>
            <Th right>Pending</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {board.rows.map((row) => (
            <tr key={row.displayName} className={row.isViewer ? "bg-accent-soft" : undefined}>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">
                {row.rank}
              </td>
              <td className="px-3 py-2 text-ink">
                {row.displayName}
                {row.isViewer && <span className="ml-1.5 text-xs text-accent">you</span>}
                {row.picked < games && (
                  <span className="ml-1.5 text-xs text-ink-subtle">
                    ({row.picked} of {games} picked)
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">
                {row.correct}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                {row.wrong}
                {row.pushes > 0 && (
                  <span className="ml-1 text-xs text-ink-subtle" title="Games that ended level">
                    +{row.pushes} tie
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-subtle">{row.pending}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Weekly pick'em — pick the winner of every league matchup, then see the board.
 *
 * Public, but only signed-in accounts can pick. Not gated in middleware: a
 * signed-out visitor sees the board and a sign-in prompt, the same shape as
 * `/power-rankings/vote`. Before the week locks the page shows the viewer's
 * own sheet and a count of players; everybody's picks appear only after the
 * lock, and that is decided in `lib/pickem.ts`, not here.
 */
export default async function PickemPage({ searchParams }: Props) {
  const { week: weekParam } = await searchParams;
  const requested = weekParam ? Number.parseInt(weekParam, 10) : undefined;
  const [live, ctx] = await Promise.all([
    getLiveAccessState(),
    fetchPickemWeek(Number.isNaN(requested) ? undefined : requested),
  ]);

  if (!ctx) {
    return (
      <PageShell>
        <PageHeader eyebrow="League" title="Pick'em" />
        <EmptyState title="No schedule yet">
          Pick&apos;em opens once this season&apos;s matchups are posted.
        </EmptyState>
      </PageShell>
    );
  }

  const [board, ownPicks, name] = await Promise.all([
    fetchBoard(ctx.season, ctx.week, ctx.games, ctx.revealed, live?.userId ?? null),
    live ? fetchOwnPicks(ctx.season, ctx.week, live.userId) : Promise.resolve({}),
    live ? fetchDisplayName(live.userId) : Promise.resolve(null),
  ]);
  const locksLabel = ctx.locksAt ? formatLeagueTime(ctx.locksAt) : null;
  const loginHref = `/login?redirect=${encodeURIComponent(`/pickem?week=${ctx.week}`)}`;

  return (
    <PageShell gap="loose">
      <PageHeader
        eyebrow="League"
        title={`Week ${ctx.week} pick'em`}
        description="Pick the winner of every matchup. One point for each right answer; a tied game counts for nobody. Everyone's picks are revealed when the week locks."
        links={[{ href: "/scoreboard", label: "Scoreboard" }]}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <WeekPicker week={ctx.week} weeks={ctx.weeks} />
        {locksLabel && (
          <p className="inline-flex items-center gap-1.5 text-sm text-ink-subtle">
            <Lock size={14} aria-hidden="true" />
            {ctx.open ? `Picks lock ${locksLabel}` : `Picks locked ${locksLabel}`}
          </p>
        )}
      </div>

      {ctx.open ? (
        live ? (
          <PickSheet
            season={ctx.season}
            week={ctx.week}
            games={ctx.games}
            records={ctx.records}
            initialPicks={ownPicks}
            initialName={name}
            suggestedName={live.teamName}
            locksLabel={locksLabel ?? ""}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent bg-accent-soft p-4">
            <p className="text-sm text-ink">
              <strong>Week {ctx.week} picks are open</strong> until {locksLabel}.
            </p>
            <Link
              href={loginHref}
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              Sign in to play
            </Link>
          </div>
        )
      ) : ctx.revealed ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-ink">Picks</h2>
          <LockedGames games={ctx.games} splits={board.splits} ownPicks={ownPicks} />
        </section>
      ) : (
        <EmptyState title={`Week ${ctx.week} isn't open for picks`}>
          The league calendar has no kickoff date for this season yet, so there is no lock time
          to pick against.
        </EmptyState>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Week {ctx.week} standings</h2>
        {board.revealed ? (
          <StandingsBoard board={board} games={ctx.games.length} />
        ) : (
          <p className="rounded-lg border border-line bg-raised p-4 text-sm text-ink-muted">
            {board.players === 0
              ? "Nobody has picked yet."
              : `${board.players} player${board.players === 1 ? " has" : "s have"} picks in.`}{" "}
            Everyone&apos;s picks and the standings appear when picks lock
            {locksLabel ? ` ${locksLabel}` : ""}.
          </p>
        )}
      </section>
    </PageShell>
  );
}
