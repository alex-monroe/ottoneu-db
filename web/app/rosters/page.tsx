import { fetchRosterData } from "@/lib/roster-reconstruction";
import { fetchHoverExtras } from "@/lib/analysis";
import { getAuthenticatedUser } from "@/lib/auth";
import type { PlayerHoverData } from "@/lib/types";
import RostersClient from "./RostersClient";

export default async function RostersPage() {
  const [data, user] = await Promise.all([
    fetchRosterData(),
    getAuthenticatedUser(),
  ]);
  const { projMap, dsMap } = await fetchHoverExtras(!!user?.hasProjectionsAccess);

  // Build hoverDataMap from raw player + stats data
  const statsMap = new Map(data.stats.map((s) => [s.player_id, s]));
  // Current salary/team come from league_prices (source of truth for the
  // current-roster view). The table can also show salary at a past date, but
  // the hover card is rendered server-side, so it reflects current salary.
  const priceMap = new Map(data.leaguePrices.map((lp) => [lp.player_id, lp]));
  const hoverDataMap: Record<string, PlayerHoverData> = {};
  for (const player of data.players) {
    const pStats = statsMap.get(player.id);
    if (!player.ottoneu_id) continue;
    const lp = priceMap.get(player.id);
    hoverDataMap[player.id] = {
      ottoneu_id: player.ottoneu_id,
      position: player.position,
      nfl_team: player.nfl_team,
      price: lp?.price ?? 0,
      team_name: lp?.team_name ?? null,
      ppg: pStats?.ppg ?? 0,
      games_played: pStats?.games_played ?? 0,
      ...(projMap?.[player.id]
        ? {
            projected_ppg: projMap[player.id].ppg,
            projection_method: projMap[player.id].method,
          }
        : {}),
      ...(dsMap?.[player.id]
        ? {
            ds_auction_value: dsMap[player.id].ds_auction_value,
            market_auction_value: dsMap[player.id].market_auction_value,
          }
        : {}),
    };
  }

  return <RostersClient {...data} hoverDataMap={hoverDataMap} />;
}
