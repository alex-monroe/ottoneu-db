import {
  fetchAndMergeData,
  calculateVorp,
  REPLACEMENT_LEVEL,
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
  const { players, replacementPpg } = calculateVorp(allPlayers);

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

  // Replacement benchmarks
  const benchmarks = POSITIONS.map((pos) => ({
    position: pos,
    rank: REPLACEMENT_LEVEL[pos],
    ppg: Math.round((replacementPpg[pos] ?? 0) * 100) / 100,
  }));

  // Top 15 overall for bar chart
  const top15 = [...players]
    .sort((a, b) => b.full_season_vorp - a.full_season_vorp)
    .slice(0, 15)
    .map((p) => ({
      name: p.name,
      position: p.position,
      full_season_vorp: p.full_season_vorp,
    }));

  // All players for table
  const tableData = players.map((p) => ({
    name: p.name,
    position: p.position,
    nfl_team: p.nfl_team,
    ppg: p.ppg,
    total_points: p.total_points,
    games_played: p.games_played,
    vorp_per_game: p.vorp_per_game,
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
              1. Define the replacement level
            </h3>
            <p>
              In a {NUM_TEAMS}-team superflex league, each team starts 1 QB + 1 superflex
              (almost always a QB), 2 RB, 2 WR, 1 TE, and 1 K. The <em>replacement level</em> is
              the Nth-best player at each position, where N approximates the number of
              fantasy-relevant starters across the league. Because superflex effectively
              requires 2 QBs per team, the QB replacement rank ({REPLACEMENT_LEVEL["QB"]}) is
              double the standard 1-QB league.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
              2. Find replacement PPG
            </h3>
            <p>
              Only players with at least {MIN_GAMES} games played qualify. For each position,
              all qualified players are ranked by total points. The player at
              the replacement rank sets the <em>replacement PPG</em> — the baseline
              production freely available on waivers. See the benchmarks table below
              for each position&apos;s current replacement PPG.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
              3. Calculate VORP per game
            </h3>
            <p>
              For each player: <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">VORP/G = Player PPG - Replacement PPG</code>.
              A positive VORP/G means the player produces more per game than a freely
              available replacement. A negative VORP/G means a waiver pickup would
              outscore them.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
              4. Project to a full season
            </h3>
            <p>
              <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">Full-Season VORP = VORP/G &times; 17</code>.
              This extrapolates the per-game advantage over a full 17-game NFL season,
              making it easy to compare players who missed time to those who played
              every week.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
              5. Convert to dollar value (used in Surplus Value)
            </h3>
            <p>
              The total league salary cap is {NUM_TEAMS} teams &times; ${CAP_PER_TEAM} = $
              {NUM_TEAMS * CAP_PER_TEAM}. We assume ~87.5% of that (${Math.round(NUM_TEAMS * CAP_PER_TEAM * 0.875)}) goes to above-replacement
              players. Each point of full-season VORP is worth{" "}
              <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                ${Math.round(NUM_TEAMS * CAP_PER_TEAM * 0.875)} &divide; total league VORP
              </code>
              , giving each player a dollar value. <em>Surplus</em> = dollar value - salary.
            </p>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
            <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
              Why this matters in superflex
            </h3>
            <p>
              Because each team needs ~2 starting QBs, the QB replacement level is much
              deeper (rank {REPLACEMENT_LEVEL["QB"]} vs. {REPLACEMENT_LEVEL["RB"]} for RB).
              Elite QBs tower above this deeper replacement
              baseline, producing very high VORP. This is why the top VORP chart is
              typically dominated by quarterbacks — it correctly captures the scarcity
              premium that makes QBs so expensive in superflex auctions.
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
                  <th className="pr-6 py-1 text-left font-medium">
                    Replacement Rank
                  </th>
                  <th className="pr-6 py-1 text-left font-medium">
                    Replacement PPG
                  </th>
                </tr>
              </thead>
              <tbody>
                {benchmarks.map((b) => (
                  <tr
                    key={b.position}
                    className="text-slate-800 dark:text-slate-200"
                  >
                    <td className="pr-6 py-1 font-medium">{b.position}</td>
                    <td className="pr-6 py-1">{b.rank}</td>
                    <td className="pr-6 py-1">{b.ppg.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <VorpClient top15={top15} tableData={tableData} />
      </div>
    </main>
  );
}
