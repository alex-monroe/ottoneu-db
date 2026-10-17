"use client";

import { useMemo, useSyncExternalStore } from "react";
import PositionBadge from "@/components/PositionBadge";
import PlayerName from "@/components/PlayerName";
import {
  FIT_LABEL,
  FIT_WEIGHT,
  adviseClaim,
  formatTimeLeft,
  hoursLeft,
  openListings,
  suggestMaxBid,
  type MarketBoardRow,
} from "@/lib/fa-market";

interface Props {
  rows: MarketBoardRow[];
  scrapedAt: string | null;
  viewerTeam: string | null;
  /** The viewer's cap room; null when there is no viewer team. */
  capRoom: number | null;
  /** Roster spots the viewer has free; null when there is no viewer team. */
  openSpots: number | null;
}

const MINUTE = 60_000;
function subscribeMinute(onChange: () => void) {
  const t = setInterval(onChange, MINUTE);
  return () => clearInterval(t);
}
/** Rounded to the minute so repeated reads return the same snapshot. */
function minuteNow(): number | null {
  return Math.floor(Date.now() / MINUTE) * MINUTE;
}
function serverNow(): number | null {
  return null;
}

const FIT_CLASS: Record<MarketBoardRow["fit"], string> = {
  starter: "text-positive",
  bench: "text-accent",
  bye_fill: "text-amber-700 dark:text-amber-400",
  none: "text-ink-subtle",
  unknown: "text-ink-subtle",
};

/**
 * Open auctions and claimable cuts, priced for the viewer. Pricing lives in
 * lib/fa-market.ts; this only renders it and keeps the countdowns honest.
 *
 * Client-side because the page is cached for up to an hour, and a "2h left"
 * rendered then would be wrong by the time it is read. The server snapshot of
 * the clock is null, so the server and the hydrating client render the same
 * markup and the countdowns fill in after mount.
 */
export default function FaMarketBoard({ rows, scrapedAt, viewerTeam, capRoom, openSpots }: Props) {
  const now = useSyncExternalStore(subscribeMinute, minuteNow, serverNow);

  const open = useMemo(() => (now == null ? rows : openListings(rows, now)), [rows, now]);
  const auctions = open.filter((r) => r.kind === "auction");
  const waivers = open.filter((r) => r.kind === "waiver");

  return (
    <section className="space-y-4 rounded-lg border border-line p-4">
      <header className="space-y-1">
        <h2 className="text-xl font-semibold text-ink">Open auctions &amp; waivers</h2>
        <p className="max-w-prose text-sm text-ink-subtle">
          Bids are blind and the winner pays the second-highest bid + $1, so the
          suggested bid is simply what the player is worth to you: this
          season&apos;s production priced at a full season&apos;s salary, scaled by
          whether he would play for your roster.
          {viewerTeam && capRoom != null && (
            <>
              {" "}
              {viewerTeam} has <strong className="text-ink">${capRoom}</strong> of cap room
              {openSpots != null &&
                (openSpots > 0
                  ? ` and ${openSpots} open roster spot${openSpots === 1 ? "" : "s"}.`
                  : " and a full roster — winning means cutting someone.")}
            </>
          )}
        </p>
      </header>

      {open.length === 0 ? (
        <p className="text-sm text-ink-subtle">
          Nobody is up for auction or on waivers right now.
        </p>
      ) : (
        <>
          <MarketTable
            title="Active auctions"
            rows={auctions}
            now={now}
            empty="No open auctions."
            priceHeader="Min bid"
            adviceHeader="Max bid"
            price={(r) => r.min_bid}
            advice={(r) => {
              const a = suggestMaxBid({ value: r.value_to_you, minBid: r.min_bid, capRoom });
              switch (a.action) {
                case "bid":
                  return (
                    <span
                      className="font-semibold text-ink"
                      title={a.cappedByRoom ? "Capped at your cap room" : undefined}
                    >
                      ${a.maxBid}
                      {a.cappedByRoom ? "*" : ""}
                    </span>
                  );
                case "pass":
                  return <span className="text-ink-subtle">Pass</span>;
                case "no_room":
                  return <span className="text-negative">No cap room</span>;
                case "unpriced":
                  return <span className="text-ink-subtle" title="No NFL production this season to price">—</span>;
              }
            }}
          />
          <MarketTable
            title="Waiver claims"
            rows={waivers}
            now={now}
            empty="Nobody is on waivers."
            priceHeader="Salary"
            adviceHeader="Claim?"
            price={(r) => r.salary}
            advice={(r) => {
              const a = adviseClaim({ value: r.value_to_you, salary: r.salary, capRoom });
              switch (a.action) {
                case "claim":
                  return <span className="font-semibold text-positive">Claim (+${a.margin})</span>;
                case "pass":
                  return <span className="text-ink-subtle">Pass (${a.margin})</span>;
                case "no_room":
                  return <span className="text-negative">No cap room</span>;
                case "unpriced":
                  return <span className="text-ink-subtle" title="No NFL production this season to price">—</span>;
              }
            }}
          />
        </>
      )}

      <p className="text-xs text-ink-subtle">
        <strong>Value</strong> is earned value on this season&apos;s points, at full-season
        scale. <strong>To you</strong> weights it by fit on season PPG: a starter
        counts in full, a top backup at {FIT_WEIGHT.bench * 100}%, a bye fill at{" "}
        {FIT_WEIGHT.bye_fill * 100}%, anyone who would not dress at {FIT_WEIGHT.none * 100}%.
        A waiver claim pays the full salary he was cut at — no bidding; with several
        claims the lowest-ranked team wins. Kickers and college players have no
        earned value, so they show a dash.
        {scrapedAt && <> Market checked {new Date(scrapedAt).toLocaleString()}.</>}
      </p>
    </section>
  );
}

function MarketTable({
  title,
  rows,
  now,
  empty,
  priceHeader,
  adviceHeader,
  price,
  advice,
}: {
  title: string;
  rows: MarketBoardRow[];
  now: number | null;
  empty: string;
  priceHeader: string;
  adviceHeader: string;
  price: (r: MarketBoardRow) => number | null;
  advice: (r: MarketBoardRow) => React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">
        {title} <span className="font-normal text-ink-subtle">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-subtle">{empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="bg-sunken">
              <tr>
                <Th>Player</Th>
                <Th>Pos</Th>
                <Th right>Left</Th>
                <Th right>PPG</Th>
                <Th right>Value</Th>
                <Th>Fit</Th>
                <Th right>To you</Th>
                <Th right>{priceHeader}</Th>
                <Th right>{adviceHeader}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const urgent = now != null && hoursLeft(r.ends_at, now) < 3;
                return (
                  <tr key={`${r.kind}:${r.is_college ? "c" : "n"}${r.ottoneu_id}`} className="border-t border-line">
                    <td className="px-3 py-2 text-sm">
                      <PlayerName name={r.player_name} ottoneuId={r.ottoneu_id} />
                      <span className="ml-1 text-xs text-ink-subtle">
                        {r.nfl_team}
                        {r.injury_status ? ` · ${r.injury_status}` : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {r.position && <PositionBadge position={r.position} size="sm" />}
                    </td>
                    <td
                      className={`px-3 py-2 text-right text-sm tabular-nums ${urgent ? "font-semibold text-negative" : "text-ink"}`}
                      title={new Date(r.ends_at).toLocaleString()}
                    >
                      {now == null ? "—" : formatTimeLeft(r.ends_at, now)}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-ink-muted">
                      {r.ppg == null ? "—" : r.ppg.toFixed(1)}
                      {r.games_played ? (
                        <span className="text-xs text-ink-subtle"> /{r.games_played}g</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-ink-muted">
                      {r.league_value == null ? "—" : `$${Math.round(r.league_value)}`}
                    </td>
                    <td
                      className={`px-3 py-2 text-xs font-semibold uppercase ${FIT_CLASS[r.fit]}`}
                      title={r.fit_over ? `Over ${r.fit_over}` : undefined}
                    >
                      {FIT_LABEL[r.fit]}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-ink">
                      {r.value_to_you == null ? "—" : `$${Math.floor(r.value_to_you)}`}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-ink-muted">
                      {price(r) == null ? "—" : `$${price(r)}`}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums">{advice(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-ink-subtle ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}
