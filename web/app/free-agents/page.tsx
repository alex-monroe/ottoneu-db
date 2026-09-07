import Link from "next/link";
import { requireProjectionsAccess } from "@/lib/auth";
import { getViewerTeam } from "@/lib/viewer-team";
import { fetchPlayersEndOfSeason } from "@/lib/data";
import { calculateSurplus } from "@/lib/surplus";
import { fetchWeeklyByPlayer } from "@/lib/weekly-projections";
import { fetchProjectionMap } from "@/lib/analysis";
import { getDisplayWeeks } from "@/lib/nfl-week";
import { getProjectionSeason } from "@/lib/season";
import { fetchRosterData, reconstructRostersAtDate } from "@/lib/roster-reconstruction";
import { sameTeamName } from "@/lib/teams";
import FreeAgentsClient, { type FreeAgentRow } from "./FreeAgentsClient";
import PageShell from "@/components/PageShell";
import DataFreshness from "@/components/DataFreshness";

// The wire moves daily in season; an hour is the same cadence as the rest.
export const revalidate = 3600;

export const metadata = {
  title: "Free Agents | Ottoneu Analytics",
  description: "Unrostered players ranked by value, comparable against your own roster.",
};

/** A player is a free agent when no team holds him. */
function isFreeAgent(teamName: string | null | undefined): boolean {
  const t = (teamName ?? "").trim();
  return t === "" || t.toUpperCase() === "FA";
}

export default async function FreeAgentsPage() {
  await requireProjectionsAccess("/free-agents");

  const [allPlayers, viewerTeam, display, projectionSeason, rosterData] =
    await Promise.all([
      fetchPlayersEndOfSeason(),
      getViewerTeam(),
      getDisplayWeeks(),
      getProjectionSeason(),
      fetchRosterData(),
    ]);

  const [projMap, weekly] = await Promise.all([
    fetchProjectionMap(projectionSeason),
    display.season != null && display.upcoming != null
      ? fetchWeeklyByPlayer(display.season, display.upcoming)
      : Promise.resolve(new Map()),
  ]);

  // Surplus is computed over the whole population, so a free agent's dollar
  // value is on the same scale as the rostered players you would drop.
  const surplus = calculateSurplus(allPlayers);

  const toRow = (p: (typeof surplus)[number]): FreeAgentRow => {
    const w = weekly.get(p.player_id);
    return {
      player_id: p.player_id,
      ottoneu_id: p.ottoneu_id,
      name: p.name,
      position: p.position,
      nfl_team: p.nfl_team,
      team_name: p.team_name ?? null,
      price: p.price,
      dollar_value: Math.round(p.dollar_value),
      ppg: p.ppg,
      games_played: p.games_played,
      projected_ppg: projMap[p.player_id]?.ppg ?? null,
      weekly_points: w?.projected_points ?? null,
      weekly_opponent: w?.opponent ?? null,
    };
  };

  const freeAgents = surplus
    .filter((p) => isFreeAgent(p.team_name))
    .map(toRow)
    .sort((a, b) => b.dollar_value - a.dollar_value);

  // The viewer's own roster, so "better than my WR3" is answerable on the page
  // instead of in another tab.
  const today = new Date().toISOString().slice(0, 10);
  const rosters = reconstructRostersAtDate(
    rosterData.transactions,
    rosterData.players,
    rosterData.stats,
    today,
    rosterData.leaguePrices,
  );
  const myRoster = viewerTeam
    ? (rosters.find((r) => sameTeamName(r.team_name, viewerTeam))?.players ?? [])
    : [];
  const myPlayers: FreeAgentRow[] = myRoster.map((p) => {
    const s = surplus.find((sp) => sp.player_id === p.player_id);
    const w = weekly.get(p.player_id);
    return {
      player_id: p.player_id,
      ottoneu_id: p.ottoneu_id,
      name: p.name,
      position: p.position,
      nfl_team: p.nfl_team,
      team_name: viewerTeam,
      price: p.salary,
      dollar_value: s ? Math.round(s.dollar_value) : 0,
      ppg: p.ppg ?? 0,
      games_played: p.games_played ?? 0,
      projected_ppg: projMap[p.player_id]?.ppg ?? null,
      weekly_points: w?.projected_points ?? null,
      weekly_opponent: w?.opponent ?? null,
    };
  });

  return (
    <PageShell>
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-ink">
            Free Agents
          </h1>
          <p className="mt-2 max-w-prose text-ink-subtle">
            Every unrostered player, ranked by dollar value on the same scale as the
            players you would drop. Filter by position to compare against your own
            roster{display.upcoming != null ? `, or sort by week ${display.upcoming} points to fill a hole this week` : ""}.
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <Link href="/lineup" className="text-accent hover:underline">
              Lineup planner →
            </Link>
            <Link href="/value?tab=surplus" className="text-accent hover:underline">
              Surplus rankings →
            </Link>
          </p>
        </header>
      <DataFreshness source="rosters" />

        <FreeAgentsClient
          freeAgents={freeAgents}
          myPlayers={myPlayers}
          viewerTeam={viewerTeam}
          week={display.upcoming}
        />
    </PageShell>
  );
}
