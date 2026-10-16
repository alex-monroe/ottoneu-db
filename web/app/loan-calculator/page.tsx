import { fetchPlayersWithProjectedPpg, calculateSurplus, CAP_PER_TEAM } from "@/lib/analysis";
import { ANNUAL_RAISE_ACTIVE, MIN_PLAYER_SALARY } from "@/lib/config";
import { getLeagueStatus } from "@/lib/matchups";
import { isRealTeam } from "@/lib/roster-reconstruction";
import { getViewerTeam } from "@/lib/viewer-team";
import { estimateWeeklySd, FALLBACK_WEEKLY_SD, type LoanTradePlayer } from "@/lib/loan-trade";
import PageShell from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import LoanCalculatorClient from "./LoanCalculatorClient";

export const revalidate = 3600;

/**
 * Cap-loan trade calculator. The server gathers every rostered player with his
 * projected PPG and dollar value, plus the season's game log; the client runs
 * the valuation (web/lib/loan-trade.ts) as the trade is edited.
 */
export default async function LoanCalculatorPage() {
  const [players, status, viewerTeam] = await Promise.all([
    fetchPlayersWithProjectedPpg(),
    getLeagueStatus(),
    getViewerTeam(),
  ]);

  // Dollar values come from the same closed-economy model as /value. A player
  // the VORP pool leaves out is worth the floor.
  const values = new Map(calculateSurplus(players).map((p) => [p.player_id, p.dollar_value]));
  const rostered: LoanTradePlayer[] = players
    .filter((p) => isRealTeam(p.team_name))
    .map((p) => ({
      player_id: p.player_id,
      name: p.name,
      position: p.position,
      nfl_team: p.nfl_team,
      team_name: p.team_name as string,
      salary: p.price,
      ppg: p.ppg,
      dollar_value: values.get(p.player_id) ?? MIN_PLAYER_SALARY,
    }));

  if (!status || rostered.length === 0) {
    return (
      <PageShell width="narrow">
        <h1 className="text-3xl font-bold tracking-tight text-ink">Loan Trades</h1>
        <EmptyState title="No season to price against">
          The calculator needs this season&apos;s schedule and current rosters. Once
          both have been scraped, it fills in.
        </EmptyState>
      </PageShell>
    );
  }

  const measuredSd = estimateWeeklySd(status.matchups);

  return (
    <LoanCalculatorClient
      players={rostered}
      matchups={status.matchups}
      season={status.season}
      viewerTeam={viewerTeam}
      capPerTeam={CAP_PER_TEAM}
      annualRaise={ANNUAL_RAISE_ACTIVE}
      weeklySd={measuredSd ?? FALLBACK_WEEKLY_SD}
      weeklySdMeasured={measuredSd != null}
    />
  );
}
