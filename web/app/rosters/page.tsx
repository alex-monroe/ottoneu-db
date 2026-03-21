import { fetchRosterData } from "@/lib/roster-reconstruction";
import { fetchProjectionMap, DEFAULT_PROJECTION_YEAR } from "@/lib/analysis";
import { getAuthenticatedUser } from "@/lib/auth";
import type { PlayerHoverData } from "@/lib/types";
import RostersClient from "./RostersClient";

export default async function RostersPage() {
  const [data, user] = await Promise.all([
    fetchRosterData(),
    getAuthenticatedUser(),
  ]);
  const projMap = user?.hasProjectionsAccess
    ? await fetchProjectionMap(DEFAULT_PROJECTION_YEAR)
    : null;

  // Build hoverDataMap from raw player + stats data
  const statsMap = new Map(data.stats.map((s) => [s.player_id, s]));
  const hoverDataMap: Record<string, PlayerHoverData> = {};
  for (const player of data.players) {
    const pStats = statsMap.get(player.id);
    if (!player.ottoneu_id) continue;
    hoverDataMap[player.id] = {
      ottoneu_id: player.ottoneu_id,
      position: player.position,
      nfl_team: player.nfl_team,
      price: 0, // salary varies by date — will show 0 as placeholder
      team_name: null,
      ppg: pStats?.ppg ?? 0,
      games_played: pStats?.games_played ?? 0,
      ...(projMap?.[player.id]
        ? {
            projected_ppg: projMap[player.id].ppg,
            projection_method: projMap[player.id].method,
          }
        : {}),
    };
  }

  return <RostersClient {...data} hoverDataMap={hoverDataMap} />;
}
