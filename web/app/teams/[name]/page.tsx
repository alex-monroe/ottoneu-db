import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, LayoutGrid, Swords, Gavel, BarChart3 } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/auth";
import { getViewerTeam } from "@/lib/viewer-team";
import { fetchTeamPage, resolveTeamName, fetchTeamNames, type TeamGame } from "@/lib/teams";
import { formatRecord } from "@/lib/standings";
import { LEAGUE_ID, CAP_PER_TEAM } from "@/lib/config";
import PositionBadge from "@/components/PositionBadge";
import PlayerName from "@/components/PlayerName";
import TeamName from "@/components/TeamName";
import SummaryCard from "@/components/SummaryCard";

// Rosters move on trades and waiver claims; an hour is plenty.
export const revalidate = 3600;

interface Props {
  params: Promise<{ name: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { name } = await params;
  const teamName = await resolveTeamName(name);
  if (!teamName) return { title: "Team Not Found" };
  return {
    title: `${teamName} | Ottoneu Analytics`,
    description: `Roster, record, schedule and value summary for ${teamName}.`,
  };
}

/** Pre-render every current team; the set is 12 rows and changes yearly. */
export async function generateStaticParams() {
  const names = await fetchTeamNames();
  return names.map((name) => ({ name: encodeURIComponent(name) }));
}

function Section({ title, children, action }: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <span>{title}</span>
        {action}
      </h2>
      {children}
    </section>
  );
}

function GameRow({ game }: { game: TeamGame }) {
  const played = game.score != null && game.opponentScore != null;
  const tone =
    game.won === true
      ? "text-emerald-600 dark:text-emerald-400"
      : game.won === false
        ? "text-red-600 dark:text-red-400"
        : "text-slate-500 dark:text-slate-400";
  return (
    <tr className="border-t border-slate-100 dark:border-slate-800/70">
      <td className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">{game.week}</td>
      <td className="px-3 py-2 text-sm">
        <TeamName name={game.opponent} />
      </td>
      <td className={`px-3 py-2 text-right text-sm font-medium tabular-nums ${tone}`}>
        {game.won === true ? "W" : game.won === false ? "L" : played ? "—" : ""}
      </td>
      <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
        {played
          ? `${game.score!.toFixed(2)} – ${game.opponentScore!.toFixed(2)}`
          : (game.statusLabel ?? "Scheduled")}
      </td>
    </tr>
  );
}

export default async function TeamPage({ params }: Props) {
  const { name } = await params;
  const teamName = await resolveTeamName(name);
  if (!teamName) notFound();

  const [user, viewerTeam] = await Promise.all([
    getAuthenticatedUser(),
    getViewerTeam(),
  ]);
  const hasValue = !!user?.hasProjectionsAccess;
  const team = await fetchTeamPage(teamName, hasValue);
  const isMine = viewerTeam === teamName;

  const played = team.schedule.filter((g) => g.score != null);
  const upcoming = team.schedule.filter((g) => g.score == null);

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Header */}
        <header className="rounded-xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-black p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {team.teamName}
            </h1>
            {isMine && (
              <span className="rounded-full bg-blue-100 dark:bg-blue-950/60 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                Your team
              </span>
            )}
          </div>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            {team.standing ? (
              <>
                {formatRecord(team.standing)} · {team.standing.points_for.toFixed(1)} PF
                {team.rankOf ? ` · ${ordinal(team.standing.rank)} of ${team.rankOf}` : ""}
                {team.season ? ` · ${team.season}` : ""}
              </>
            ) : (
              "No games played yet this season."
            )}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Link href="/scoreboard" className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline">
              <Swords size={14} aria-hidden="true" /> Scoreboard
            </Link>
            <Link href="/lineup" className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline">
              <LayoutGrid size={14} aria-hidden="true" /> Lineup planner
            </Link>
            {hasValue && (
              <>
                <Link href="/value?tab=surplus" className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline">
                  <BarChart3 size={14} aria-hidden="true" /> Surplus rankings
                </Link>
                <Link href="/arbitration" className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline">
                  <Gavel size={14} aria-hidden="true" /> Arbitration
                </Link>
              </>
            )}
            {team.ottoneuTeamId != null && (
              <a
                href={`https://ottoneu.fangraphs.com/football/${LEAGUE_ID}/team/${team.ottoneuTeamId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 hover:underline"
              >
                On Ottoneu <ExternalLink size={13} aria-hidden="true" />
              </a>
            )}
          </div>
        </header>

        {/* Cap + value summary */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard label="Total Salary" value={team.totalSalary} />
          <SummaryCard
            label="Cap Space"
            value={team.capSpace}
            variant={team.capSpace >= 0 ? "positive" : "negative"}
          />
          {team.value ? (
            <>
              <SummaryCard label="Total Value" value={team.value.totalValue} />
              <SummaryCard
                label="Total Surplus"
                value={team.value.totalSurplus}
                variant={team.value.totalSurplus >= 0 ? "positive" : "negative"}
              />
            </>
          ) : (
            <>
              <SummaryCard label="Players" value={team.roster?.players.length ?? 0} />
              <SummaryCard label="Cap" value={CAP_PER_TEAM} />
            </>
          )}
        </div>

        {/* Roster */}
        <Section
          title={`Roster (${team.roster?.players.length ?? 0})`}
          action={
            <Link href="/rosters" className="text-xs font-medium normal-case tracking-normal text-blue-600 dark:text-blue-400 hover:underline">
              All rosters →
            </Link>
          }
        >
          {team.roster && team.roster.players.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[520px] border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr>
                    <Th>Player</Th>
                    <Th>Pos</Th>
                    <Th>NFL</Th>
                    <Th right>Salary</Th>
                    <Th right>PPG</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...team.roster.players]
                    .sort((a, b) => b.salary - a.salary)
                    .map((p) => (
                      <tr key={p.player_id} className="border-t border-slate-100 dark:border-slate-800/70">
                        <td className="px-3 py-2 text-sm">
                          <PlayerName name={p.name} ottoneuId={p.ottoneu_id} />
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <PositionBadge position={p.position} />
                        </td>
                        <td className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">{p.nfl_team}</td>
                        <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-900 dark:text-white">${p.salary}</td>
                        <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                          {p.ppg != null ? p.ppg.toFixed(2) : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No roster rows for this team.</p>
          )}
        </Section>

        {/* Arbitration exposure — the same danger-zone math, pointed inward */}
        {team.value && team.value.arbExposure.length > 0 && (
          <Section title="Most exposed to arbitration">
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              Players opponents can most profitably raise — surplus that survives the
              maximum single-team raise.
            </p>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[480px] border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr>
                    <Th>Player</Th>
                    <Th right>Salary</Th>
                    <Th right>Value</Th>
                    <Th right>Surplus after raise</Th>
                  </tr>
                </thead>
                <tbody>
                  {team.value.arbExposure.map((t) => (
                    <tr key={t.player_id} className="border-t border-slate-100 dark:border-slate-800/70">
                      <td className="px-3 py-2 text-sm">
                        <PlayerName name={t.name} ottoneuId={t.ottoneu_id} />
                      </td>
                      <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-900 dark:text-white">${t.price}</td>
                      <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">${Math.round(t.dollar_value)}</td>
                      <td className={`px-3 py-2 text-right text-sm tabular-nums font-medium ${
                        t.surplus_after_arb >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}>
                        ${Math.round(t.surplus_after_arb)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Schedule */}
        {team.schedule.length > 0 && (
          <Section title={`Schedule${team.season ? ` · ${team.season}` : ""}`}>
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full min-w-[420px] border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-900">
                  <tr>
                    <Th>Wk</Th>
                    <Th>Opponent</Th>
                    <Th right>Result</Th>
                    <Th right>Score</Th>
                  </tr>
                </thead>
                <tbody>
                  {[...played, ...upcoming].map((g) => (
                    <GameRow key={g.game_id} game={g} />
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {!hasValue && (
          <p className="rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400">
            Value and arbitration exposure for this team need projections access.{" "}
            <Link href="/access" className="text-blue-600 dark:text-blue-400 hover:underline">
              Check your access
            </Link>
            .
          </p>
        )}
      </div>
    </main>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
