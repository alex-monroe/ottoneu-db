import {
  fetchPlayersWithProjectedPpg,
  fetchAndMergeProjectedData,
  fetchHoverExtras,
  buildHoverDataMap,
  analyzeArbitration,
  allocateArbitrationBudget,
  fetchPlayersPreArb,
  ARB_BUDGET_PER_TEAM,
  ARB_MIN_PER_TEAM,
  ARB_MAX_PER_TEAM,
  ARB_MAX_PER_PLAYER_PER_TEAM,
  NUM_TEAMS,
  LEAGUE_ID,
  getHistoricalSeasonsForYear,
} from "@/lib/analysis";
import { getStatsSeason, getProjectionSeason } from "@/lib/season";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/auth";
import ArbitrationTeams from "./ArbitrationTeams";
import ArbTargetsTable, { type ProjectedTarget } from "./ArbTargetsTable";
import ActiveModelCard from "@/components/ActiveModelCard";
import ModeToggle, { ValueMode } from "@/components/ModeToggle";

/**
 * Arbitration targets panel. Rendered inside the tabbed /arbitration page; the
 * value mode is owned by the parent and passed in.
 */
export default async function TargetsSection({ mode }: { mode: ValueMode }) {
  const isProjected = mode === "projected";
  const isAdjusted = mode === "adjusted";

  // Fetch adjustments in all modes (needed for indicator dot)
  const [user, statsSeason, projectionSeason] = await Promise.all([
    getAuthenticatedUser(),
    getStatsSeason(),
    getProjectionSeason(),
  ]);
  const adjRes = user
    ? await getSupabaseAdmin()
        .from("surplus_adjustments")
        .select("player_id, adjustment")
        .eq("league_id", LEAGUE_ID)
        .eq("user_id", user.userId)
        .neq("adjustment", 0)
    : { data: [], error: null };

  const hasAdjustments = (adjRes.data?.length ?? 0) > 0;

  let adjustments: Map<string, number> | undefined;
  if (isAdjusted && adjRes.data && adjRes.data.length > 0) {
    adjustments = new Map(
      adjRes.data.map((r) => [String(r.player_id), Number(r.adjustment)])
    );
  }

  // Fetch players with pre-arbitration salaries (after auto bump, before arb results)
  let allPlayers;
  if (isProjected) {
    allPlayers = await fetchAndMergeProjectedData(projectionSeason, fetchPlayersPreArb);
  } else {
    // Raw mode uses projected PPG as the base
    allPlayers = await fetchPlayersWithProjectedPpg(fetchPlayersPreArb);
  }

  const { projMap, dsMap } = await fetchHoverExtras(!!user?.hasProjectionsAccess);
  const hoverDataMap = buildHoverDataMap(allPlayers, projMap, dsMap);

  const targets = analyzeArbitration(allPlayers, adjustments) as ProjectedTarget[];

  if (targets.length === 0) {
    return (
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
        No arbitration targets found.
      </h2>
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

  const projectionYear = projectionSeason;
  const historicalSeasons = getHistoricalSeasonsForYear(projectionYear);
  const mostRecentSeason = Math.max(...historicalSeasons);

  return (
    <div className="space-y-8">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Arbitration Targets ({isProjected ? projectionYear : statsSeason})
            </h2>
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
            extraParams={{ tab: "targets" }}
            hasAdjustments={hasAdjustments}
          />
        </div>
        {isAdjusted && hasAdjustments && (
          <div className="mt-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2 text-sm text-blue-800 dark:text-blue-300">
            Showing results with your manual surplus adjustments applied.
          </div>
        )}
      </header>

      {/* Projection Methodology — driven by projection_models.is_active */}
      {isProjected && (
        <ActiveModelCard
          variant="blue"
          footer={
            <p className="text-xs text-blue-800/80 dark:text-blue-300/80 pt-1">
              Built from {historicalSeasons.join(", ")} history. College
              prospects fall back to positional rookie PPG averages.
            </p>
          }
        />
      )}

      {/* Budget Info */}
      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
          Arbitration Budget
        </h3>
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
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
          Top 20 Arbitration Targets
        </h3>
        {isProjected && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
            <strong>Obs PPG</strong> = actual {mostRecentSeason}{" "}
            season. <strong>Proj PPG</strong> = recency-weighted projection.
            Red rows = negative projected surplus after a $
            {ARB_MAX_PER_PLAYER_PER_TEAM} raise.
          </p>
        )}
        <ArbTargetsTable
          data={targets.slice(0, 20)}
          hoverDataMap={hoverDataMap}
          isProjected={isProjected}
        />
      </section>

      {/* Per-Team Sections */}
      <section>
        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
          Targets by Opponent
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Suggested allocation based on {isProjected ? "projected" : "number of vulnerable"} surplus per team.
        </p>
        <ArbitrationTeams teams={teamsData} showProjectionColumns={isProjected} hoverDataMap={hoverDataMap} />
      </section>
    </div>
  );
}
