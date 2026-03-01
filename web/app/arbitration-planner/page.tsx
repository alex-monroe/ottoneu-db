import { fetchAndMergeData, LEAGUE_ID, MY_TEAM } from "@/lib/analysis";
import { calculateSurplus } from "@/lib/surplus";
import { supabase } from "@/lib/supabase";
import type { PlannerPlayer, PlannerTeam } from "@/lib/types";
import PlannerClient from "./PlannerClient";

export const revalidate = 3600;

export default async function ArbitrationPlannerPage() {
  const allPlayers = await fetchAndMergeData();

  // Calculate surplus without adjustments (raw)
  const rawSurplus = calculateSurplus(allPlayers);

  // Fetch adjustments for adjusted surplus
  const { data: adjData } = await supabase
    .from("surplus_adjustments")
    .select("player_id, adjustment")
    .eq("league_id", LEAGUE_ID)
    .neq("adjustment", 0);

  const adjustments = new Map<string, number>(
    (adjData ?? []).map((r) => [String(r.player_id), Number(r.adjustment)])
  );
  const adjustedSurplus = calculateSurplus(allPlayers, adjustments);

  // Build lookup for adjusted values
  const adjustedMap = new Map(
    adjustedSurplus.map((p) => [p.player_id, p])
  );

  // Filter to opponent-owned players (exclude MY_TEAM, free agents, kickers)
  const opponentPlayers: PlannerPlayer[] = rawSurplus
    .filter(
      (p) =>
        p.team_name != null &&
        p.team_name !== "" &&
        p.team_name !== "FA" &&
        p.team_name !== MY_TEAM &&
        p.position !== "K"
    )
    .map((p) => {
      const adj = adjustedMap.get(p.player_id);
      return {
        player_id: p.player_id,
        name: p.name,
        position: p.position,
        nfl_team: p.nfl_team,
        price: p.price,
        team_name: p.team_name!,
        dollar_value: p.dollar_value,
        surplus: p.surplus,
        adjusted_surplus: adj ? adj.surplus : p.surplus,
      };
    });

  // Group by team
  const teamMap = new Map<string, PlannerPlayer[]>();
  for (const p of opponentPlayers) {
    const list = teamMap.get(p.team_name) ?? [];
    list.push(p);
    teamMap.set(p.team_name, list);
  }

  const teams: PlannerTeam[] = [...teamMap.entries()]
    .map(([team_name, players]) => ({
      team_name,
      players: players.sort((a, b) => b.surplus - a.surplus),
      total_salary: players.reduce((sum, p) => sum + p.price, 0),
    }))
    .sort((a, b) => a.team_name.localeCompare(b.team_name));

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto">
        <PlannerClient teams={teams} />
      </div>
    </main>
  );
}
