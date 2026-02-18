import {
  fetchAndMergeData,
  calculateVorp,
  BENCH_REPLACEMENT_LEVEL,
  WAIVER_REPLACEMENT_LEVEL,
  POSITIONS,
  SEASON,
  MIN_GAMES,
  NUM_TEAMS,
  CAP_PER_TEAM,
} from "@/lib/analysis";
import VorpClient from "./VorpClient";

export const revalidate = 3600;

export default async function VorpPage() {
  const allPlayers = await fetchAndMergeData();
  const { players, waiverPpg, benchPpg } = calculateVorp(allPlayers);

  if (players.length === 0) {
    return (
      <main className="min-h-screen bg-white dark:bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            No VORP data available.
          </h1>
        </div>
      </main>
    );
  }

  // Replacement benchmarks (exclude kickers)
  const positionsNoKickers = POSITIONS.filter((pos) => pos !== "K");
  const benchmarks = positionsNoKickers.map((pos) => ({
    position: pos,
    benchRank: BENCH_REPLACEMENT_LEVEL[pos],
    waiverRank: WAIVER_REPLACEMENT_LEVEL[pos],
    benchPpgVal: Math.round((benchPpg[pos] ?? 0) * 100) / 100,
    waiverPpgVal: Math.round((waiverPpg[pos] ?? 0) * 100) / 100,
  }));

  // Top 15 overall for bar chart (sorted by waiver VORP = full_season_vorp)
  const top15 = [...players]
    .sort((a, b) => b.full_season_vorp - a.full_season_vorp)
    .slice(0, 15)
    .map((p) => ({
      name: p.name,
      position: p.position,
      full_season_vorp: p.full_season_vorp,
      vorp_vs_bench: p.vorp_vs_bench * 17,
    }));

  // All players for table
  const tableData = players.map((p) => ({
    name: p.name,
    position: p.position,
    nfl_team: p.nfl_team,
    ppg: p.ppg,
    total_points: p.total_points,
    games_played: p.games_played,
    vorp_vs_waiver: p.vorp_vs_waiver,
    vorp_vs_bench: p.vorp_vs_bench,
    full_season_vorp: p.full_season_vorp,
    price: p.price,
    team_name: p.team_name ?? "FA",
  }));

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            VORP Analysis ({SEASON})
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Value Over Replacement Player — measures positional scarcity.
            Higher VORP = more valuable above replacement level.
          </p>
        </header>

        {/* Methodology */}
        <section className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800 space-y-4 text-sm text-slate-700 dark:text-slate-300">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            How VORP Is Calculated
          </h2>

          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
              1. Two replacement tiers
            </h3>
            <p>
              This league uses 20-man rosters, so teams carry significant bench
              depth beyond starters. Two replacement baselines are tracked:
            </p>
            <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
              <li>
                <strong>vs Waiver</strong> — the best player <em>not on any roster</em> (freely
                acquirable, zero cost). This is the primary VORP metric used for salary
                decisions and surplus value.
              </li>
              <li>
                <strong>vs Bench</strong> — the worst player <em>still rostered</em> league-wide
                (floor of the rostered pool). Useful context for how many rostered players
                are truly replaceable.
              </li>
            </ul>
            <p className="mt-1">
              Replacement ranks are data-driven from actual roster snapshots at 5 points
              during the season (pre-season, Weeks 4, 8, 12, 16), averaged across all
              {NUM_TEAMS} teams. Kickers are excluded from VORP.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
              2. Find replacement PPG
            </h3>
            <p>
              Only players with at least {MIN_GAMES} games played qualify. For each position,
              qualified players are ranked by total points. The player at each replacement
              rank sets the baseline PPG. See the benchmarks table below.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
              3. Calculate VORP per game
            </h3>
            <p>
              For each player:{" "}
              <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                VORP/G = Player PPG − Replacement PPG
              </code>.{" "}
              A positive value means the player produces more than the baseline. Negative
              vs Waiver means a free agent would outscore them; negative vs Bench means
              even the worst rostered player outscores them.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
              4. Project to a full season
            </h3>
            <p>
              <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                Full-Season VORP = VORP/G &times; 17
              </code>.{" "}
              The bar chart and default table sort use full-season VORP vs Waiver.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
              5. Convert to dollar value (used in Surplus Value)
            </h3>
            <p>
              The total league salary cap is {NUM_TEAMS} teams &times; ${CAP_PER_TEAM} = $
              {NUM_TEAMS * CAP_PER_TEAM}. We assume ~87.5% of that ($
              {Math.round(NUM_TEAMS * CAP_PER_TEAM * 0.875)}) goes to above-replacement
              players. Each point of full-season VORP (vs Waiver) is worth{" "}
              <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                ${Math.round(NUM_TEAMS * CAP_PER_TEAM * 0.875)} &divide; total league VORP
              </code>
              , giving each player a dollar value. <em>Surplus</em> = dollar value − salary.
            </p>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
              Why this matters in superflex
            </h3>
            <p>
              Because each team needs ~2 starting QBs, and 20-man rosters allow backup QB
              stashing, the actual QB rostered pool is ~{WAIVER_REPLACEMENT_LEVEL["QB"]}{" "}
              players deep. Elite QBs tower above this deep baseline, producing very high
              VORP. This is why the top VORP chart is typically dominated by
              quarterbacks — it correctly captures the scarcity premium that makes QBs so
              expensive in superflex auctions.
            </p>
          </div>
        </section>

        {/* Replacement Benchmarks */}
        <section className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
            Replacement Level Benchmarks
          </h2>
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-slate-500 dark:text-slate-400">
                  <th className="pr-6 py-1 text-left font-medium">Position</th>
                  <th className="pr-6 py-1 text-left font-medium">Bench Rank</th>
                  <th className="pr-6 py-1 text-left font-medium">Bench PPG</th>
                  <th className="pr-6 py-1 text-left font-medium">Waiver Rank</th>
                  <th className="pr-6 py-1 text-left font-medium">Waiver PPG</th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map((b) => (
                  <tr
                    key={b.position}
                    className="text-slate-800 dark:text-slate-200"
                  >
                    <td className="pr-6 py-1 font-medium">{b.position}</td>
                    <td className="pr-6 py-1">{b.benchRank}</td>
                    <td className="pr-6 py-1">{b.benchPpgVal.toFixed(2)}</td>
                    <td className="pr-6 py-1">{b.waiverRank}</td>
                    <td className="pr-6 py-1">{b.waiverPpgVal.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Ranks derived from average rostered counts across 5 season snapshots. Waiver = first
            truly free player (Bench + 1).
          </p>
        </section>

        <VorpClient top15={top15} tableData={tableData} />
      </div>
    </main>
  );
}
