"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { Check, Link2 } from "lucide-react";
import PositionBadge from "@/components/PositionBadge";
import { EmptyState } from "@/components/states";
import {
  evaluateTrade,
  keeperValue,
  tradeToQuery,
  type BuilderContext,
  type BuilderPlayer,
  type ProposedTrade,
  type SideResult,
} from "@/lib/trade-builder";

interface Props {
  context: BuilderContext;
  initial: ProposedTrade;
  /** Set when the rosters are a replay of a recorded trade. */
  replayTradeId: number | null;
  viewerTeam: string | null;
  windowLabel: string;
}

const money = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(Math.round(v))}`;
const signedMoney = (v: number) => (Math.round(v) === 0 ? "$0" : `${v > 0 ? "+" : "−"}$${Math.abs(Math.round(v))}`);
const signedPts = (v: number) => (v === 0 ? "0.0" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`);
const tone = (v: number | null) =>
  v == null || Math.round(v) === 0 ? "text-ink-muted" : v > 0 ? "text-positive" : "text-negative";

function RosterPicker({
  label,
  team,
  teams,
  onTeam,
  players,
  selected,
  onToggle,
  loan,
  onLoan,
  partner,
}: {
  label: string;
  team: string;
  teams: string[];
  onTeam: (t: string) => void;
  players: BuilderPlayer[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  loan: number;
  onLoan: (v: number) => void;
  partner: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-raised">
      <div className="border-b border-line p-3">
        <label className="block text-xs font-medium uppercase tracking-wide text-ink-subtle">
          {label}
          <select
            value={team}
            onChange={(e) => onTeam(e.target.value)}
            className="mt-1 block w-full rounded-md border border-line bg-sunken px-2 py-1.5 text-sm font-semibold normal-case tracking-normal text-ink"
          >
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
        {players.map((p) => {
          const on = selected.has(p.playerId);
          return (
            <li key={p.playerId}>
              <label
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${on ? "bg-accent-soft" : "hover:bg-sunken"}`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(p.playerId)}
                  className="accent-[var(--color-accent)]"
                />
                <PositionBadge position={p.position} size="sm" />
                <span className="min-w-0 flex-1 truncate text-ink">
                  {p.name} <span className="text-ink-subtle">{p.nflTeam}</span>
                </span>
                <span className="w-12 text-right tabular-nums text-ink-muted" title="Salary">
                  {money(p.salary)}
                </span>
                <span className="w-12 text-right tabular-nums text-ink-muted" title="Points per game this season">
                  {p.gamesPlayed > 0 ? p.ppg.toFixed(1) : "—"}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-line p-3 text-sm">
        <label className="flex items-center gap-2 text-ink-muted">
          Cap loan to {partner || "the other team"}
          <span className="ml-auto flex items-center gap-1">
            $
            <input
              type="number"
              min={0}
              step={1}
              value={loan || ""}
              placeholder="0"
              onChange={(e) => onLoan(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="w-16 rounded-md border border-line bg-sunken px-2 py-1 text-right tabular-nums text-ink"
            />
          </span>
        </label>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  a,
  b,
}: {
  label: string;
  hint?: string;
  a: React.ReactNode;
  b: React.ReactNode;
}) {
  return (
    <tr className="align-top">
      <th scope="row" className="px-3 py-2 text-left font-medium text-ink">
        {label}
        {hint && <span className="block text-xs font-normal text-ink-subtle">{hint}</span>}
      </th>
      <td className="px-3 py-2 text-right tabular-nums">{a}</td>
      <td className="px-3 py-2 text-right tabular-nums">{b}</td>
    </tr>
  );
}

function names(ps: BuilderPlayer[]): string {
  return ps.length ? ps.map((p) => `${p.name} (${money(p.salary)})`).join(", ") : "—";
}

function verdictLine(s: SideResult): string {
  const parts: string[] = [];
  if (s.lineupDelta !== 0) parts.push(`${signedPts(s.lineupDelta)} PPG in the starting lineup`);
  if (s.restOfSeasonNet != null && Math.round(s.restOfSeasonNet) !== 0)
    parts.push(`${signedMoney(s.restOfSeasonNet)} of value for the weeks left`);
  if (Math.round(s.keeperNet) !== 0) parts.push(`${signedMoney(s.keeperNet)} of keeper value`);
  return parts.length ? `${s.team}: ${parts.join(", ")}.` : `${s.team}: no change to its lineup or value.`;
}

export default function TradeBuilderClient({ context, initial, replayTradeId, viewerTeam, windowLabel }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [trade, setTrade] = useState<ProposedTrade>(initial);
  const [copied, setCopied] = useState(false);
  const tracked = useRef(false);

  const teamNames = useMemo(() => context.teams.map((t) => t.teamName), [context.teams]);
  const rosterOf = (team: string) => context.teams.find((t) => t.teamName === team)?.players ?? [];
  const evaluation = useMemo(() => evaluateTrade(context, trade), [context, trade]);

  // Keep the URL in step so the address bar is always a shareable link.
  useEffect(() => {
    const q = tradeToQuery(trade, replayTradeId);
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  }, [trade, replayTradeId, pathname, router]);

  useEffect(() => {
    if (evaluation && !tracked.current) {
      tracked.current = true;
      track("trade_builder_evaluate", { own_team: trade.teamA === viewerTeam, replay: replayTradeId != null });
    }
  }, [evaluation, trade.teamA, viewerTeam, replayTradeId]);

  const setTeam = (which: "A" | "B", team: string) =>
    setTrade((t) => {
      const next = { ...t, loanAtoB: 0, loanBtoA: 0 };
      if (which === "A") {
        next.teamA = team;
        next.aSends = [];
        if (team === t.teamB) next.teamB = teamNames.find((n) => n !== team) ?? "";
        if (next.teamB !== t.teamB) next.bSends = [];
        else next.bSends = t.bSends;
      } else {
        next.teamB = team;
        next.bSends = [];
        if (team === t.teamA) next.teamA = teamNames.find((n) => n !== team) ?? "";
        if (next.teamA !== t.teamA) next.aSends = [];
        else next.aSends = t.aSends;
      }
      return next;
    });

  const toggle = (which: "A" | "B", id: string) =>
    setTrade((t) => {
      const key = which === "A" ? "aSends" : "bSends";
      const cur = t[key];
      return { ...t, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] };
    });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      track("trade_builder_copy_link");
    } catch {
      // Clipboard can be blocked (insecure context, permissions); the address bar still has the link.
    }
  };

  const a = evaluation?.a;
  const b = evaluation?.b;
  const pctLeft = context.remainingFraction == null ? null : Math.round(context.remainingFraction * 100);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <RosterPicker
          label="Team A sends"
          team={trade.teamA}
          teams={teamNames}
          onTeam={(t) => setTeam("A", t)}
          players={rosterOf(trade.teamA)}
          selected={new Set(trade.aSends)}
          onToggle={(id) => toggle("A", id)}
          loan={trade.loanAtoB}
          onLoan={(v) => setTrade((t) => ({ ...t, loanAtoB: v }))}
          partner={trade.teamB}
        />
        <RosterPicker
          label="Team B sends"
          team={trade.teamB}
          teams={teamNames}
          onTeam={(t) => setTeam("B", t)}
          players={rosterOf(trade.teamB)}
          selected={new Set(trade.bSends)}
          onToggle={(id) => toggle("B", id)}
          loan={trade.loanBtoA}
          onLoan={(v) => setTrade((t) => ({ ...t, loanBtoA: v }))}
          partner={trade.teamA}
        />
      </div>

      <section aria-live="polite" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-ink">The trade, both sides</h2>
          <button
            type="button"
            onClick={copyLink}
            disabled={!evaluation}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-sm text-ink-muted hover:text-ink disabled:opacity-50"
          >
            {copied ? <Check size={14} aria-hidden="true" /> : <Link2 size={14} aria-hidden="true" />}
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>

        {!a || !b ? (
          <EmptyState title="Pick at least one player or a loan">
            Tick players on either roster above. The trade is judged as you go.
          </EmptyState>
        ) : (
          <>
            <ul className="space-y-1 text-sm text-ink">
              <li>{verdictLine(a)}</li>
              <li>{verdictLine(b)}</li>
            </ul>
            {[...a.warnings.map((w) => `${a.team}: ${w}`), ...b.warnings.map((w) => `${b.team}: ${w}`)].map((w) => (
              <p key={w} className="rounded-md border border-line bg-sunken px-3 py-2 text-sm text-negative">
                {w}
              </p>
            ))}
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="min-w-full text-sm">
                <thead className="bg-sunken">
                  <tr>
                    <th className="px-3 py-2" />
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-ink">{a.team}</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold text-ink">{b.team}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  <Row label="Receives" a={<span className="text-ink">{names(a.receives)}</span>} b={<span className="text-ink">{names(b.receives)}</span>} />
                  <Row
                    label="Starting lineup"
                    hint={`Optimal Superflex lineup on ${windowLabel} PPG`}
                    a={<><span className={tone(a.lineupDelta)}>{signedPts(a.lineupDelta)}</span> <span className="text-ink-subtle">({a.lineupBefore.toFixed(1)} → {a.lineupAfter.toFixed(1)})</span></>}
                    b={<><span className={tone(b.lineupDelta)}>{signedPts(b.lineupDelta)}</span> <span className="text-ink-subtle">({b.lineupBefore.toFixed(1)} → {b.lineupAfter.toFixed(1)})</span></>}
                  />
                  <Row
                    label="Rest of season"
                    hint={pctLeft == null ? "Schedule not loaded" : `Earned-value pace × ${pctLeft}% of the regular season left`}
                    a={<span className={tone(a.restOfSeasonNet)}>{a.restOfSeasonNet == null ? "—" : signedMoney(a.restOfSeasonNet)}</span>}
                    b={<span className={tone(b.restOfSeasonNet)}>{b.restOfSeasonNet == null ? "—" : signedMoney(b.restOfSeasonNet)}</span>}
                  />
                  <Row
                    label="Keeper value"
                    hint="Season pace minus next year's salary; a contract you'd cut counts as $0"
                    a={<span className={tone(a.keeperNet)}>{signedMoney(a.keeperNet)}</span>}
                    b={<span className={tone(b.keeperNet)}>{signedMoney(b.keeperNet)}</span>}
                  />
                  <Row
                    label="Cap room"
                    hint="Cap minus salaries; existing loans and cut penalties are not included, so check Ottoneu's finances page. Loans expire after the regular season"
                    a={<span className={a.capAfter < 0 ? "text-negative" : "text-ink"}>{money(a.capBefore)} → {money(a.capAfter)}</span>}
                    b={<span className={b.capAfter < 0 ? "text-negative" : "text-ink"}>{money(b.capBefore)} → {money(b.capAfter)}</span>}
                  />
                  <Row
                    label="Roster spots"
                    hint="IR players are counted here but not by Ottoneu"
                    a={<span className={a.rosterAfter > context.rosterSpots ? "text-negative" : "text-ink"}>{a.rosterAfter} / {context.rosterSpots}</span>}
                    b={<span className={b.rosterAfter > context.rosterSpots ? "text-negative" : "text-ink"}>{b.rosterAfter} / {context.rosterSpots}</span>}
                  />
                </tbody>
              </table>
            </div>
            <details className="text-sm text-ink-muted">
              <summary className="cursor-pointer text-ink">Per-player values</summary>
              <div className="mt-2 overflow-x-auto rounded-lg border border-line">
                <table className="min-w-full text-sm">
                  <thead className="bg-sunken">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Player</th>
                      <th className="px-3 py-2 text-left font-medium">Going to</th>
                      <th className="px-3 py-2 text-right font-medium">PPG</th>
                      <th className="px-3 py-2 text-right font-medium">Earned so far</th>
                      <th className="px-3 py-2 text-right font-medium">Season pace</th>
                      <th className="px-3 py-2 text-right font-medium">Salary → next yr</th>
                      <th className="px-3 py-2 text-right font-medium">Keeper value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {[...a.sends.map((p) => [p, b.team] as const), ...b.sends.map((p) => [p, a.team] as const)].map(([p, to]) => (
                      <tr key={p.playerId}>
                        <td className="px-3 py-1.5 text-ink">{p.name} <span className="text-ink-subtle">{p.position}</span></td>
                        <td className="px-3 py-1.5">{to}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{p.gamesPlayed > 0 ? p.ppg.toFixed(1) : "—"}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{money(p.earnedToDate)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{money(p.seasonPace)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{money(p.salary)} → {money(p.nextSalary)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{money(keeperValue(p))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2">
                Kickers and college players earn no value in this method (every kicker clears at the
                salary floor), so they read $0. Early in the season a pace rests on few games; weigh
                it with that in mind.
              </p>
            </details>
          </>
        )}
      </section>
    </div>
  );
}
