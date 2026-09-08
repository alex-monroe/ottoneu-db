import { getAuthenticatedUser } from "@/lib/auth";
import { getViewerTeam } from "@/lib/viewer-team";
import { fetchLineupWeek } from "@/lib/lineup-data";
import LineupClient from "./LineupClient";

export const revalidate = 3600;

// Re-exported for callers that imported the type from this route.
export type { LineupTeam } from "@/lib/lineup-data";

interface Props {
  searchParams: Promise<{ week?: string; team?: string }>;
}

export default async function LineupPage({ searchParams }: Props) {
  const [params, user, viewerTeam] = await Promise.all([
    searchParams,
    getAuthenticatedUser(),
    getViewerTeam(),
  ]);
  const hasProjections = !!user?.hasProjectionsAccess;

  const requested = Number(params.week);
  const ctx = await fetchLineupWeek(
    Number.isInteger(requested) ? requested : undefined,
    hasProjections,
  );

  const requestedTeam = params.team
    ? ctx.teams.find((t) => t.team_name === params.team)?.team_name
    : undefined;
  const defaultTeam =
    requestedTeam ??
    (viewerTeam && ctx.teams.some((t) => t.team_name === viewerTeam)
      ? viewerTeam
      : null);

  return (
    <LineupClient
      teams={ctx.teams}
      hasProjections={hasProjections}
      defaultTeam={defaultTeam}
      season={ctx.season}
      week={ctx.week}
      weeks={ctx.weeks}
      hasWeekly={ctx.hasWeekly}
      viewerTeam={viewerTeam}
    />
  );
}
