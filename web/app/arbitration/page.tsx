import {
  fetchPlayersWithProjectedPpg,
  fetchAndMergeData,
  fetchAndMergeProjectedData,
  analyzeArbitration,
  allocateArbitrationBudget,
  ARB_BUDGET_PER_TEAM,
  ARB_MIN_PER_TEAM,
  ARB_MAX_PER_TEAM,
  ARB_MAX_PER_PLAYER_PER_TEAM,
  NUM_TEAMS,
  SEASON,
  LEAGUE_ID,
  PROJECTION_YEARS,
  DEFAULT_PROJECTION_YEAR,
  getHistoricalSeasonsForYear,
} from "@/lib/analysis";
import { ArbitrationTarget } from "@/lib/arb-logic";
import { supabase } from "@/lib/supabase";
import DataTable, { Column, HighlightRule } from "@/components/DataTable";
import ArbitrationTeams from "./ArbitrationTeams";
import ModeToggle, { ValueMode } from "@/components/ModeToggle";

interface Props {
  searchParams: Promise<{ mode?: string }>;
}

type ProjectedTarget = ArbitrationTarget & {
  observed_ppg?: number;
};

const BASE_COLUMNS: Column[] = [
  { key: "name", label: "Player" },
  { key: "position", label: "Pos" },
  { key: "nfl_team", label: "NFL Team" },
  { key: "team_name", label: "Owner" },
  { key: "price", label: "Salary", format: "currency" },
  { key: "dollar_value", label: "Value", format: "currency" },
  { key: "surplus", label: "Surplus", format: "currency" },
  { key: "salary_after_arb", label: "After Arb", format: "currency" },
  { key: "surplus_after_arb", label: "Surplus (Post-Arb)", format: "currency" },
];

const PROJECTED_COLUMNS: Column[] = [
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

export default async function ArbitrationPage({ searchParams }: Props) {
  const params = await searchParams;
  const mode: ValueMode =
    params.mode === "adjusted"
      ? "adjusted"
      : params.mode === "projected"
        ? "projected"
        : "raw";
  const isProjected = mode === "projected";
  const isAdjusted = mode === "adjusted";

  // Fetch adjustments in all modes (needed for indicator dot)
  const adjRes = await supabase
    .from("surplus_adjustments")
    .select("player_id, adjustment")
    .eq("league_id", LEAGUE_ID)
    .neq("adjustment", 0);

  const hasAdjustments = (adjRes.data?.length ?? 0) > 0;

  let adjustments: Map<string, number> | undefined;
  if (isAdjusted && adjRes.data && adjRes.data.length > 0) {
    adjustments = new Map(
      adjRes.data.map((r) => [String(r.player_id), Number(r.adjustment)])
    );
  }

  // Fetch players based on mode
  let allPlayers;
  if (isProjected) {
    allPlayers = await fetchAndMergeProjectedData(DEFAULT_PROJECTION_YEAR);
  } else {
    // Raw mode uses projected PPG as the base (same as before)
    allPlayers = await fetchPlayersWithProjectedPpg();
  }

  const targets = analyzeArbitration(allPlayers, adjustments) as ProjectedTarget[];

  if (targets.length === 0) {
    return (
      <main className="min-h-screen bg-white dark:bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            No arbitration targets found.
          </h1>
        </div>
      </main>
    );
  }

  const sortedTeams = allocateArbitrationBudget(targets);

  // When projected, augment team players with PPG data
  const teamsData = isProjected
    ? (() => {
      const targetsLookup = new Map(
        targets.map((t) => [`${t.name}|${t.team_name}`, t])
      );
      return sortedTeams.map(({ team, suggested, players }) => ({
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
    })()
    : sortedTeams;

  const projectionYear = DEFAULT_PROJECTION_YEAR;
  const historicalSeasons = getHistoricalSeasonsForYear(projectionYear);
  const mostRecentSeason = Math.max(...historicalSeasons);
  const columns = isProjected ? PROJECTED_COLUMNS : BASE_COLUMNS;

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                Arbitration Targets ({isProjected ? projectionYear : SEASON})
              </h1>
              <p className="text-slate-500 dark:text-slate-400 mt-2">
                {isProjected ? (
                  <>
                    Value based on <strong>projected future PPG</strong> rather than
                    observed {mostRecentSeason} performance. Use this to target
                    players whose value differs meaningfully from their recent stats.
                  </>
                ) : (
                  <>
                    Opponents&apos; players most vulnerable to a ${ARB_MAX_PER_PLAYER_PER_TEAM}{" "}
                    arbitration raise. Negative surplus after arb = likely cut.
                  </>
                )}
              </p>
            </div>
            <ModeToggle
              currentMode={mode}
              basePath="/arbitration"
              hasAdjustments={hasAdjustments}
            />
          </div>
          {isAdjusted && hasAdjustments && (
            <div className="mt-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2 text-sm text-blue-800 dark:text-blue-300">
              Showing results with your manual surplus adjustments applied.
            </div>
          )}
        </header>

        {/* Projection Methodology (only in projected mode) */}
        {isProjected && (
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
        )}

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
                ${ARB_MIN_PER_TEAM}-${ARB_MAX_PER_TEAM}
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
            Top 20 Arbitration Targets
          </h2>
          {isProjected && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
              <strong>Obs PPG</strong> = actual {mostRecentSeason}{" "}
              season. <strong>Proj PPG</strong> = recency-weighted projection.
              Red rows = negative projected surplus after a $
              {ARB_MAX_PER_PLAYER_PER_TEAM} raise.
            </p>
          )}
          <DataTable
            columns={columns}
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
            Suggested allocation based on {isProjected ? "projected" : "number of vulnerable"} surplus per team.
          </p>
          <ArbitrationTeams teams={teamsData} showProjectionColumns={isProjected} />
        </section>
      </div>
    </main>
  );
}
