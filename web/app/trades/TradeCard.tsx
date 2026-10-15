import { LEAGUE_ID } from "@/lib/config";
import {
  tradeTime,
  tradeTree,
  type AssetValue,
  type LeagueTrade,
  type SideValuation,
  type TradeTreeNode,
  type TradeValuation,
} from "@/lib/trades";
import PlayerName from "@/components/PlayerName";
import PositionBadge from "@/components/PositionBadge";
import TeamName from "@/components/TeamName";

/**
 * One trade, as two hauls side by side, each with what it is worth.
 *
 * Every number on the card is one of the three reads `web/lib/trades.ts`
 * defines — this season's prorated value, keeper value, and cap — and the
 * card says which is which, because a trade that wins one and loses another
 * is the interesting kind.
 */

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function dollars(n: number | null): string {
  if (n == null) return "—";
  return `$${Math.round(n)}`;
}

export function signed(n: number | null): string {
  if (n == null) return "—";
  const r = Math.round(n);
  if (r === 0) return "$0";
  return `${r > 0 ? "+" : "−"}$${Math.abs(r)}`;
}

export function toneOf(n: number | null): string {
  if (n == null || Math.round(n) === 0) return "text-ink-muted";
  return n > 0
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-red-700 dark:text-red-300";
}

/** "Oct 14, 2026" from a site-clock string. */
export function shortDate(local: string | null): string {
  if (!local) return "—";
  return new Date(`${local.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Thu Oct 16, 8:45 PM" — for a pending trade's processing time. */
function clockLabel(local: string): string {
  const [h, m] = local.slice(11, 16).split(":").map(Number);
  const hour = ((h + 11) % 12) + 1;
  const date = new Date(`${local.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${date}, ${hour}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Badge({ children, tone = "neutral" }: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "warning";
}) {
  const classes = {
    neutral: "bg-sunken text-ink-muted",
    accent: "bg-accent-soft text-accent-ink",
    warning: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${classes}`}>
      {children}
    </span>
  );
}

function AssetLine({ a }: { a: AssetValue }) {
  const p = a.asset;
  return (
    <li className="flex items-center justify-between gap-2 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        <span className="hidden shrink-0 sm:inline-flex">
          <PositionBadge position={p.position ?? "—"} size="sm" />
        </span>
        <span className="min-w-0 truncate">
          <PlayerName name={p.name} ottoneuId={p.ottoneuId ?? undefined} showRankTag={false} />
        </span>
      </span>
      <span className="flex shrink-0 gap-3 tabular-nums">
        <span className="w-10 text-right text-ink-muted" title="Salary">{dollars(p.amount)}</span>
        <span
          className="w-10 text-right text-ink"
          title={a.unprojected ? "No projection that season — priced at a roster spot" : "Projected value, this season"}
        >
          {dollars(a.value)}{a.unprojected ? "*" : ""}
        </span>
        <span
          className="w-10 text-right text-ink-muted"
          title={a.nextIsProxy
            ? "Keeper value: this season's projection standing in for next season's"
            : "Keeper value: next season's projected value less next season's salary"}
        >
          {dollars(a.keeperValue)}
        </span>
      </span>
    </li>
  );
}

function SideColumn({ side, other }: { side: SideValuation; other: SideValuation }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold">
        <TeamName name={side.team} /> <span className="font-normal text-ink-subtle">gets</span>
      </p>
      <div className="mt-1 flex justify-end gap-3 text-[10px] uppercase tracking-wide text-ink-subtle">
        <span className="w-10 text-right">Salary</span>
        <span className="w-10 text-right">Value</span>
        <span className="w-10 text-right">Keep</span>
      </div>
      {side.got.length > 0 || side.loanIn > 0 ? (
        <ul className="mt-1 space-y-1.5">
          {side.got.map((a) => (
            <AssetLine key={`${a.asset.name}-${a.asset.amount}`} a={a} />
          ))}
          {side.loanIn > 0 && (
            <li className="flex items-center justify-between text-sm">
              <span className="text-ink">
                Cap loan <span className="text-ink-subtle">from {other.team}</span>
              </span>
              <span className="tabular-nums text-ink">{dollars(side.loanIn)}</span>
            </li>
          )}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-ink-subtle">Nothing</p>
      )}
      <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2 text-xs">
        <div>
          <dt className="text-ink-subtle">This season</dt>
          <dd className={`font-semibold tabular-nums ${toneOf(side.seasonNet)}`}>{signed(side.seasonNet)}</dd>
        </div>
        <div>
          <dt className="text-ink-subtle">Keeper value</dt>
          <dd className={`font-semibold tabular-nums ${toneOf(side.keeperNet)}`}>{signed(side.keeperNet)}</dd>
        </div>
        <div>
          <dt className="text-ink-subtle">Cap room</dt>
          <dd className={`font-semibold tabular-nums ${toneOf(side.capNet)}`}>{signed(side.capNet)}</dd>
        </div>
      </dl>
    </div>
  );
}

function TreeList({ nodes }: { nodes: TradeTreeNode[] }) {
  return (
    <ul className="space-y-1 border-l border-line pl-3">
      {nodes.map((n) => (
        <li key={`${n.asset.name}-${n.asset.amount}`} className="text-sm">
          <span className="font-medium text-ink">{n.asset.name}</span>{" "}
          <span className="text-ink-subtle">{dollars(n.asset.amount)}</span>
          {n.flipped && (
            <div className="mt-1">
              <p className="text-xs text-ink-subtle">
                flipped {shortDate(tradeTime(n.flipped.trade))} to{" "}
                {n.flipped.trade.teams.find((t) => t !== n.asset.toTeam)} for
              </p>
              {n.flipped.received.length > 0 ? (
                <TreeList nodes={n.flipped.received} />
              ) : (
                <p className="text-xs text-ink-subtle">no players (cap or a loan only)</p>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function hasFlip(nodes: TradeTreeNode[]): boolean {
  return nodes.some((n) => n.flipped != null);
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export default function TradeCard({
  valuation,
  allTrades,
  showTree = true,
}: {
  valuation: TradeValuation;
  /** The whole log, for following each side's players into later trades. */
  allTrades: readonly LeagueTrade[];
  showTree?: boolean;
}) {
  const { trade, remaining, sides } = valuation;
  const trees = showTree
    ? sides.map((s) => ({ team: s.team, nodes: tradeTree(allTrades, trade, s.team) }))
    : [];
  const flipped = trees.filter((t) => hasFlip(t.nodes));

  return (
    <article className="rounded-lg border border-line bg-raised p-4">
      <header className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
        <span>{shortDate(tradeTime(trade))}</span>
        {trade.status === "pending" ? (
          <Badge tone="warning">
            Pending{trade.processedAt ? ` · processes ${clockLabel(trade.processedAt)}` : ""}
          </Badge>
        ) : null}
        {!trade.loansKnown && <Badge>From player cards · loans not visible</Badge>}
        {remaining != null && trade.status !== "removed" && (
          <span className="normal-case tracking-normal">
            {remaining >= 1 ? "before the season" : `${Math.round(remaining * 100)}% of season left`}
          </span>
        )}
        {trade.ottoneuTradeId && (
          <a
            href={`https://ottoneu.fangraphs.com/football/${LEAGUE_ID}/view_trade/${trade.ottoneuTradeId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto normal-case tracking-normal text-accent hover:underline"
          >
            On Ottoneu ↗
          </a>
        )}
      </header>
      <div className="mt-2 grid gap-5 sm:grid-cols-2">
        <SideColumn side={sides[0]} other={sides[1]} />
        <SideColumn side={sides[1]} other={sides[0]} />
      </div>
      {flipped.length > 0 && (
        <details className="mt-3 rounded-md bg-sunken px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-ink">
            What it turned into
          </summary>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            {flipped.map((t) => (
              <div key={t.team}>
                <p className="mb-1 text-xs font-semibold text-ink-subtle">
                  <TeamName name={t.team} plain /> received
                </p>
                <TreeList nodes={t.nodes} />
              </div>
            ))}
          </div>
        </details>
      )}
    </article>
  );
}
