"use client";

import { useMemo, useState } from "react";
import PageShell from "@/components/PageShell";
import PositionBadge from "@/components/PositionBadge";
import {
  DEFAULT_LOAN_SETTINGS,
  seasonStateFromMatchups,
  valueLoanTrade,
  type LoanTradePlayer,
  type LoanTradeSettings,
  type SideValuation,
} from "@/lib/loan-trade";
import type { Matchup } from "@/lib/standings";

interface Props {
  players: LoanTradePlayer[];
  matchups: Matchup[];
  season: number;
  viewerTeam: string | null;
  capPerTeam: number;
  annualRaise: number;
  weeklySd: number;
  /** False when the spread is the fallback, not measured from this season. */
  weeklySdMeasured: boolean;
}

const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n))}`;
const signedMoney = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}$${Math.abs(Math.round(n))}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const signedPts = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n * 100).toFixed(1)} pts`;
const tone = (n: number) => (n > 0.5 ? "text-positive" : n < -0.5 ? "text-negative" : "text-ink");

function NumberField({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <label htmlFor={id} className="font-medium text-ink">{label}</label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        className="w-full rounded-md border border-line bg-sunken px-3 py-2 tabular-nums text-ink"
      />
      {hint && <span id={`${id}-hint`} className="text-xs text-ink-subtle">{hint}</span>}
    </div>
  );
}

function RosterPicker({
  id,
  title,
  roster,
  picked,
  onToggle,
}: {
  id: string;
  title: string;
  roster: LoanTradePlayer[];
  picked: Set<string>;
  onToggle: (playerId: string) => void;
}) {
  return (
    <fieldset className="min-w-0 rounded-lg border border-line p-4">
      <legend className="px-1 text-sm font-semibold text-ink">{title}</legend>
      <div className="max-h-80 overflow-y-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-left text-xs text-ink-subtle">
              <th className="py-1 font-medium" scope="col">Player</th>
              <th className="py-1 text-right font-medium" scope="col">Salary</th>
              <th className="py-1 text-right font-medium" scope="col">Value</th>
              <th className="py-1 text-right font-medium" scope="col">PPG</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((p) => {
              const inputId = `${id}-${p.player_id}`;
              return (
                <tr key={p.player_id} className="border-t border-line">
                  <td className="py-1.5 pr-2">
                    <label htmlFor={inputId} className="flex cursor-pointer items-center gap-2">
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={picked.has(p.player_id)}
                        onChange={() => onToggle(p.player_id)}
                      />
                      <PositionBadge position={p.position} size="sm" />
                      <span className="text-ink">{p.name}</span>
                    </label>
                  </td>
                  <td className="py-1.5 text-right text-ink-muted">{money(p.salary)}</td>
                  <td className="py-1.5 text-right text-ink-muted">{money(p.dollar_value)}</td>
                  <td className="py-1.5 text-right text-ink-muted">{p.ppg.toFixed(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </fieldset>
  );
}

/** A team's players, most expensive first. */
function rosterOf(players: LoanTradePlayer[], team: string): LoanTradePlayer[] {
  return players
    .filter((p) => p.team_name === team)
    .sort((a, b) => b.salary - a.salary || b.dollar_value - a.dollar_value);
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-ink-subtle">{label}</dt>
      <dd className={`tabular-nums ${className ?? "text-ink"}`}>{value}</dd>
    </div>
  );
}

function SideCard({ side, titleValue }: { side: SideValuation; titleValue: number }) {
  const overCap = side.payrollAfter > side.capAfter;
  return (
    <section className="min-w-0 rounded-lg border border-line bg-sunken p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
        {side.role === "borrower" ? "Borrower" : "Lender"}
      </p>
      <h3 className="text-lg font-semibold text-ink">{side.team}</h3>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${tone(side.net)}`}>{signedMoney(side.net)}</p>
      <p className="text-xs text-ink-subtle">Net value of the deal, in dollars of keeper surplus</p>

      <h4 className="mt-5 text-sm font-semibold text-ink">This season</h4>
      <dl className="divide-y divide-line text-sm">
        <Row label="Projected weekly points" value={`${side.weeklyBefore.toFixed(1)} → ${side.weeklyAfter.toFixed(1)}`} />
        <Row label="Playoff odds" value={`${pct(side.playoffsBefore)} → ${pct(side.playoffsAfter)}`} />
        <Row
          label="Title odds"
          value={`${pct(side.titleBefore)} → ${pct(side.titleAfter)} (${signedPts(side.titleAfter - side.titleBefore)})`}
        />
        <Row
          label={`Worth, at ${money(titleValue)} a title`}
          value={signedMoney(side.thisSeasonValue)}
          className={tone(side.thisSeasonValue)}
        />
        {side.role === "lender" && (
          <Row label="Other uses of the loaned cap" value={signedMoney(-side.capCost)} className={tone(-side.capCost)} />
        )}
        <Row
          label="Payroll after trade"
          value={`${money(side.payrollAfter)} of ${money(side.capAfter)}`}
          className={overCap ? "text-negative" : "text-ink"}
        />
      </dl>
      {overCap && (
        <p className="mt-1 text-xs text-negative">
          Over the cap by {money(side.payrollAfter - side.capAfter)} on salaries alone. Cut penalties
          and existing loans aren&apos;t counted here.
        </p>
      )}

      <h4 className="mt-5 text-sm font-semibold text-ink">Next season onward (keeper value)</h4>
      <dl className="divide-y divide-line text-sm">
        {side.received.map((m) => (
          <Row key={`in-${m.player.player_id}`} label={`+ ${m.player.name}`} value={signedMoney(m.keeperValue)} />
        ))}
        {side.sent.map((m) => (
          <Row key={`out-${m.player.player_id}`} label={`− ${m.player.name}`} value={signedMoney(-m.keeperValue)} />
        ))}
        <Row label="Net keeper value" value={signedMoney(side.keeperValue)} className={tone(side.keeperValue)} />
      </dl>
    </section>
  );
}

export default function LoanCalculatorClient({
  players,
  matchups,
  season,
  viewerTeam,
  capPerTeam,
  annualRaise,
  weeklySd,
  weeklySdMeasured,
}: Props) {
  const teams = useMemo(() => [...new Set(players.map((p) => p.team_name))].sort(), [players]);
  const [borrower, setBorrower] = useState(
    viewerTeam && teams.includes(viewerTeam) ? viewerTeam : (teams[0] ?? ""),
  );
  const [lender, setLender] = useState(teams.find((t) => t !== borrower) ?? "");
  const [toBorrower, setToBorrower] = useState<Set<string>>(new Set());
  const [toLender, setToLender] = useState<Set<string>>(new Set());
  const [loan, setLoan] = useState(0);
  const [titleValue, setTitleValue] = useState(DEFAULT_LOAN_SETTINGS.titleValue);
  const [lenderCapValue, setLenderCapValue] = useState(DEFAULT_LOAN_SETTINGS.lenderCapValue);
  const [keeperYears, setKeeperYears] = useState(DEFAULT_LOAN_SETTINGS.keeperYears);
  const [uncertainty, setUncertainty] = useState(DEFAULT_LOAN_SETTINGS.valueUncertainty * 100);

  const lenderRoster = useMemo(() => rosterOf(players, lender), [players, lender]);
  const borrowerRoster = useMemo(() => rosterOf(players, borrower), [players, borrower]);

  const state = useMemo(() => seasonStateFromMatchups(matchups), [matchups]);
  const regularGamesLeft = state.remaining.length;

  const settings: LoanTradeSettings = useMemo(
    () => ({
      ...DEFAULT_LOAN_SETTINGS,
      titleValue,
      lenderCapValue,
      keeperYears,
      valueUncertainty: uncertainty / 100,
      annualRaise,
      weeklySd,
    }),
    [titleValue, lenderCapValue, keeperYears, uncertainty, annualRaise, weeklySd],
  );

  const result = useMemo(() => {
    if (!borrower || !lender || borrower === lender) return null;
    if (toBorrower.size + toLender.size === 0 && loan === 0) return null;
    return valueLoanTrade(
      { borrower, lender, toBorrower: [...toBorrower], toLender: [...toLender], loan },
      players,
      state,
      settings,
      capPerTeam,
    );
  }, [borrower, lender, toBorrower, toLender, loan, players, state, settings, capPerTeam]);

  const toggle = (set: Set<string>, update: (s: Set<string>) => void) => (id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };

  const pickBorrower = (team: string) => {
    setBorrower(team);
    setToLender(new Set());
    if (team === lender) {
      setLender(teams.find((t) => t !== team) ?? "");
      setToBorrower(new Set());
    }
  };
  const pickLender = (team: string) => {
    setLender(team);
    setToBorrower(new Set());
    if (team === borrower) {
      setBorrower(teams.find((t) => t !== team) ?? "");
      setToLender(new Set());
    }
  };

  const verdict = (() => {
    if (!result) return null;
    const { borrower: b, lender: l } = result;
    if (result.worksForBoth) {
      return `Both sides come out ahead. Together they gain ${money(result.jointGain)}, so there is room to move: ${b.team} could send up to ${money(b.net)} more in keeper value, or ${l.team} could take up to ${money(l.net)} less, and the deal would still work for both.`;
    }
    if (result.jointGain > 0) {
      const loser = b.net < 0 ? b : l;
      return `The deal creates ${money(result.jointGain)} of value but splits it unevenly: ${loser.team} loses ${money(-loser.net)}. Moving about that much keeper value toward ${loser.team} would make it work for both.`;
    }
    return `Together the two teams lose ${money(-result.jointGain)}, so no rebalancing makes this work for both.`;
  })();

  const selectClass = "w-full rounded-md border border-line bg-sunken px-3 py-2 text-ink";

  return (
    <PageShell>
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-ink">Loan Trades</h1>
        <p className="mt-2 max-w-3xl text-ink-subtle">
          Value a trade that includes a cap loan for both teams. This season is priced by
          simulating the rest of the {season} season and playoffs before and after the trade.
          Next season is priced as keeper value, since a loan expires at the end of the regular
          season and offseason cuts are free.
        </p>
      </header>

      <section aria-labelledby="trade-heading" className="space-y-4">
        <h2 id="trade-heading" className="text-xl font-semibold text-ink">The trade</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label htmlFor="borrower" className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Borrower (receives cap)</span>
            <select id="borrower" value={borrower} onChange={(e) => pickBorrower(e.target.value)} className={selectClass}>
              {teams.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label htmlFor="lender" className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">Lender (sends cap)</span>
            <select id="lender" value={lender} onChange={(e) => pickLender(e.target.value)} className={selectClass}>
              {teams.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <NumberField
            id="loan"
            label="Loan"
            value={loan}
            onChange={setLoan}
            min={0}
            max={capPerTeam}
            hint="Cap moving from lender to borrower until the regular season ends"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <RosterPicker
            id="to-borrower"
            title={`${lender || "Lender"} sends`}
            roster={lenderRoster}
            picked={toBorrower}
            onToggle={toggle(toBorrower, setToBorrower)}
          />
          <RosterPicker
            id="to-lender"
            title={`${borrower || "Borrower"} sends`}
            roster={borrowerRoster}
            picked={toLender}
            onToggle={toggle(toLender, setToLender)}
          />
        </div>
      </section>

      {result && (
        <section aria-labelledby="result-heading" className="space-y-4">
          <h2 id="result-heading" className="text-xl font-semibold text-ink">What it&apos;s worth</h2>
          <p className="max-w-3xl text-ink">{verdict}</p>
          {result.keeperPerLoanDollar != null && (
            <p className="max-w-3xl text-sm text-ink-subtle">
              {result.lender.team} nets {signedMoney(result.lender.keeperValue)} of keeper value for{" "}
              {money(loan)} of cap, or {money(result.keeperPerLoanDollar * 100)} per $100 loaned.
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <SideCard side={result.borrower} titleValue={titleValue} />
            <SideCard side={result.lender} titleValue={titleValue} />
          </div>
        </section>
      )}

      <section aria-labelledby="assumptions-heading" className="space-y-4">
        <h2 id="assumptions-heading" className="text-xl font-semibold text-ink">Assumptions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField
            id="title-value"
            label="Value of a title"
            value={titleValue}
            onChange={setTitleValue}
            min={0}
            max={1000}
            step={10}
            hint="How much future keeper surplus you'd give for a sure title"
          />
          <NumberField
            id="lender-cap-value"
            label="Lender's use for $1 of cap"
            value={lenderCapValue}
            onChange={setLenderCapValue}
            min={0}
            max={1}
            step={0.05}
            hint="0 if the lender had nothing to spend it on this season"
          />
          <NumberField
            id="keeper-years"
            label="Keeper seasons to count"
            value={keeperYears}
            onChange={setKeeperYears}
            min={0}
            max={4}
            hint="Later seasons are discounted 25% each"
          />
          <NumberField
            id="uncertainty"
            label="Future value uncertainty (%)"
            value={uncertainty}
            onChange={setUncertainty}
            min={0}
            max={100}
            step={5}
            hint="Higher favours volatile young players, because cuts are free"
          />
        </div>
        <ul className="max-w-3xl list-disc space-y-1 pl-5 text-sm text-ink-subtle">
          <li>
            Each team scores its best projected lineup each week, give or take {weeklySd.toFixed(0)} points
            {weeklySdMeasured ? " (measured from this season's games)" : " (a default until enough games are final)"}.
            {" "}{regularGamesLeft} regular-season games remain. Byes and injuries aren&apos;t modelled.
          </li>
          <li>
            Seeds go by wins, then points for. The top seeds take any byes, and the bracket isn&apos;t reseeded.
          </li>
          <li>
            Keeper value starts from each player&apos;s projected dollar value this season. Salary rises
            {" "}{money(annualRaise)} a season, and a player is kept only while his value covers his salary.
            Arbitration isn&apos;t included.
          </li>
          <li>The cap check counts roster salaries only, not cut penalties or loans already in place.</li>
        </ul>
      </section>
    </PageShell>
  );
}
