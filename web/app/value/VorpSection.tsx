import {
  fetchHoverExtras,
  buildHoverDataMap,
  calculateVorp,
  POSITIONS,
  MIN_GAMES,
  NUM_TEAMS,
  CAP_PER_TEAM,
} from "@/lib/analysis";
import {
  ROSTER_SPOTS,
  FULL_SEASON_GAMES,
  STARTING_LINEUP,
  FLEX_SLOTS,
  BENCH_DEPTH_PER_TEAM,
} from "@/lib/config";
import { distributableCap } from "@/lib/surplus";
import { getEffectiveStatsSeason } from "@/lib/stats-season";
import { fetchPlayersEndOfSeason } from "@/lib/data";
import { getAuthenticatedUser } from "@/lib/auth";
import VorpClient from "@/app/vorp/VorpClient";

/**
 * VORP analysis panel. Rendered inside the tabbed /value page; provides its own
 * data fetching but no page chrome (the parent supplies <main> + heading).
 */
export default async function VorpSection() {
  const [allPlayers, user, statsSeason] = await Promise.all([
    fetchPlayersEndOfSeason(),
    getAuthenticatedUser(),
    getEffectiveStatsSeason(),
  ]);
  const { players, replacementPpg, replacementN, salaryImpliedPpg } = calculateVorp(allPlayers);
  const { projMap, dsMap } = await fetchHoverExtras(!!user?.hasProjectionsAccess);
  const hoverDataMap = buildHoverDataMap(allPlayers, projMap, dsMap);

  if (players.length === 0) {
    return (
      <h2 className="text-2xl font-bold text-ink">
        No VORP data available.
      </h2>
    );
  }

  // Replacement benchmarks (exclude kickers)
  const positionsNoKickers = POSITIONS.filter(pos => pos !== 'K');
  const benchmarks = positionsNoKickers.map((pos) => ({
    position: pos,
    n: replacementN[pos] ?? 0,
    ppg: Math.round((replacementPpg[pos] ?? 0) * 100) / 100,
    salaryImplied:
      salaryImpliedPpg[pos] === undefined
        ? null
        : Math.round(salaryImpliedPpg[pos] * 100) / 100,
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
    player_id: p.player_id,
    ottoneu_id: p.ottoneu_id,
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
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-ink">
          VORP Analysis ({statsSeason})
        </h2>
        <p className="text-ink-subtle mt-2">
          Value Over Replacement Player — measures positional scarcity.
          Higher VORP = more valuable above replacement level.
        </p>
      </header>

      {/* Methodology */}
      <section className="bg-sunken rounded-lg p-5 border border-line space-y-4 text-sm text-ink-muted">
        <h3 className="text-lg font-semibold text-ink">
          How VORP Is Calculated
        </h3>

        <div>
          <h4 className="font-semibold text-ink-muted mb-1">
            1. Work out how many players actually start
          </h4>
          <p>
            Replacement level is derived from the lineup, not typed in by hand. Each of the{" "}
            {NUM_TEAMS} teams starts {STARTING_LINEUP.QB} QB, {STARTING_LINEUP.RB} RB,{" "}
            {STARTING_LINEUP.WR} WR, {STARTING_LINEUP.TE} TE and {FLEX_SLOTS} superflex, so the
            league starts {NUM_TEAMS * STARTING_LINEUP.RB} RBs and{" "}
            {NUM_TEAMS * STARTING_LINEUP.WR} WRs before the flex is filled. The{" "}
            {NUM_TEAMS * (FLEX_SLOTS + BENCH_DEPTH_PER_TEAM)} remaining slots — superflex
            plus the bye-week and injury cover every team carries — are then handed out one
            at a time to whichever position offers the best <em>next</em> player. The
            superflex slots go to quarterbacks in this format. Kickers are excluded throughout: every kicker clears
            at the salary floor, so there is no surplus to hand out.
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-ink-muted mb-1">
            2. Find replacement PPG
          </h4>
          <p>
            The replacement player at a position is the <em>last one worth a roster
            spot</em> once every team has filled its lineup plus bye-week and injury cover
            ({BENCH_DEPTH_PER_TEAM} spots per team). His PPG is the baseline. Only players
            with at least {MIN_GAMES} games played qualify for the pool. The benchmarks table below shows where each baseline landed, next to the
            older salary-implied estimate (the median PPG of the bottom-salary quartile of
            rostered players) for comparison — that one is kept as a diagnostic only, because
            it reads the market&apos;s own prices back into the values we then judge those
            prices against.
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-ink-muted mb-1">
            3. Calculate VORP per game
          </h4>
          <p>
            For each player: <code className="bg-sunken px-1.5 py-0.5 rounded text-xs">VORP/G = Player PPG - Replacement PPG</code>.
            A positive VORP/G means the player produces more per game than the worst
            player anyone is willing to start. A negative VORP/G means he belongs on a
            bench, where the market pays the salary floor.
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-ink-muted mb-1">
            4. Project to a full season
          </h4>
          <p>
            <code className="bg-sunken px-1.5 py-0.5 rounded text-xs">Full-Season VORP = VORP/G &times; {FULL_SEASON_GAMES}</code>.
            This extrapolates the per-game advantage over a full {FULL_SEASON_GAMES}-game NFL
            season, making it easy to compare players who missed time to those who played
            every week. It is a display scale only: it cancels out of the dollar conversion
            below, so it sets how VORP reads on screen rather than what anyone is worth.
          </p>
        </div>

        <div>
          <h4 className="font-semibold text-ink-muted mb-1">
            5. Convert to dollar value (used in Surplus Value)
          </h4>
          <p>
            An auction is a closed economy, so a dollar value is a share of a fixed pot
            rather than an absolute number. The league cap is {NUM_TEAMS} teams &times; $
            {CAP_PER_TEAM} = ${NUM_TEAMS * CAP_PER_TEAM}. Every one of the{" "}
            {NUM_TEAMS * ROSTER_SPOTS} roster spots has to be filled, and the cheapest a spot
            can be filled for is $1, so ${NUM_TEAMS * ROSTER_SPOTS} is committed before any
            bidding starts. That leaves{" "}
            <code className="bg-sunken px-1.5 py-0.5 rounded text-xs">
              ${distributableCap()} &divide; total league VORP
            </code>{" "}
            per point of full-season VORP. Each player is worth $1 plus his share, so the
            values sum to exactly the league cap. <em>Surplus</em> = dollar value - salary.
          </p>
        </div>

        <div className="border-t border-line pt-3">
          <h4 className="font-semibold text-ink-muted mb-1">
            Why this matters in superflex
          </h4>
          <p>
            Because the superflex slots go to quarterbacks, the league starts roughly{" "}
            {NUM_TEAMS * (STARTING_LINEUP.QB + FLEX_SLOTS)} of them out of maybe 20–22
            startable ones. Demand exceeds supply, so the QB baseline sits far higher than it
            would in a one-QB league and elite QBs tower above it. The top VORP chart is
            typically dominated by quarterbacks because it correctly captures the scarcity
            premium that makes QBs so expensive in superflex auctions — and, unlike a
            hand-set positional adjustment, nobody had to decide how big that premium should
            be. It falls out of counting the slots.
          </p>
        </div>
      </section>

      {/* Replacement Benchmarks */}
      <section className="bg-sunken rounded-lg p-5 border border-line">
        <h3 className="text-lg font-semibold text-ink mb-3">
          Replacement Level Benchmarks
        </h3>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr className="text-ink-subtle">
                <th className="pr-6 py-1 text-left font-medium">Position</th>
                <th className="pr-6 py-1 text-left font-medium">
                  Started Leaguewide
                </th>
                <th className="pr-6 py-1 text-left font-medium">
                  Replacement PPG
                </th>
                <th className="pr-6 py-1 text-left font-medium">
                  Salary-Implied (diagnostic)
                </th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.map((b) => (
                <tr
                  key={b.position}
                  className="text-ink-muted"
                >
                  <td className="pr-6 py-1 font-medium">{b.position}</td>
                  <td className="pr-6 py-1">{b.n}</td>
                  <td className="pr-6 py-1">{b.ppg.toFixed(2)}</td>
                  <td className="pr-6 py-1 text-ink-subtle">
                    {b.salaryImplied === null ? "—" : b.salaryImplied.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <VorpClient top15={top15} tableData={tableData} hoverDataMap={hoverDataMap} />
    </div>
  );
}
