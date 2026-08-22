"use client";

import { useEffect, useState } from "react";
import type { MockDraftTeamSeed } from "@/lib/mock-draft";
import {
  applyWin,
  committed,
  fillsANeed,
  ROSTER_SPOTS,
  resolveNominee,
  size,
  startableCount,
  starterNeeds,
  startingLineup,
  suggestedBid,
  type BidResult,
  type DraftTeam,
  type FAPlayer,
  type Pos,
} from "@/lib/mock-draft-engine";

interface Props {
  teams: MockDraftTeamSeed[];
  faPool: FAPlayer[];
  season: number;
}

interface DraftState {
  teams: DraftTeam[];
  pool: FAPlayer[];
  log: BidResult[];
}

const POS_STYLE: Record<Pos, string> = {
  QB: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  RB: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  WR: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  TE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  K: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

function PosBadge({ pos }: { pos: Pos }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${POS_STYLE[pos]}`}>
      {pos}
    </span>
  );
}

/** clone state so React sees a new object tree (teams' rosters are mutated by applyWin) */
function cloneState(st: DraftState): DraftState {
  return {
    teams: st.teams.map((t) => ({ ...t, roster: [...t.roster] })),
    pool: [...st.pool],
    log: [...st.log],
  };
}

/** resolve the current nominee (pool[0]) into a NEW state */
function step(st: DraftState, userTeam: string, userBid: number): DraftState {
  const next = cloneState(st);
  const player = next.pool[0];
  const res = resolveNominee(next.teams, player, userTeam, userBid);
  if (res.winner) {
    const w = next.teams.find((t) => t.name === res.winner);
    if (w) applyWin(w, player, res.price);
  }
  next.pool.shift();
  next.log.unshift(res);
  return next;
}

export default function MockDraftClient({ teams: seeds, faPool, season }: Props) {
  const [phase, setPhase] = useState<"setup" | "drafting">("setup");
  const [userTeam, setUserTeam] = useState<string>(seeds[0]?.name ?? "");
  const [bidInput, setBidInput] = useState<string>("0");
  const [state, setState] = useState<DraftState | null>(null);

  const s = state;
  const me = s?.teams.find((t) => t.isUser) ?? null;
  const nominee: FAPlayer | null = s && s.pool.length > 0 ? s.pool[0] : null;

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
    setState({ teams, pool: [...faPool], log: [] });
    setPhase("drafting");
  }

  function reset() {
    setState(null);
    setPhase("setup");
  }

  function bidNow() {
    if (state && state.pool.length) setState(step(state, userTeam, Number(bidInput) || 0));
  }
  function pass() {
    if (state && state.pool.length) setState(step(state, userTeam, 0));
  }

  // auto-pass until the next nominee fills one of my needs (or the pool empties)
  function skipToNeed() {
    if (!state) return;
    let next = cloneState(state);
    let guard = 0;
    while (next.pool.length > 0 && guard++ < 1000) {
      const user = next.teams.find((t) => t.isUser)!;
      if (fillsANeed(user, next.pool[0])) break;
      next = step(next, userTeam, 0);
    }
    setState(next);
  }

  // auto-pass the rest of the draft (rivals fill out; I'm done)
  function finishRest() {
    if (!state) return;
    let next = cloneState(state);
    let guard = 0;
    while (next.pool.length > 0 && guard++ < 3000) next = step(next, userTeam, 0);
    setState(next);
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
          <button
            onClick={start}
            className="mt-4 w-full rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
          >
            Start draft
          </button>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Players are nominated highest-value first. Set your max bid and win the auction (you pay
            the second-highest bid + $1), or pass. Use “Skip to my next need” to fast-forward past
            players you don’t want.
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Mock Draft · <span className="text-indigo-600 dark:text-indigo-400">{userTeam}</span>
        </h1>
        <button
          onClick={reset}
          className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Restart
        </button>
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
          {nominee ? (
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
          ) : (
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
