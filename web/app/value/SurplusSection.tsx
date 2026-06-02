import {
  fetchHoverExtras,
  buildHoverDataMap,
  calculateSurplus,
  MY_TEAM,
} from "@/lib/analysis";
import { getStatsSeason } from "@/lib/season";
import { fetchPlayersEndOfSeason } from "@/lib/data";
import { getAuthenticatedUser } from "@/lib/auth";
import SurplusTables from "./SurplusTables";

/**
 * Surplus value rankings panel (bargains, overpaid, my team, FAs, team summary).
 * Fetches + computes server-side and hands serializable data to the client
 * SurplusTables (which builds the function-bearing columns).
 */
export default async function SurplusSection() {
  const [allPlayers, user, statsSeason] = await Promise.all([
    fetchPlayersEndOfSeason(),
    getAuthenticatedUser(),
    getStatsSeason(),
  ]);
  const { projMap, dsMap } = await fetchHoverExtras(!!user?.hasProjectionsAccess);
  const hoverDataMap = buildHoverDataMap(allPlayers, projMap, dsMap);
  const surplusPlayers = calculateSurplus(allPlayers);

  if (surplusPlayers.length === 0) {
    return (
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
        No surplus data available.
      </h2>
    );
  }

  // Best bargains (top 20 positive surplus, rostered)
  const rostered = surplusPlayers.filter(
    (p) => p.team_name != null && p.team_name !== "" && p.team_name !== "FA"
  );
  const bestBargains = [...rostered]
    .sort((a, b) => b.surplus - a.surplus)
    .slice(0, 20);

  // Most overpaid (bottom 20)
  const mostOverpaid = [...rostered]
    .sort((a, b) => a.surplus - b.surplus)
    .slice(0, 20);

  // My team
  const myTeam = rostered
    .filter((p) => p.team_name === MY_TEAM)
    .sort((a, b) => b.surplus - a.surplus);
  const myTotals = {
    salary: myTeam.reduce((s, p) => s + p.price, 0),
    value: myTeam.reduce((s, p) => s + p.dollar_value, 0),
    surplus: myTeam.reduce((s, p) => s + p.surplus, 0),
  };

  // Free agents
  const freeAgents = surplusPlayers
    .filter(
      (p) => p.team_name == null || p.team_name === "" || p.team_name === "FA"
    )
    .sort((a, b) => b.dollar_value - a.dollar_value)
    .slice(0, 20);

  // Per-team summary
  const teamMap = new Map<
    string,
    { players: number; total_salary: number; total_value: number; total_surplus: number }
  >();
  for (const p of rostered) {
    const t = p.team_name!;
    const entry = teamMap.get(t) ?? {
      players: 0,
      total_salary: 0,
      total_value: 0,
      total_surplus: 0,
    };
    entry.players++;
    entry.total_salary += p.price;
    entry.total_value += p.dollar_value;
    entry.total_surplus += p.surplus;
    teamMap.set(t, entry);
  }
  const teamSummary = [...teamMap.entries()]
    .map(([team_name, stats]) => ({
      team_name,
      ...stats,
      total_salary: Math.round(stats.total_salary),
      total_value: Math.round(stats.total_value),
      total_surplus: Math.round(stats.total_surplus),
    }))
    .sort((a, b) => b.total_surplus - a.total_surplus);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          Surplus Value Rankings ({statsSeason})
        </h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          Dollar value (from VORP) minus current salary. Positive surplus =
          bargain.
        </p>
      </header>

      <SurplusTables
        bestBargains={bestBargains}
        mostOverpaid={mostOverpaid}
        myTeam={myTeam}
        myTotals={myTotals}
        freeAgents={freeAgents}
        teamSummary={teamSummary}
        hoverDataMap={hoverDataMap}
      />
    </div>
  );
}
