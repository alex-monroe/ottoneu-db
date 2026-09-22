import { calculateEarnedValue } from "@/lib/earned-value";
import { fetchPlayerSetEndOfSeason } from "@/lib/data";
import { fetchHoverExtras, buildHoverDataMap } from "@/lib/analysis";
import { getAuthenticatedUser } from "@/lib/auth";
import { getViewerTeam } from "@/lib/viewer-team";
import type { StatWindow } from "@/lib/stat-window";
import type { EarnedValuePlayer } from "@/lib/types";
import { FULL_SEASON_GAMES, NUM_TEAMS, ROSTER_SPOTS } from "@/lib/config";
import { EmptyState } from "@/components/states";
import StatWindowNote from "@/components/StatWindowNote";
import SummaryCard from "@/components/SummaryCard";
import EarnedTables from "./EarnedTables";

/**
 * What the league's salaries have actually bought.
 *
 * The other two panels on this page are *prospective*: they price a player from
 * his production and ask what he should cost. This one is retrospective, and it
 * is the panel that works while a season is being played. It takes the points
 * already on the board, prices them the way an auction would
 * (web/lib/earned-value.ts), and sets the result against the salary the roster
 * spot has cost over the same stretch of football.
 *
 * ## Why this is the in-season view
 *
 * Everything else here has to guess at the rest of the year. VORP and surplus
 * built on two games are a seventeen-game claim resting on two Sundays, and the
 * page says so. Earned value makes no claim about the rest of the season at all
 * — two weeks of points is a fact, and two weeks of salary is a fact, and the
 * difference between them is the only fully-settled thing on the page.
 *
 * ## The one comparison that has to be prorated
 *
 * Both sides are scaled to the window, so both are in the same units — see the
 * module doc in `earned-value.ts`. At two games of seventeen the dollars are
 * small, which is honest and also why **Return** is the column to read: dollars
 * earned per dollar paid is a ratio, so it is unaffected by the scale and by the
 * slight imprecision bye weeks put into it.
 */
export default async function EarnedSection({
  window: w,
}: {
  window: StatWindow;
}) {
  const [{ players }, user, viewerTeam] = await Promise.all([
    fetchPlayerSetEndOfSeason(w.season),
    getAuthenticatedUser(),
    getViewerTeam(),
  ]);
  const earned = calculateEarnedValue(players, w);

  if (earned.length === 0) {
    return (
      <EmptyState title="Nothing has been earned yet">
        This prices the points already scored in {w.season}. Once the stats
        import has a week of football in it, this fills in.
      </EmptyState>
    );
  }

  const { projMap, dsMap } = await fetchHoverExtras(!!user?.hasProjectionsAccess);
  const hoverDataMap = buildHoverDataMap(players, projMap, dsMap);

  const isRostered = (p: EarnedValuePlayer) =>
    p.team_name != null && p.team_name !== "" && p.team_name !== "FA";
  const rostered = earned.filter(isRostered);
  // A ratio needs a price to divide by, and a $0 row is an unpriced spot rather
  // than a free one — `return_on_salary` is null there by design.
  const priced = rostered.filter((p) => p.return_on_salary != null);

  const bestReturns = [...priced]
    .sort((a, b) => b.realized_surplus - a.realized_surplus)
    .slice(0, 20);
  const worstReturns = [...priced]
    .sort((a, b) => a.realized_surplus - b.realized_surplus)
    .slice(0, 20);
  const freeAgents = earned
    .filter((p) => !isRostered(p))
    .sort((a, b) => b.earned_value - a.earned_value)
    .slice(0, 20);

  const myTeam = rostered
    .filter((p) => viewerTeam != null && p.team_name === viewerTeam)
    .sort((a, b) => b.realized_surplus - a.realized_surplus);

  // Per-team: what each roster has paid over the window against what it earned.
  // The league's own shape, in-season — which is the question this page is for.
  const teamMap = new Map<
    string,
    { players: number; paid: number; earned: number }
  >();
  for (const p of rostered) {
    const entry = teamMap.get(p.team_name!) ?? { players: 0, paid: 0, earned: 0 };
    entry.players++;
    entry.paid += p.salary_to_date;
    entry.earned += p.earned_value;
    teamMap.set(p.team_name!, entry);
  }
  // Cents, to match what the money columns render — a team total rounded to one
  // decimal and then printed to two reads as false precision.
  const round = (v: number) => Math.round(v * 100) / 100;
  const teamSummary = [...teamMap.entries()]
    .map(([team_name, t]) => ({
      team_name,
      players: t.players,
      paid_to_date: round(t.paid),
      earned_to_date: round(t.earned),
      realized_surplus: round(t.earned - t.paid),
      return_on_salary: t.paid > 0 ? Math.round((t.earned / t.paid) * 100) / 100 : null,
    }))
    .sort((a, b) => b.realized_surplus - a.realized_surplus);

  const leaguePaid = rostered.reduce((s, p) => s + p.salary_to_date, 0);
  const leagueEarned = rostered.reduce((s, p) => s + p.earned_value, 0);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-ink">
          Earned Value — {w.label}
        </h2>
        <p className="text-ink-subtle mt-2">
          What the points already scored were worth, against what the roster spot
          has cost over the same football. Nothing here forecasts the rest of the
          season.
        </p>
      </header>

      <StatWindowNote window={w} what="earnings" />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Whole dollars: these run to the hundreds even prorated, where cents
            are noise. The per-player tables keep them. */}
        <SummaryCard
          label={w.complete ? "Salary on priced spots" : "Paid so far"}
          explain={w.complete ? undefined : "salary_to_date"}
          value={Math.round(leaguePaid)}
        />
        <SummaryCard
          label="Value earned"
          explain="earned_value"
          value={Math.round(leagueEarned)}
        />
        {/* Not a tautology but close to one: values sum to the prorated cap by
            construction, so this mostly measures how much of the cap sits on
            priced spots. It earns its place as the baseline the per-team Return
            column should be read against. */}
        <SummaryCard
          label="League return"
          explain="return_on_salary"
          value={
            leaguePaid > 0
              ? `${(leagueEarned / leaguePaid).toFixed(2)}×`
              : "—"
          }
        />
        <SummaryCard
          label="Football in these numbers"
          value={w.complete ? `${w.games} games` : `${w.games} of ${FULL_SEASON_GAMES}`}
        />
      </section>

      <section className="space-y-3 rounded-lg border border-line bg-sunken p-5 text-sm text-ink-muted">
        <h3 className="text-lg font-semibold text-ink">How to read this</h3>
        <p>
          <strong className="text-ink-muted">Earned</strong> is an auction price
          run backwards. The points each player scored are ranked within his
          position, baselined at the marginal player anyone would start, and the
          league&apos;s distributable cap is split across everything above that
          line — the same arithmetic the Surplus tab uses, pointed at what
          happened instead of at a projection. Availability is not modelled here,
          it is observed: a player who missed two games earned two games less.
        </p>
        {!w.complete && (
          <p>
            Both sides are scaled to the {w.games} game
            {w.games === 1 ? "" : "s"} played so far, so{" "}
            <strong className="text-ink-muted">Paid</strong> is a fraction of each
            salary rather than the whole thing — setting a fortnight of earnings
            against a full year&apos;s price is the one comparison that would make
            this lie. The dollars are therefore small. Read{" "}
            <strong className="text-ink-muted">Return</strong> instead: dollars
            earned per dollar paid, which is the same number whatever slice of
            season is in view. 1.00 is breaking even.
          </p>
        )}
        <p className="text-ink-subtle">
          Kickers and college prospects are left out — every kicker clears at the
          salary floor, so there is no surplus to hand him, and a prospect has no
          NFL production to price. The totals above therefore cover the{" "}
          {rostered.length} priced roster spots rather than all{" "}
          {NUM_TEAMS * ROSTER_SPOTS} in the league.
        </p>
        <p className="text-ink-subtle">
          One caveat worth knowing: this counts every point a player scored,
          including points scored on somebody&apos;s bench. It is the same
          convention every public player rater uses, which is what makes the
          numbers comparable outside this league.
        </p>
      </section>

      <EarnedTables
        bestReturns={bestReturns}
        worstReturns={worstReturns}
        myTeam={myTeam}
        freeAgents={freeAgents}
        teamSummary={teamSummary}
        hoverDataMap={hoverDataMap}
        viewerTeam={viewerTeam}
        complete={w.complete}
      />
    </div>
  );
}
