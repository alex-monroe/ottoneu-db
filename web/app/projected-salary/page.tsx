import {
  fetchAndMergeData,
  fetchHoverExtras,
  buildHoverDataMap,
  analyzeProjectedSalary,
  CAP_PER_TEAM,
  POSITIONS,
} from "@/lib/analysis";
import { getAuthenticatedUser } from "@/lib/auth";
import { getViewerTeam } from "@/lib/viewer-team";
import ProjectedSalaryClient from "./ProjectedSalaryClient";
import SummaryCard from "@/components/SummaryCard";
import { EmptyState } from "@/components/states";
import PhaseNote from "@/components/PhaseNote";
import DataFreshness from "@/components/DataFreshness";

export default async function ProjectedSalaryPage() {
  const [allPlayers, user, viewerTeam] = await Promise.all([
    fetchAndMergeData(),
    getAuthenticatedUser(),
    getViewerTeam(),
  ]);
  const roster = analyzeProjectedSalary(allPlayers, viewerTeam);
  const { projMap, dsMap } = await fetchHoverExtras(!!user?.hasProjectionsAccess);
  const hoverDataMap = buildHoverDataMap(allPlayers, projMap, dsMap);

  if (roster.length === 0) {
    // Two different situations, and telling them apart is the whole point of
    // this page being viewer-relative: no team bound to the account, versus a
    // team that has no roster rows.
    return (
      <main className="min-h-screen bg-white dark:bg-black p-8">
        <div className="max-w-2xl mx-auto space-y-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Salary Analysis
          </h1>
          <EmptyState
            title={viewerTeam ? `No roster data for ${viewerTeam}` : "No team linked to your account"}
          >
            {viewerTeam
              ? "Keep-or-cut needs salaries and last season's production for your roster. Once both have been imported, this fills in."
              : "This page analyses your own roster, so it needs to know which team is yours. An admin can link it from the admin panel."}
          </EmptyState>
        </div>
      </main>
    );
  }

  const totalSalary = roster.reduce((s, p) => s + p.price, 0);
  const totalValue = roster.reduce((s, p) => s + p.dollar_value, 0);
  const totalSurplus = roster.reduce((s, p) => s + p.surplus, 0);
  const capSpace = CAP_PER_TEAM - totalSalary;

  // Group by position for tables
  const byPosition: Record<string, typeof roster> = {};
  for (const pos of POSITIONS) {
    const posPlayers = roster
      .filter((p) => p.position === pos)
      .sort((a, b) => b.surplus - a.surplus);
    if (posPlayers.length > 0) byPosition[pos] = posPlayers;
  }

  // Serialize for client
  const serialized = Object.entries(byPosition).map(([pos, players]) => ({
    pos,
    players: players.map((p) => ({
      player_id: p.player_id,
      ottoneu_id: p.ottoneu_id,
      name: p.name,
      position: p.position,
      nfl_team: p.nfl_team,
      price: p.price,
      dollar_value: p.dollar_value,
      surplus: p.surplus,
      ppg: p.ppg,
      total_points: p.total_points,
      games_played: p.games_played,
      recommendation: p.recommendation,
    })),
  }));

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Salary Analysis — {viewerTeam}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Keep vs. cut decisions based on surplus value (dollar value - salary).
            Accounts for positional scarcity via VORP.
          </p>
          <DataFreshness source="rosters" className="mt-1" />
        </header>

        <PhaseNote
          activeIn={["pre_keeper", "pre_draft"]}
          label="Keep-or-cut"
          opensOn="arb_end"
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard label="Total Salary" value={totalSalary} />
          <SummaryCard label="Total Value" value={totalValue} />
          <SummaryCard
            label="Total Surplus"
            value={totalSurplus}
            variant={totalSurplus >= 0 ? 'positive' : 'negative'}
          />
          <SummaryCard
            label="Cap Space"
            value={capSpace}
            variant={capSpace >= 0 ? 'positive' : 'negative'}
          />
        </div>

        <ProjectedSalaryClient positionGroups={serialized} hoverDataMap={hoverDataMap} />
      </div>
    </main>
  );
}
