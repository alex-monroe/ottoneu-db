import { LEAGUE_ID } from "@/lib/config";
import { requireProjectionsAccess } from "@/lib/auth";
import { getViewerTeam } from "@/lib/viewer-team";
import { sameTeamName } from "@/lib/teams";
import { fetchTradeBuilderData } from "@/lib/trade-builder-data";
import { tradeFromQuery } from "@/lib/trade-builder";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import TradeBuilderClient from "./TradeBuilderClient";

/**
 * Test a trade before proposing it on Ottoneu: pick players (and a cap loan)
 * from two rosters and see what it does to each starting lineup, rest-of-season
 * value, keeper value, cap room and roster spots — all from this season's
 * production. The math is in `web/lib/trade-builder.ts`.
 *
 * Gated like `/trades` (it sits under that prefix in `PROJECTIONS_ROUTES`).
 */

export const metadata = {
  title: "Trade Builder | SOFA DB",
  description: "Test a trade against this season's production before you propose it.",
};

// Rosters move with every scrape; ten minutes matches /trades.
export const revalidate = 600;

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function TradeBuilderPage({ searchParams }: Props) {
  await requireProjectionsAccess("/trades/builder");
  const [params, data, viewerTeam] = await Promise.all([
    searchParams,
    fetchTradeBuilderData(),
    getViewerTeam(),
  ]);

  if (data.teams.length < 2) {
    return (
      <PageShell>
        <PageHeader title="Trade builder" />
        <EmptyState title="No rosters loaded yet">
          Rosters come from the roster CSV reconciliation (<code>just reconcile-roster</code>).
        </EmptyState>
      </PageShell>
    );
  }

  const initial = tradeFromQuery(params);
  const names = data.teams.map((t) => t.teamName);
  const mine = viewerTeam ? names.find((n) => sameTeamName(n, viewerTeam)) ?? null : null;
  if (!names.includes(initial.teamA)) initial.teamA = mine ?? names[0];
  if (!names.includes(initial.teamB) || initial.teamB === initial.teamA) {
    initial.teamB = names.find((n) => n !== initial.teamA) ?? "";
  }

  return (
    <PageShell>
      <PageHeader
        title="Trade builder"
        description={
          <>
            Pick what each team sends and see the trade from both sides, priced on{" "}
            <strong>{data.window.label}</strong> production, not projections: the starting lineup
            on season PPG, value for the weeks left at each player&apos;s pace, keeper value next
            season, cap room and roster spots. Copy the link to share the exact trade.
          </>
        }
        links={[
          { href: "/trades", label: "Trade history" },
          {
            href: `https://ottoneu.fangraphs.com/football/${LEAGUE_ID}/finances`,
            label: "Ottoneu finances (cap room)",
            external: true,
          },
        ]}
      />
      <TradeBuilderClient
        context={{
          teams: data.teams,
          capPerTeam: data.capPerTeam,
          rosterSpots: data.rosterSpots,
          remainingFraction: data.remainingFraction,
        }}
        initial={initial}
        viewerTeam={mine}
        windowLabel={data.window.shortLabel}
      />
    </PageShell>
  );
}
