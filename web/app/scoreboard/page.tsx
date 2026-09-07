import { CalendarDays } from "lucide-react";
import ScoreboardCard from "@/components/ScoreboardCard";
import StandingsTable from "@/components/StandingsTable";
import { fetchLeagueStatus, fetchMatchupSeasons } from "@/lib/matchups";
import { formatRecord } from "@/lib/standings";
import WeekPicker from "./WeekPicker";
import { getViewerTeam } from "@/lib/viewer-team";
import { teamHref } from "@/lib/teams";
import Link from "next/link";

/**
 * The league's in-season status in one page: this week's scoreboard, the full
 * standings, and where the playoff field currently sits.
 *
 * Public — matchup results are league-wide facts anyone can read off Ottoneu,
 * so unlike the projection and valuation pages this one is not auth-gated.
 */

// Matchups are re-scraped every half hour while games are being played, so a
// long cache would show a stale Sunday score. Five minutes keeps the page cheap
// without it ever being visibly behind.
export const revalidate = 300;

interface Props {
  searchParams: Promise<{ week?: string; season?: string }>;
}

function Empty({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Scoreboard
        </h1>
        <p className="mt-4 text-slate-500 dark:text-slate-400">{message}</p>
      </div>
    </main>
  );
}

/** "September 9 to September 15" for a week's date window. */
function weekWindow(starts: string | null, ends: string | null): string | null {
  if (!starts || !ends) return null;
  const fmt = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(starts)} – ${fmt(ends)}`;
}

export default async function ScoreboardPage({ searchParams }: Props) {
  const params = await searchParams;
  // Null for anonymous visitors — this page is public, so the standings simply
  // highlight nobody rather than somebody else's team.
  const viewerTeam = await getViewerTeam();
  const seasons = await fetchMatchupSeasons();
  const requestedSeason = Number(params.season);
  const status = await fetchLeagueStatus(
    seasons.includes(requestedSeason) ? requestedSeason : undefined,
  );

  if (!status) {
    return (
      <Empty message="No schedule stored yet. Matchups are ingested from Ottoneu by `just scrape-matchups`." />
    );
  }

  const requestedWeek = Number(params.week);
  const week = status.weeks.includes(requestedWeek)
    ? requestedWeek
    : status.week ?? status.weeks[0];

  const slate = status.matchups.filter((m) => m.week === week);
  const window = weekWindow(slate[0]?.starts_on ?? null, slate[0]?.ends_on ?? null);
  const inField = status.playoffs.seeds.filter((s) => s.in_field);
  const chasing = status.playoffs.seeds.filter((s) => !s.in_field && !s.eliminated);

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Scoreboard
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            {status.season} head-to-head results and standings, scraped from the league.
            {!status.started && " The season has not started — this is the schedule as drawn."}
          </p>
          {/* The weekly loop runs scoreboard → your team → lineup; it used to
              dead-end here. */}
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {viewerTeam && (
              <Link href={teamHref(viewerTeam)} className="text-blue-600 dark:text-blue-400 hover:underline">
                {viewerTeam} →
              </Link>
            )}
            <Link href="/lineup" className="text-blue-600 dark:text-blue-400 hover:underline">
              Set a lineup →
            </Link>
          </p>
          <WeekPicker
            currentWeek={week}
            weeks={status.weeks}
            currentSeason={status.season}
            seasons={seasons}
          />
        </header>

        <section>
          <h2 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Week {week}
            {window && (
              <span className="inline-flex items-center gap-1.5 font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">
                <CalendarDays size={14} aria-hidden="true" />
                {window}
              </span>
            )}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {slate.map((m) => (
              <ScoreboardCard key={m.game_id} matchup={m} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Standings
          </h2>
          <StandingsTable playoffs={status.playoffs} viewerTeam={viewerTeam} />
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Derived from regular-season results only — playoff and consolation games do
            not count. Ties are broken by points for.
            {status.asOf && ` Last scraped ${new Date(status.asOf).toLocaleString()}.`}
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Playoff picture
          </h2>
          {!status.playoffs.started ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Nothing to project until the first games are final. The league takes{" "}
              {status.playoffs.slots} playoff teams.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
                  In the field ({status.playoffs.slots} spots)
                </h3>
                <ol className="space-y-1 text-sm">
                  {inField.map((s) => (
                    <li key={s.team_id} className="flex justify-between gap-3">
                      <span className="truncate text-slate-700 dark:text-slate-200">
                        {s.seed}. {s.team_name}
                        {s.clinched && (
                          <span className="ml-2 text-[11px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                            clinched
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                        {formatRecord(s)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">
                  Still chasing
                </h3>
                {chasing.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Everyone outside the field is mathematically eliminated.
                  </p>
                ) : (
                  <ol className="space-y-1 text-sm">
                    {chasing.map((s) => (
                      <li key={s.team_id} className="flex justify-between gap-3">
                        <span className="truncate text-slate-700 dark:text-slate-200">
                          {s.team_name}
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                          {formatRecord(s)} · {s.games_back} GB
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                  Clinched and eliminated are called only when the arithmetic settles
                  them outright; tiebreakers can decide a spot sooner than this says.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
