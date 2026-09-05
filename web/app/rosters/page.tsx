import {
  fetchRosterData,
  fetchRosterSeasons,
  buildRosterSnapshots,
} from "@/lib/roster-reconstruction";
import { fetchHoverExtras } from "@/lib/analysis";
import { getSeasonContextNow } from "@/lib/season";
import { getAuthenticatedUser } from "@/lib/auth";
import type { PlayerHoverData } from "@/lib/types";
import RostersClient from "./RostersClient";

interface Props {
  searchParams: Promise<{ season?: string }>;
}

export default async function RostersPage({ searchParams }: Props) {
  const [params, seasons, user, ctx] = await Promise.all([
    searchParams,
    fetchRosterSeasons(),
    getAuthenticatedUser(),
    getSeasonContextNow(),
  ]);

  // Unknown/absent ?season falls back to the newest season we hold history for.
  const requested = Number(params.season);
  const season = seasons.includes(requested) ? requested : seasons[0] ?? ctx.leagueSeason;

  const data = await fetchRosterData(season);
  // Transactions come back oldest-first, so the first row is the start of the
  // replayable history — the floor on how far back the date picker may go.
  const earliestDate = data.transactions.find((t) => t.transaction_date)?.transaction_date ?? null;
  const snapshots = buildRosterSnapshots(ctx, undefined, { season, earliestDate });
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

  return (
    // Keying on the season remounts the client, so the date picker picks up the
    // newly selected season's default instead of holding a date outside it.
    <RostersClient
      key={season}
      {...data}
      hoverDataMap={hoverDataMap}
      season={season}
      seasons={seasons}
      statsSeason={season === ctx.leagueSeason ? ctx.statsSeason : season}
      quickDates={snapshots.quickDates}
      dateRange={snapshots.dateRange}
      defaultDate={snapshots.defaultDate}
    />
  );
}
