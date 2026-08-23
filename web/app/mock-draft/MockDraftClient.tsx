"use client";

import { useEffect, useRef, useState } from "react";
import type { MockDraftTeamSeed } from "@/lib/mock-draft";
import {
  committed,
  fillsANeed,
  MAX_VALUATION_SPREAD,
  nominationOrder,
  randomValuationSeed,
  ROSTER_SPOTS,
  size,
  startableCount,
  starterNeeds,
  startingLineup,
  suggestedBid,
  type DraftTeam,
  type FAPlayer,
  type Pos,
} from "@/lib/mock-draft-engine";
import {
  advanceLive,
  instantStep,
  minUserBid,
  msLeft,
  newDraft,
  placeUserBid,
  setUserMax,
  shiftClock,
  SPEED_KEYS,
  SPEED_PRESETS,
  type LiveDraft,
  type SpeedKey,
} from "@/lib/mock-draft-live";

interface Props {
  teams: MockDraftTeamSeed[];
  faPool: FAPlayer[];
  season: number;
}

type Mode = "live" | "manual";

const TICK_MS = 100;

const POS_STYLE: Record<Pos, string> = {
  QB: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  RB: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  WR: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  TE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  K: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const SPEED_LABEL: Record<SpeedKey, string> = {
  relaxed: "Relaxed",
  normal: "Normal",
  fast: "Fast",
};

function PosBadge({ pos }: { pos: Pos }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${POS_STYLE[pos]}`}>
      {pos}
    </span>
  );
}

export default function MockDraftClient({ teams: seeds, faPool, season }: Props) {
  const [phase, setPhase] = useState<"setup" | "drafting">("setup");
  const [mode, setMode] = useState<Mode>("live");
  const [speed, setSpeed] = useState<SpeedKey>("normal");
  const [paused, setPaused] = useState(false);
  const [userTeam, setUserTeam] = useState<string>(seeds[0]?.name ?? "");
  // ±% each rival manager's private player valuations may stray from market
  const [valuationNoisePct, setValuationNoisePct] = useState(0);
  const [bidInput, setBidInput] = useState<string>("0");
  const [draft, setDraft] = useState<LiveDraft | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const pausedAt = useRef<number>(0);

  const cfg = SPEED_PRESETS[speed];
  const s = draft;
  const me = s?.teams.find((t) => t.isUser) ?? null;
  const lot = s?.lot ?? null;
  const nextUp: FAPlayer | null = s && s.pool.length > 0 ? s.pool[0] : null;
  // the player the user is acting on: the open lot in live mode, pool[0] otherwise
  const nominee: FAPlayer | null = mode === "live" ? (lot?.player ?? null) : nextUp;
  const complete = !!s && s.pool.length === 0 && !s.lot && !s.sold;

  // the live clock: one interval drives both the countdown and the AI bidding
  useEffect(() => {
    if (phase !== "drafting" || mode !== "live" || paused || complete) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setDraft((d) => (d ? advanceLive(d, t, cfg) : d));
    }, TICK_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, mode, paused, speed, complete]);

  // when a new player comes on the block, seed the bid box with the book value
  useEffect(() => {
    if (me && nominee) setBidInput(String(suggestedBid(me, nominee)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nominee?.id]);

  function start() {
    const teams: DraftTeam[] = seeds.map((seed) => ({
      name: seed.name,
      isUser: seed.name === userTeam,
      cap: seed.cap,
      roster: seed.roster.map((p) => ({ ...p })),
    }));
    const t = Date.now();
    const fresh = newDraft(teams, nominationOrder(faPool), userTeam, {
      spread: valuationNoisePct / 100,
      seed: randomValuationSeed(), // new opinions every draft
    });
    // live mode opens the first lot immediately so there's no blank first tick
    setDraft(mode === "live" ? advanceLive(fresh, t, cfg) : fresh);
    setNow(t);
    setPaused(false);
    setPhase("drafting");
  }

  function reset() {
    setDraft(null);
    setPaused(false);
    setPhase("setup");
  }

  function togglePause() {
    if (!paused) {
      pausedAt.current = Date.now();
      setPaused(true);
      return;
    }
    const delta = Date.now() - pausedAt.current;
    setDraft((d) => (d ? shiftClock(d, delta) : d));
    setNow(Date.now());
    setPaused(false);
  }

  // ── live actions ──
  function bidLive(amount: number) {
    setDraft((d) => (d ? placeUserBid(d, amount, Date.now(), cfg) : d));
  }
  function autoBidTo(max: number) {
    setDraft((d) => (d ? setUserMax(d, max) : d));
  }

  // ── turn-based actions (also the fast-forwards in live mode) ──
  function bidNow() {
    setDraft((d) => (d ? instantStep(d, Number(bidInput) || 0, Date.now()) : d));
  }
  function pass() {
    setDraft((d) => (d ? instantStep(d, 0, Date.now()) : d));
  }

  // auto-pass until the next nominee fills one of my needs (or the pool empties)
  function skipToNeed() {
    setDraft((d) => {
      if (!d) return d;
      let next = d;
      let guard = 0;
      const t = Date.now();
      while (next.pool.length > 0 && guard++ < 1000) {
        const user = next.teams.find((x) => x.isUser)!;
        if (guard > 1 && fillsANeed(user, next.pool[0])) break;
        next = instantStep(next, 0, t);
      }
      return next;
    });
  }

  // auto-pass the rest of the draft (rivals fill out; I'm done)
  function finishRest() {
    setDraft((d) => {
      if (!d) return d;
      let next = d;
      let guard = 0;
      const t = Date.now();
      while (next.pool.length > 0 && guard++ < 3000) next = instantStep(next, 0, t);
      return next;
    });
  }

  // ── setup screen ──
  if (phase === "setup" || !s || !me) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Mock Draft</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">
          Run a practice keeper auction ({season}) against AI opponents that bid with the same
          heuristics as the auction simulator — starter needs, the Superflex QB premium, bench
          depth, reserves, and below-market pounces. Every team is seeded with its real current
          roster and cap.
        </p>
        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Draft as
          </label>
          <select
            value={userTeam}
            onChange={(e) => setUserTeam(e.target.value)}
            className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            {seeds.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name} — ${t.cap} cap · {t.roster.length} kept
              </option>
            ))}
          </select>

          <div className="mt-5 text-sm font-medium text-slate-700 dark:text-slate-300">Format</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <ModeCard
              active={mode === "live"}
              onClick={() => setMode("live")}
              title="Live auction"
              body="Real time. Each player gets a clock, the AI teams bid against you as it runs, and any bid extends the timer."
            />
            <ModeCard
              active={mode === "manual"}
              onClick={() => setMode("manual")}
              title="Turn by turn"
              body="No clock. Enter one max bid per player and everything resolves instantly (second-highest bid + $1)."
            />
          </div>

          {mode === "live" && (
            <div className="mt-4">
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Pace</div>
              <div className="mt-2 flex gap-2">
                {SPEED_KEYS.map((k) => (
                  <button
                    key={k}
                    onClick={() => setSpeed(k)}
                    className={`rounded-md border px-3 py-1.5 text-sm ${
                      speed === k
                        ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                        : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {SPEED_LABEL[k]}
                    <span className="ml-1 font-mono text-xs text-slate-400">
                      {SPEED_PRESETS[k].clockMs / 1000}s
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <label
                htmlFor="valuation-noise"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Manager valuation noise
              </label>
              <span className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                {valuationNoisePct === 0 ? "off" : `±${valuationNoisePct}%`}
              </span>
            </div>
            <input
              id="valuation-noise"
              type="range"
              min={0}
              max={MAX_VALUATION_SPREAD * 100}
              step={5}
              value={valuationNoisePct}
              onChange={(e) => setValuationNoisePct(Number(e.target.value))}
              className="mt-2 w-full accent-indigo-600"
            />
            <div className="flex justify-between font-mono text-[10px] text-slate-400">
              <span>0%</span>
              <span>±{MAX_VALUATION_SPREAD * 100}%</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {valuationNoisePct === 0
                ? "Every rival prices players exactly at Draft Sharks market value."
                : `Each rival manager gets a private price for every player, up to ±${valuationNoisePct}% off market — and sticks to it all draft. Higher noise means more rivals who overpay for their guys and let yours go cheap. Your own book value is always shown at market.`}
            </p>
          </div>

          <button
            onClick={start}
            className="mt-5 w-full rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
          >
            Start draft
          </button>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Players are nominated highest-value first (with some randomness). In the live auction
            you bid up in real time — or set an auto-bid ceiling and let your proxy answer for you.
            “Skip to my next need” fast-forwards past players you don’t want.
          </p>
        </div>
      </div>
    );
  }

  // ── drafting screen ──
  const capLeft = me.cap;
  const spotsLeft = ROSTER_SPOTS - size(me);
  const needs = starterNeeds(me);
  const needsLeft = needs.filter((n) => !n.filled).length;
  const lineup = startingLineup(me);
  const suggestion = nominee ? suggestedBid(me, nominee) : 0;
  const bidVal = Number(bidInput) || 0;
  const overAfford = bidVal > capLeft - spotsLeft + 1;
  const affordable = Math.max(0, capLeft - Math.max(0, spotsLeft - 1));
  const userLeads = !!lot && lot.highBidder === userTeam;
  const secsLeft = lot ? msLeft(lot, now) / 1000 : 0;
  const clockFrac = lot ? Math.min(1, msLeft(lot, now) / cfg.clockMs) : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Mock Draft · <span className="text-indigo-600 dark:text-indigo-400">{userTeam}</span>
          <span className="ml-2 align-middle text-xs font-medium uppercase tracking-wide text-slate-400">
            {mode === "live" ? "live auction" : "turn by turn"}
            {valuationNoisePct > 0 && ` · ±${valuationNoisePct}% valuations`}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          {mode === "live" && !complete && (
            <>
              <select
                value={speed}
                onChange={(e) => setSpeed(e.target.value as SpeedKey)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
              >
                {SPEED_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {SPEED_LABEL[k]}
                  </option>
                ))}
              </select>
              <button
                onClick={togglePause}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {paused ? "▶ Resume" : "⏸ Pause"}
              </button>
            </>
          )}
          <button
            onClick={reset}
            className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Restart
          </button>
        </div>
      </div>

      {/* command bar */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cap left" value={`$${capLeft}`} tone={capLeft < 10 ? "warn" : "default"} />
        <Stat label="Spots left" value={spotsLeft} />
        <Stat label="Roster" value={`${size(me)}/${ROSTER_SPOTS}`} />
        <Stat
          label="Starter needs"
          value={needsLeft === 0 ? "set ✓" : String(needsLeft)}
          tone={needsLeft === 0 ? "good" : "default"}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {needs.map((n) => (
          <span
            key={n.pos}
            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
              n.filled
                ? "border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                : "border-slate-300 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
            }`}
          >
            {n.pos} {n.have}/{n.want}
          </span>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        {/* left: auction */}
        <div>
          {mode === "live" && s.sold && (
            <SoldCard
              name={s.sold.player.name}
              pos={s.sold.player.pos}
              winner={s.sold.winner}
              price={s.sold.price}
              userWon={s.sold.userWon}
            />
          )}

          {mode === "live" && !s.sold && lot && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  On the block · nominated by {lot.nominator}
                </div>
                <div
                  className={`font-mono text-lg font-bold tabular-nums ${
                    paused
                      ? "text-slate-400"
                      : secsLeft <= 3
                        ? "text-red-600 dark:text-red-400"
                        : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {paused ? "paused" : `${secsLeft.toFixed(1)}s`}
                </div>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
                    secsLeft <= 3 ? "bg-red-500" : "bg-indigo-500"
                  }`}
                  style={{ width: `${clockFrac * 100}%` }}
                />
              </div>

              <div className="mt-3 flex items-center gap-3">
                <PosBadge pos={lot.player.pos} />
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  {lot.player.name}
                </span>
                {lot.player.nflTeam && (
                  <span className="text-sm text-slate-400">{lot.player.nflTeam}</span>
                )}
              </div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Market value <span className="font-mono font-semibold">${lot.player.mv}</span> · the
                book says pay up to <span className="font-mono font-semibold">${suggestion}</span>
              </div>

              {/* the board */}
              <div className="mt-4 flex items-end justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Current bid
                  </div>
                  <div className="font-mono text-3xl font-bold text-slate-900 dark:text-white">
                    ${lot.price}
                  </div>
                </div>
                <div className="text-right text-sm">
                  {lot.highBidder ? (
                    <span
                      className={
                        userLeads
                          ? "font-semibold text-indigo-600 dark:text-indigo-400"
                          : "text-slate-600 dark:text-slate-300"
                      }
                    >
                      {userLeads ? "You lead" : lot.highBidder}
                    </span>
                  ) : (
                    <span className="italic text-slate-400">no bids yet</span>
                  )}
                  {lot.userMax > 0 && (
                    <div className="mt-0.5 text-xs text-slate-400">
                      auto-bidding to <span className="font-mono">${lot.userMax}</span>
                      <button
                        onClick={() => autoBidTo(0)}
                        className="ml-1 underline hover:text-slate-600 dark:hover:text-slate-200"
                      >
                        cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => bidLive(minUserBid(lot))}
                  disabled={userLeads || minUserBid(lot) > affordable}
                  className="rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Bid ${minUserBid(lot)}
                </button>
                <button
                  onClick={() => bidLive(lot.price + 5)}
                  disabled={userLeads || lot.price + 5 > affordable}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  +$5
                </button>
                <div className="ml-auto flex items-end gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-500">
                      Auto-bid up to
                    </label>
                    <div className="mt-1 flex items-center gap-1">
                      <span className="text-slate-400">$</span>
                      <input
                        type="number"
                        min={0}
                        value={bidInput}
                        onChange={(e) => setBidInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") autoBidTo(Math.min(bidVal, affordable));
                        }}
                        className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => autoBidTo(Math.min(bidVal, affordable))}
                    className="rounded-md border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
                  >
                    Set max
                  </button>
                </div>
              </div>
              {overAfford && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  ${bidVal} leaves little for your remaining {spotsLeft} spots (max ${affordable}).
                </p>
              )}

              {/* live bid feed */}
              <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Bidding
                </div>
                {lot.bids.length === 0 ? (
                  <div className="text-sm italic text-slate-400">
                    Waiting for an opening bid…
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {[...lot.bids]
                      .reverse()
                      .slice(0, 6)
                      .map((b, i) => (
                        <div
                          key={`${b.bidder}-${b.amount}-${b.at}`}
                          className={`flex justify-between text-sm ${
                            i === 0 ? "font-semibold" : "text-slate-500 dark:text-slate-400"
                          } ${b.isUser ? "text-indigo-600 dark:text-indigo-400" : ""}`}
                        >
                          <span>{b.isUser ? "You" : b.bidder}</span>
                          <span className="font-mono">${b.amount}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  onClick={skipToNeed}
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Skip to my next need
                </button>
                <button
                  onClick={finishRest}
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Auto-finish rest
                </button>
                {nextUp && s.pool.length > 1 && (
                  <span className="self-center text-xs text-slate-400">
                    up next: {s.pool[1].name} (${s.pool[1].mv})
                  </span>
                )}
              </div>
            </div>
          )}

          {mode === "manual" && nominee && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                On the block
              </div>
              <div className="mt-1 flex items-center gap-3">
                <PosBadge pos={nominee.pos} />
                <span className="text-xl font-bold text-slate-900 dark:text-white">
                  {nominee.name}
                </span>
                {nominee.nflTeam && (
                  <span className="text-sm text-slate-400">{nominee.nflTeam}</span>
                )}
              </div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Market value <span className="font-mono font-semibold">${nominee.mv}</span> · the
                book says pay up to <span className="font-mono font-semibold">${suggestion}</span>
              </div>

              <div className="mt-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500">Your max bid</label>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-slate-400">$</span>
                    <input
                      type="number"
                      min={0}
                      value={bidInput}
                      onChange={(e) => setBidInput(e.target.value)}
                      className="w-24 rounded-md border border-slate-300 bg-white px-2 py-1.5 font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    />
                  </div>
                </div>
                <button
                  onClick={bidNow}
                  className="rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
                >
                  Bid ${bidVal}
                </button>
                <button
                  onClick={pass}
                  className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Pass
                </button>
              </div>
              {overAfford && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  That bid leaves little for your remaining {spotsLeft} spots.
                </p>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                  onClick={skipToNeed}
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Skip to my next need
                </button>
                <button
                  onClick={finishRest}
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Auto-finish rest
                </button>
              </div>
            </div>
          )}

          {complete && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-5 dark:border-green-800 dark:bg-green-950">
              <div className="text-lg font-bold text-green-800 dark:text-green-300">
                Draft complete
              </div>
              <p className="mt-1 text-sm text-green-700 dark:text-green-400">
                Every valued free agent has been auctioned. Your final lineup is on the right.
              </p>
            </div>
          )}

          {/* draft log */}
          <div className="mt-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Draft log
            </h2>
            <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
              {s.log.length === 0 && (
                <div className="p-3 text-sm text-slate-400">No picks yet.</div>
              )}
              {s.log.map((r, i) => (
                <div
                  key={`${r.player.id}-${i}`}
                  className={`flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5 text-sm last:border-0 dark:border-slate-800 ${
                    r.userWon ? "bg-indigo-50 dark:bg-indigo-950/40" : ""
                  }`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <PosBadge pos={r.player.pos} />
                    <span className="truncate text-slate-700 dark:text-slate-200">
                      {r.player.name}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                    {r.winner ? (
                      <>
                        <span className="font-mono font-semibold">${r.price}</span>{" "}
                        <span
                          className={
                            r.userWon ? "font-semibold text-indigo-600 dark:text-indigo-400" : ""
                          }
                        >
                          {r.userWon ? "YOU" : r.winner}
                        </span>
                      </>
                    ) : (
                      <span className="italic text-slate-400">no sale</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* right: my roster + league board */}
        <div className="space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Your starting lineup
            </h2>
            <div className="space-y-1">
              {lineup.map((ls, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="w-10 shrink-0 font-mono text-xs font-semibold text-slate-400">
                    {ls.slot}
                  </span>
                  {ls.player ? (
                    <>
                      <span className="flex-1 truncate text-slate-800 dark:text-slate-100">
                        {ls.player.name}
                      </span>
                      <span className="font-mono text-slate-400">${ls.player.salary}</span>
                    </>
                  ) : (
                    <span className="flex-1 italic text-slate-300 dark:text-slate-600">empty</span>
                  )}
                </div>
              ))}
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-slate-500">
                Full roster ({size(me)})
              </summary>
              <div className="mt-2 space-y-0.5">
                {[...me.roster]
                  .sort((a, b) => b.salary - a.salary)
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-1.5 truncate">
                        <PosBadge pos={p.pos} />
                        <span className="truncate text-slate-600 dark:text-slate-300">{p.name}</span>
                      </span>
                      <span className="font-mono text-slate-400">${p.salary}</span>
                    </div>
                  ))}
              </div>
            </details>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              League board
            </h2>
            <div className="space-y-0.5">
              {[...s.teams]
                .sort((a, b) => b.cap - a.cap)
                .map((t) => (
                  <div
                    key={t.name}
                    className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 text-sm ${
                      t.isUser ? "bg-indigo-50 font-semibold dark:bg-indigo-950/40" : ""
                    } ${
                      lot?.highBidder === t.name && !t.isUser
                        ? "ring-1 ring-inset ring-amber-300 dark:ring-amber-700"
                        : ""
                    }`}
                  >
                    <span className="truncate text-slate-700 dark:text-slate-200">
                      {t.isUser ? "★ " : ""}
                      {t.name}
                    </span>
                    <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                      <span className="font-mono">${t.cap}</span> ·{" "}
                      <span className="text-xs">{ROSTER_SPOTS - size(t)} open</span> ·{" "}
                      <span className="text-xs">{startableCount(t, "QB")}QB</span>
                    </span>
                  </div>
                ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              committed = ${committed(me)} · cap {season}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border p-3 text-left ${
        active
          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50"
          : "border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      }`}
    >
      <div
        className={`text-sm font-semibold ${
          active ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-200"
        }`}
      >
        {title}
      </div>
      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{body}</div>
    </button>
  );
}

function SoldCard({
  name,
  pos,
  winner,
  price,
  userWon,
}: {
  name: string;
  pos: Pos;
  winner: string | null;
  price: number;
  userWon: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ${
        userWon
          ? "border-indigo-300 bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/60"
          : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {winner ? "Sold" : "No sale"}
      </div>
      <div className="mt-1 flex items-center gap-3">
        <PosBadge pos={pos} />
        <span className="text-xl font-bold text-slate-900 dark:text-white">{name}</span>
      </div>
      <div className="mt-2 text-lg">
        {winner ? (
          <>
            <span className="font-mono font-bold text-slate-900 dark:text-white">${price}</span>{" "}
            <span className="text-slate-500 dark:text-slate-400">to</span>{" "}
            <span
              className={
                userWon
                  ? "font-bold text-indigo-600 dark:text-indigo-400"
                  : "font-semibold text-slate-700 dark:text-slate-200"
              }
            >
              {userWon ? "YOU" : winner}
            </span>
          </>
        ) : (
          <span className="italic text-slate-400">nobody bid</span>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-green-600 dark:text-green-400"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400"
        : "text-slate-900 dark:text-white";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 font-mono text-xl font-bold ${toneClass}`}>{value}</div>
    </div>
  );
}
