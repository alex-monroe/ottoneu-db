import {
  fetchAndMergeProjectedData,
  analyzeArbitration,
  allocateArbitrationBudget,
  ARB_BUDGET_PER_TEAM,
  ARB_MIN_PER_TEAM,
  ARB_MAX_PER_TEAM,
  ARB_MAX_PER_PLAYER_PER_TEAM,
  NUM_TEAMS,
  PROJECTION_YEARS,
  DEFAULT_PROJECTION_YEAR,
  getHistoricalSeasonsForYear,
} from "@/lib/analysis";
import { ArbitrationTarget } from "@/lib/arb-logic";
import DataTable, { Column, HighlightRule } from "@/components/DataTable";
import ArbitrationTeams from "./ArbitrationTeams";
import ProjectionYearSelector from "@/components/ProjectionYearSelector";

export const revalidate = 3600;

interface Props {
  searchParams: Promise<{ year?: string }>;
}

// ArbitrationTarget at runtime carries observed_ppg / ppg from ProjectedPlayer spreads
type ProjectedTarget = ArbitrationTarget & {
  observed_ppg?: number;
};

const TARGET_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "NFL Team" },
  { key: "team_name", label: "Owner" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "observed_ppg", label: "Obs PPG", format: "decimal" },
  { key: "ppg", label: "Proj PPG", format: "decimal" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "surplus", label: "Surplus", format: "currency" },
  { key: "salary_after_arb", label: "After Arb", format: "currency" },
  { key: "surplus_after_arb", label: "Surplus (Post-Arb)", format: "currency" },
];

const ARB_TARGET_RULES: HighlightRule[] = [
  { key: "surplus_after_arb", op: "lt", value: 0, className: "bg-red-50 dark:bg-red-950/30" },
];

export default async function ProjectedArbitrationPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawYear = Number(params.year);
  const projectionYear = (PROJECTION_YEARS as readonly number[]).includes(rawYear)
    ? rawYear
    : DEFAULT_PROJECTION_YEAR;

  const historicalSeasons = getHistoricalSeasonsForYear(projectionYear);
  const projectedPlayers = await fetchAndMergeProjectedData(projectionYear);
  const targets = analyzeArbitration(projectedPlayers) as ProjectedTarget[];

  if (targets.length === 0) {
    return (
      <main className="min-h-screen bg-white dark:bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            No projected arbitration targets found.
          </h1>
        </div>
      </main>
    );
  }

  // Get suggested allocations, then augment player lists with observed_ppg + ppg
  const allocationTeams = allocateArbitrationBudget(targets);

  // Build a lookup from targets so we can add observed_ppg and ppg back
  const targetsLookup = new Map(
    targets.map((t) => [`${t.name}|${t.team_name}`, t])
  );

  const teamsWithProjections = allocationTeams.map(({ team, suggested, players }) => ({
    team,
    suggested,
    players: players.map((p) => {
      const full = targetsLookup.get(`${p.name}|${team}`);
      return {
        ...p,
        observed_ppg: full?.observed_ppg ?? 0,
        ppg: full?.ppg ?? 0,
      };
    }),
  }));

  const mostRecentSeason = Math.max(...historicalSeasons);

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Projected Arbitration Targets — {projectionYear}
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2">
                Value based on <strong>projected future PPG</strong> rather than
                observed {mostRecentSeason} performance. Use this to target
                players whose value differs meaningfully from their recent stats.
                {projectionYear >= 2026 && (
                  <> 2025 rookies are included via trajectory projection.</>
                )}
              </p>
            </div>
            <ProjectionYearSelector currentYear={projectionYear} years={PROJECTION_YEARS} />
          </div>
        </header>

        {/* Methodology callout */}
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-1">
            Projection Methodology
          </h2>
          <p className="text-sm text-blue-800 dark:text-blue-300">
            <strong>Games-weighted, recency-weighted average</strong> over{" "}
            {historicalSeasons.join(", ")} seasons. Weights:{" "}
            <code className="text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded">
              50% most recent / 30% prior / 20% oldest
            </code>
            , each scaled by{" "}
            <code className="text-xs bg-blue-100 dark:bg-blue-900 px-1 rounded">
              games_played / 17
            </code>{" "}
            to discount injury-shortened years. First-year players use a
            trajectory projection based on H2 vs H1 snap usage.
          </p>
        </div>

        {/* Budget Info */}
        <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
            Arbitration Budget
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-slate-500 dark:text-slate-400">Total Budget</p>
              <p className="font-bold text-slate-900 dark:text-white">
                ${ARB_BUDGET_PER_TEAM}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Per Team Range</p>
              <p className="font-bold text-slate-900 dark:text-white">
                ${ARB_MIN_PER_TEAM}–${ARB_MAX_PER_TEAM}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">
                Max Per Player (from you)
              </p>
              <p className="font-bold text-slate-900 dark:text-white">
                ${ARB_MAX_PER_PLAYER_PER_TEAM}
              </p>
            </div>
            <div>
              <p className="text-slate-500 dark:text-slate-400">Opponents</p>
              <p className="font-bold text-slate-900 dark:text-white">
                {NUM_TEAMS - 1}
              </p>
            </div>
          </div>
        </div>

        {/* Top 20 Targets */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            Top 20 Projected Arbitration Targets
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            <strong>Obs PPG</strong> = actual {mostRecentSeason}{" "}
            season. <strong>Proj PPG</strong> = recency-weighted projection.
            Red rows = negative projected surplus after a $
            {ARB_MAX_PER_PLAYER_PER_TEAM} raise.
          </p>
          <DataTable
            columns={TARGET_COLUMNS}
            data={targets.slice(0, 20)}
            highlightRules={ARB_TARGET_RULES}
          />
        </section>

        {/* Per-Team Sections */}
        <section>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
            Targets by Opponent
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Suggested allocation based on projected surplus per team.
          </p>
          <ArbitrationTeams teams={teamsWithProjections} />
        </section>
      </div>
    </main>
  );
}
