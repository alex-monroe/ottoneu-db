import {
  fetchRosterData,
  reconstructRostersAtDate,
} from "@/lib/roster-reconstruction";
import { fetchHoverExtras } from "@/lib/analysis";
import { getAuthenticatedUser } from "@/lib/auth";
import { MY_TEAM } from "@/lib/config";
import type { LineupPlayer } from "@/lib/lineup";
import LineupClient from "./LineupClient";

export const revalidate = 3600;

export interface LineupTeam {
  team_name: string;
  players: LineupPlayer[];
}

export default async function LineupPage() {
  const [data, user] = await Promise.all([
    fetchRosterData(),
    getAuthenticatedUser(),
  ]);
  const hasProjections = !!user?.hasProjectionsAccess;
  const { projMap } = await fetchHoverExtras(hasProjections);

  const today = new Date().toISOString().slice(0, 10);
  const rosters = reconstructRostersAtDate(
    data.transactions,
    data.players,
    data.stats,
    today,
    data.leaguePrices
  );

  const teams: LineupTeam[] = rosters.map((r) => ({
    team_name: r.team_name,
    players: r.players.map((p) => ({
      player_id: p.player_id,
      name: p.name,
      position: p.position,
      nfl_team: p.nfl_team,
      ppg: p.ppg ?? 0,
      projected_ppg: projMap?.[p.player_id]?.ppg ?? 0,
    })),
  }));

  return (
    <LineupClient
      teams={teams}
      hasProjections={hasProjections}
      defaultTeam={teams.some((t) => t.team_name === MY_TEAM) ? MY_TEAM : null}
    />
  );
}
