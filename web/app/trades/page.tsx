import Link from "next/link";
import { ArrowLeftRight, Clock, HandCoins, Route, TrendingDown } from "lucide-react";
import { LEAGUE_ID } from "@/lib/config";
import { fetchTradesPageData } from "@/lib/trades-data";
import { tradeTime, type SellOff, type TradeValuation } from "@/lib/trades";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import { Th } from "@/components/TableParts";
import TeamName from "@/components/TeamName";
import TradeCard, { dollars, shortDate, signed, toneOf } from "./TradeCard";

/**
 * The league's trades: what is pending, what was sold off and whether it paid,
 * how cap loans are used, and the whole log with each trade's afterlife.
 *
 * Gated with the other valuation pages (`PROJECTIONS_ROUTES`): every dollar on
 * it is a projection-derived value. All judgement is in `web/lib/trades.ts`;
 * see docs/references/trades.md for the method and its blind spots.
 */

export const metadata = {
  title: "Trades | SOFA DB",
  description: "Trade history, cap loans, sell-offs and pending trades, valued",
};

// The trade scrape runs every four hours; ten minutes keeps a pending trade's
// card current without re-reading every projection season on each view.
export const revalidate = 600;

interface Props {
  searchParams: Promise<{ team?: string; season?: string }>;
}

function Section({
  id,
  icon,
  title,
  hint,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
        {icon}
        {title}
      </h2>
      {hint && <div className="mt-1 max-w-prose text-sm text-ink-subtle">{hint}</div>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-sunken p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-subtle">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
      {detail && <p className="mt-0.5 text-sm text-ink-muted">{detail}</p>}
    </div>
  );
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;
}

function record(s: { wins: number; losses: number; ties: number }): string {
  return s.ties ? `${s.wins}-${s.losses}-${s.ties}` : `${s.wins}-${s.losses}`;
}

/** The biggest names a side gave up, for a one-line table cell. */
function headliners(s: SellOff["seller"]): string {
  const names = s.gave.slice(0, 3).map((a) => a.asset.name);
  const more = s.gave.length - names.length;
  return names.join(", ") + (more > 0 ? ` +${more}` : "");
}

function SellOffTable({ sellOffs }: { sellOffs: SellOff[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="min-w-full text-sm">
        <thead className="bg-sunken">
          <tr>
            <Th>Date</Th>
            <Th>Seller</Th>
            <Th>Standing then</Th>
            <Th>Sent</Th>
            <Th>To</Th>
            <Th right>This season</Th>
            <Th right>Loan out</Th>
            <Th right>Keeper value</Th>
            <Th right>Next season</Th>
            <Th right>Produced next yr</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {sellOffs.map((s) => (
            <tr key={s.valuation.trade.key} className="align-top">
              <td className="whitespace-nowrap px-3 py-2 text-ink-muted">{shortDate(tradeTime(s.valuation.trade))}</td>
              <td className="whitespace-nowrap px-3 py-2 font-medium"><TeamName name={s.seller.team} /></td>
              <td className="whitespace-nowrap px-3 py-2 text-ink-muted">
                {s.standingAtTrade
                  ? <>#{s.standingAtTrade.rank} ({record(s.standingAtTrade)}){s.standingAtTrade.basis === "last season" ? " last yr" : ""}</>
                  : "—"}
              </td>
              <td className="px-3 py-2 text-ink">{headliners(s.seller)}</td>
              <td className="whitespace-nowrap px-3 py-2"><TeamName name={s.buyer.team} /></td>
              <td className={`px-3 py-2 text-right tabular-nums ${toneOf(s.seller.seasonNet)}`}>{signed(s.seller.seasonNet)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{s.seller.loanOut ? dollars(s.seller.loanOut) : "—"}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${toneOf(s.seller.keeperNet)}`}>{signed(s.seller.keeperNet)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right text-ink-muted">
                {s.nextSeason
                  ? <>#{s.nextSeason.rank} ({record(s.nextSeason)}){s.nextSeason.complete ? "" : " so far"}</>
                  : "not yet"}
              </td>
              <td className={`px-3 py-2 text-right tabular-nums ${toneOf(s.seller.realizedNextNet)}`}>{signed(s.seller.realizedNextNet)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function filterChip(href: string, label: string, active: boolean) {
  return (
    <Link
      key={href}
      href={href}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
        active ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

export default async function TradesPage({ searchParams }: Props) {
  const params = await searchParams;
  const data = await fetchTradesPageData();
  const { valuations, pending, loans, sellOffs, verdict, travellers } = data;
  const allTrades = valuations.map((v) => v.trade);

  if (allTrades.length === 0) {
    return (
      <PageShell>
        <PageHeader title="Trades" />
        <EmptyState title="No trades stored yet">
          Trades are ingested from Ottoneu by <code>just scrape-trades</code> and the
          player-card scrape.
        </EmptyState>
      </PageShell>
    );
  }

  const processed = valuations.filter((v) => v.trade.status === "processed");
  const teams = [...new Set(allTrades.flatMap((t) => t.teams))].sort();
  const seasons = [...new Set(processed.map((v) => v.trade.season))].sort((a, b) => b - a);
  const team = teams.includes(params.team ?? "") ? params.team! : null;
  const season = seasons.includes(Number(params.season)) ? Number(params.season) : null;
  const log = processed.filter(
    (v) => (!team || v.trade.teams.includes(team)) && (!season || v.trade.season === season),
  );
  const latestLoanSeason = loans.bySeason[0];
  const losingSellOffs = sellOffs.filter((s) => s.wasLosing);
  const query = (next: { team?: string | null; season?: number | null }) => {
    const q = new URLSearchParams();
    const t = next.team === undefined ? team : next.team;
    const s = next.season === undefined ? season : next.season;
    if (t) q.set("team", t);
    if (s) q.set("season", String(s));
    const str = q.toString();
    return `/trades${str ? `?${str}` : ""}#log`;
  };

  return (
    <PageShell gap="loose">
      <PageHeader
        title="Trades"
        description={
          <>
            Every trade on record since {shortDate(data.historyFrom)}, valued three ways per side:
            <strong> this season</strong> (projected dollar value in minus out, prorated by the season
            left), <strong>keeper value</strong> (next season&apos;s value above next season&apos;s
            salary — a contract you would cut counts as zero) and <strong>cap room</strong> (salary and
            loans, this season only). Values use the model&apos;s preseason projection for the
            trade&apos;s season.
          </>
        }
        links={[
          { href: "/trades/builder", label: "Build a trade" },
          { href: "#pending", label: "Pending" },
          { href: "#sell-offs", label: "Sell-offs" },
          { href: "#loans", label: "Loans" },
          { href: "#log", label: "Trade log" },
          {
            href: `https://ottoneu.fangraphs.com/football/${LEAGUE_ID}/trade_history`,
            label: "Ottoneu trade history",
            external: true,
          },
        ]}
      />

      {!data.hasTradeHistory && (
        <EmptyState title="Loans and pending trades are not loaded yet">
          Only player-card trades are stored. Run <code>just scrape-trades</code> (or the
          Scrape Trade History workflow) to add cap loans and pending trades.
        </EmptyState>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Trades on record" value={String(processed.length)} detail={`since ${shortDate(data.historyFrom)}`} />
        <Stat
          label={latestLoanSeason ? `Trades with a loan, ${latestLoanSeason.season}` : "Trades with a loan"}
          value={latestLoanSeason ? pct(latestLoanSeason.tradesWithLoan, latestLoanSeason.trades) : "—"}
          detail={latestLoanSeason
            ? `${latestLoanSeason.tradesWithLoan} of ${latestLoanSeason.trades} · ${dollars(latestLoanSeason.loanTotal)} lent`
            : "no loan record yet"}
        />
        <Stat label="Pending" value={String(pending.length)} detail="awaiting league approval" />
        <Stat
          label="Bottom-half sell-offs"
          value={String(losingSellOffs.length)}
          detail={verdict.judged ? `${verdict.gainedKeeperValue} of ${verdict.judged} gained keeper value` : undefined}
        />
      </div>

      <Section
        id="pending"
        icon={<Clock size={18} aria-hidden="true" />}
        title="Pending trades"
        hint="Accepted by both teams and inside the 48-hour veto window. Valued at today's projections and salaries."
      >
        {pending.length > 0 ? (
          <div className="space-y-4">
            {pending.map((v) => (
              <TradeCard key={v.trade.key} valuation={v} allTrades={allTrades} showTree={false} />
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing pending right now" />
        )}
      </Section>

      <Section
        id="sell-offs"
        icon={<TrendingDown size={18} aria-hidden="true" />}
        title="Sell-offs"
        hint={
          <>
            Trades where one side gave up at least $25 of this season&apos;s value, net. The question is
            whether selling bought anything: keeper value, a better record next season, or production
            next season (the last column — realized dollars in minus out).
          </>
        }
      >
        {verdict.judged > 0 && (
          <p className="mb-3 max-w-prose text-sm text-ink">
            Of <strong>{verdict.judged}</strong> sell-offs by bottom-half teams,{" "}
            <strong>{verdict.gainedKeeperValue}</strong> came away with more keeper value than they sent
            {verdict.averageKeeperNet != null && <> (average {signed(verdict.averageKeeperNet)})</>}.
            {verdict.withNextSeason > 0 ? (
              <>
                {" "}<strong>{verdict.improvedRank}</strong> of {verdict.withNextSeason} with a following
                season to judge finished higher
                {verdict.averageRankChange != null && (
                  <> (average {verdict.averageRankChange >= 0 ? "+" : "−"}
                    {Math.abs(verdict.averageRankChange).toFixed(1)} places)</>
                )}.
              </>
            ) : (
              <> None has a following season to judge yet.</>
            )}
          </p>
        )}
        {sellOffs.length > 0 ? (
          <SellOffTable sellOffs={sellOffs} />
        ) : (
          <EmptyState title="No sell-offs found" />
        )}
      </Section>

      <Section
        id="loans"
        icon={<HandCoins size={18} aria-hidden="true" />}
        title="Cap loans"
        hint={
          <>
            A loan moves cap room for the rest of the regular season and then expires. Counted from{" "}
            {shortDate(loans.knownSince)} — the start of Ottoneu&apos;s trade history; older trades
            survive only on player cards, which never show a loan.
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="min-w-full text-sm">
              <thead className="bg-sunken">
                <tr><Th>Season</Th><Th right>Trades</Th><Th right>With loan</Th><Th right>Total lent</Th><Th right>Largest</Th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loans.bySeason.map((s) => (
                  <tr key={s.season}>
                    <td className="px-3 py-2 font-medium text-ink">{s.season}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.trades}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.tradesWithLoan} ({pct(s.tradesWithLoan, s.trades)})</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dollars(s.loanTotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dollars(s.largestLoan)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="min-w-full text-sm">
              <thead className="bg-sunken">
                <tr><Th>Team</Th><Th right>Lent</Th><Th right>Borrowed</Th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loans.byTeam.filter((t) => t.lentCount + t.borrowedCount > 0).map((t) => (
                  <tr key={t.team}>
                    <td className="whitespace-nowrap px-3 py-2"><TeamName name={t.team} /></td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.lentCount ? `${dollars(t.lentTotal)} (${t.lentCount})` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.borrowedCount ? `${dollars(t.borrowedTotal)} (${t.borrowedCount})` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {loans.loans.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {loans.loans.map((l) => (
              <li key={`${l.trade.key}-${l.lender}`} className="text-ink-muted">
                <span className="tabular-nums">{shortDate(tradeTime(l.trade))}</span> ·{" "}
                <TeamName name={l.lender} plain /> lent <strong className="text-ink">{dollars(l.amount)}</strong> to{" "}
                <TeamName name={l.borrower} plain />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="log"
        icon={<ArrowLeftRight size={18} aria-hidden="true" />}
        title="Trade log"
        hint="Newest first. Open “What it turned into” to follow each side's players into the trades that moved them on."
      >
        <div className="mb-2 flex flex-wrap gap-1.5">
          {filterChip(query({ team: null }), "All teams", !team)}
          {teams.map((t) => filterChip(query({ team: t }), t, team === t))}
        </div>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {filterChip(query({ season: null }), "All seasons", !season)}
          {seasons.map((s) => filterChip(query({ season: s }), String(s), season === s))}
        </div>
        {log.length > 0 ? (
          <div className="space-y-4">
            {log.map((v: TradeValuation) => (
              <TradeCard key={v.trade.key} valuation={v} allTrades={allTrades} />
            ))}
          </div>
        ) : (
          <EmptyState title="No trades match these filters" />
        )}
      </Section>

      {travellers.length > 0 && (
        <Section
          id="travellers"
          icon={<Route size={18} aria-hidden="true" />}
          title="Most-traded players"
          hint="Each player's chain of owners, oldest move first, with the salary he carried."
        >
          <ul className="space-y-2 text-sm">
            {travellers.slice(0, 25).map((p) => (
              <li key={p.key} className="rounded-md border border-line bg-raised px-3 py-2">
                <span className="font-semibold text-ink">{p.name}</span>{" "}
                <span className="text-ink-subtle">{p.position} · traded {p.chain.length}×</span>
                <p className="mt-0.5 text-ink-muted">
                  {p.chain[0].fromTeam}
                  {p.chain.map((s) => (
                    <span key={s.trade.key}>
                      {" → "}
                      <span className="text-ink">{s.toTeam}</span>{" "}
                      <span className="text-ink-subtle">({shortDate(tradeTime(s.trade))}, {dollars(s.salary)})</span>
                    </span>
                  ))}
                  {data.currentOwners[p.key] && data.currentOwners[p.key] !== p.chain[p.chain.length - 1].toTeam && (
                    <span className="text-ink-subtle"> · now on {data.currentOwners[p.key]}</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </PageShell>
  );
}
