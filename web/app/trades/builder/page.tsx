import Link from "next/link";
import { LEAGUE_ID } from "@/lib/config";
import { requireProjectionsAccess } from "@/lib/auth";
import { getViewerTeam } from "@/lib/viewer-team";
import { sameTeamName } from "@/lib/teams";
import { fetchTradeBuilderData } from "@/lib/trade-builder-data";
import { tradeFromQuery } from "@/lib/trade-builder";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import { shortDate } from "../TradeCard";
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
  const params = await searchParams;
  const asked = Number(params.trade);
  const tradeId = Number.isInteger(asked) && asked > 0 ? asked : null;
  const [data, viewerTeam] = await Promise.all([fetchTradeBuilderData(tradeId), getViewerTeam()]);
  const replay = data.replay;

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

  // A replay link carries only the trade id; once someone edits the trade the
  // URL carries their selections too, and those win.
  const edited = ["a", "b", "as", "bs", "la", "lb"].some((k) => params[k] != null);
  const initial = replay && !edited ? { ...replay.trade } : tradeFromQuery(params);
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
      {tradeId != null && !replay && (
        <p className="rounded-md border border-line bg-sunken px-3 py-2 text-sm text-ink-muted">
          Trade {tradeId} isn&apos;t in the trade log, so this shows today&apos;s rosters.
        </p>
      )}
      {replay && (
        <div className="rounded-lg border border-accent bg-accent-soft px-4 py-3 text-sm text-ink">
          <p>
            <strong>
              Replaying a {replay.status === "pending" ? "pending" : "completed"} trade
              {replay.processedAt
                ? ` (${replay.status === "pending" ? "processes" : "processed"} ${shortDate(replay.processedAt)})`
                : replay.acceptedAt
                  ? ` (accepted ${shortDate(replay.acceptedAt)})`
                  : ""}
              .
            </strong>{" "}
            Rosters are shown as they were just before it; every value uses production through
            today, so this is the trade judged with what we know now.
          </p>
          {replay.missing.length > 0 && (
            <p className="mt-1 text-ink-muted">
              Not shown (not in our player table): {replay.missing.join(", ")}.
            </p>
          )}
          <p className="mt-2 flex flex-wrap gap-x-4">
            <a
              href={`https://ottoneu.fangraphs.com/football/${LEAGUE_ID}/view_trade/${replay.tradeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              On Ottoneu ↗
            </a>
            <Link href="/trades/builder" className="text-accent hover:underline">
              Start a new trade
            </Link>
          </p>
        </div>
      )}
      <TradeBuilderClient
        context={{
          teams: data.teams,
          capPerTeam: data.capPerTeam,
          rosterSpots: data.rosterSpots,
          remainingFraction: data.remainingFraction,
        }}
        initial={initial}
        replayTradeId={replay?.tradeId ?? null}
        viewerTeam={mine}
        windowLabel={data.window.shortLabel}
      />
    </PageShell>
  );
}
