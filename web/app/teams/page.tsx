import Link from "next/link";
import { fetchLeagueStatus } from "@/lib/matchups";
import { fetchTeamNames, teamHref, sameTeamName } from "@/lib/teams";
import { getViewerTeam } from "@/lib/viewer-team";
import { formatRecord } from "@/lib/standings";
import PageShell from "@/components/PageShell";

export const revalidate = 3600;

export const metadata = {
  title: "Teams | Ottoneu Analytics",
  description: "Every team in the league — roster, cap, record and schedule.",
};

/**
 * The index for `/teams/[name]`. A small page, but it gives the team object a
 * front door: before this there was no route in the app where a team was the
 * subject rather than a string in somebody else's table.
 */
export default async function TeamsPage() {
  const [names, status, viewerTeam] = await Promise.all([
    fetchTeamNames(),
    fetchLeagueStatus(),
    getViewerTeam(),
  ]);

  const standingFor = (name: string) =>
    status?.standings.find((s) => sameTeamName(s.team_name, name)) ?? null;

  return (
    <PageShell>
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Teams
          </h1>
          <p className="mt-2 text-ink-subtle">
            All {names.length} teams in the league. Each page carries the roster,
            cap space, record and schedule{status?.season ? ` for ${status.season}` : ""}.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2">
          {names.map((name) => {
            const row = standingFor(name);
            const mine = sameTeamName(name, viewerTeam);
            return (
              <Link
                key={name}
                href={teamHref(name)}
                className={`rounded-lg border p-4 transition-colors ${
                  mine
                    ? "border-blue-300 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20"
                    : "border-line bg-raised hover:border-accent"
                }`}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink">
                    {name}
                    {mine && (
                      <span className="ml-2 text-xs font-medium text-accent">
                        your team
                      </span>
                    )}
                  </span>
                  {row && (
                    <span className="shrink-0 text-sm tabular-nums text-ink-subtle">
                      {formatRecord(row)}
                    </span>
                  )}
                </span>
                {row && (
                  <span className="mt-1 block text-sm text-ink-subtle">
                    {row.points_for.toFixed(1)} PF · rank {row.rank}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
    </PageShell>
  );
}
