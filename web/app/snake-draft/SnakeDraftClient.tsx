"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_VALUATION_SPREAD, randomValuationSeed } from "@/lib/valuation-noise";
import {
  autoPick,
  DEFAULT_SETTINGS,
  isComplete,
  isUserOnClock,
  LINEUP_1QB,
  LINEUP_SUPERFLEX,
  makePick,
  MAX_ROUNDS,
  MAX_TEAMS,
  MIN_ROUNDS,
  MIN_TEAMS,
  newDraft,
  onClock,
  openStarterSlots,
  POS_LIST,
  posCount,
  replacementRanks,
  scoreTeams,
  simToEnd,
  simToUser,
  startingLineup,
  suggestedPick,
  upcomingPicks,
  type BoardPlayer,
  type DraftSettings,
  type LineupSettings,
  type MarketPlayer,
  type Pos,
  type SnakeDraft,
} from "@/lib/snake-draft-engine";

interface Props {
  pool: MarketPlayer[];
  season: number;
}

/** How long a bot "thinks" before its pick lands, per pace setting. */
const PACE = { instant: 0, fast: 250, normal: 700 } as const;
type PaceKey = keyof typeof PACE;
const PACE_KEYS = Object.keys(PACE) as PaceKey[];
const PACE_LABEL: Record<PaceKey, string> = {
  instant: "Instant",
  fast: "Fast",
  normal: "Normal",
};

const POS_STYLE: Record<Pos, string> = {
  QB: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  RB: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  WR: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  TE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

const LINEUP_FIELDS: { key: keyof LineupSettings; label: string }[] = [
  { key: "QB", label: "QB" },
  { key: "RB", label: "RB" },
  { key: "WR", label: "WR" },
  { key: "TE", label: "TE" },
  { key: "FLEX", label: "FLEX" },
  { key: "SF", label: "SFLEX" },
];

function PosBadge({ pos }: { pos: Pos }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-bold ${POS_STYLE[pos]}`}>
      {pos}
    </span>
  );
}

const sameLineup = (a: LineupSettings, b: LineupSettings) =>
  LINEUP_FIELDS.every((f) => a[f.key] === b[f.key]);

export default function SnakeDraftClient({ pool, season }: Props) {
  const [settings, setSettings] = useState<DraftSettings>(DEFAULT_SETTINGS);
  const [noisePct, setNoisePct] = useState(0);
  const [pace, setPace] = useState<PaceKey>("fast");
  const [draft, setDraft] = useState<SnakeDraft | null>(null);
  const [filter, setFilter] = useState<Pos | "ALL">("ALL");
  const [query, setQuery] = useState("");

  const setLineup = (patch: Partial<LineupSettings>) =>
    setSettings((s) => ({ ...s, lineup: { ...s.lineup, ...patch } }));

  // bots pick on a timer so the draft reads like a draft rather than a jump cut
  useEffect(() => {
    if (!draft || isComplete(draft) || isUserOnClock(draft)) return;
    const delay = PACE[pace];
    const id = setTimeout(() => {
      setDraft((d) => (d && !isUserOnClock(d) && !isComplete(d) ? autoPick(d) : d));
    }, delay);
    return () => clearTimeout(id);
  }, [draft, pace]);

  const board = useMemo(() => {
    if (!draft) return [];
    const q = query.trim().toLowerCase();
    return draft.board
      .filter((p) => (filter === "ALL" || p.pos === filter) && (!q || p.name.toLowerCase().includes(q)))
      .slice(0, 200);
  }, [draft, filter, query]);

  function start() {
    setDraft(
      newDraft(settings, pool, {
        spread: noisePct / 100,
        seed: randomValuationSeed(), // fresh opinions every draft
      }),
    );
  }

  // ── setup ──
  if (!draft) {
    const repl = replacementRanks(settings);
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Snake Draft</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">
          A practice snake draft for any redraft league — this one is not tied to the Ottoneu
          league. Pick the size of the league, where you draft, and what a starting lineup looks
          like; the AI teams draft against you off the {season} half-PPR consensus board, re-priced
          as value over replacement for the format you chose.
        </p>

        <div className="mt-6 space-y-5 rounded-lg border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="grid gap-4 sm:grid-cols-3">
            <NumberField
              id="teams"
              label="Teams"
              value={settings.teams}
              min={MIN_TEAMS}
              max={MAX_TEAMS}
              onChange={(n) =>
                setSettings((s) => ({ ...s, teams: n, slot: Math.min(s.slot, n) }))
              }
            />
            <div>
              <label
                htmlFor="slot"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                My draft slot
              </label>
              <select
                id="slot"
                value={settings.slot}
                onChange={(e) => setSettings((s) => ({ ...s, slot: Number(e.target.value) }))}
                className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {Array.from({ length: settings.teams }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    Pick {n}
                  </option>
                ))}
              </select>
            </div>
            <NumberField
              id="rounds"
              label="Rounds"
              value={settings.rounds}
              min={MIN_ROUNDS}
              max={MAX_ROUNDS}
              onChange={(n) => setSettings((s) => ({ ...s, rounds: n }))}
            />
          </div>

          <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
            Your picks:{" "}
            {snakePicksPreview(settings.teams, settings.rounds, settings.slot).join(" · ")}
          </p>

          <div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Starting lineup
              </span>
              <span className="flex gap-2">
                <PresetButton
                  active={sameLineup(settings.lineup, LINEUP_1QB)}
                  onClick={() => setLineup(LINEUP_1QB)}
                  label="1 QB"
                />
                <PresetButton
                  active={sameLineup(settings.lineup, LINEUP_SUPERFLEX)}
                  onClick={() => setLineup(LINEUP_SUPERFLEX)}
                  label="Superflex"
                />
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-6">
              {LINEUP_FIELDS.map((f) => (
                <NumberField
                  key={f.key}
                  id={`lineup-${f.key}`}
                  label={f.label}
                  value={settings.lineup[f.key]}
                  min={0}
                  max={6}
                  compact
                  onChange={(n) => setLineup({ [f.key]: n } as Partial<LineupSettings>)}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Replacement level for this format:{" "}
              {POS_LIST.map((p) => `${p}${repl[p]}`).join(" · ")} — a player is worth what he beats
              that baseline by, which is why quarterbacks climb the board the moment you add a
              superflex slot.
            </p>
          </div>

          <div>
            <div className="flex items-baseline justify-between">
              <label
                htmlFor="valuation-noise"
                className="text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Manager valuation noise
              </label>
              <span className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                {noisePct === 0 ? "off" : `±${noisePct}%`}
              </span>
            </div>
            <input
              id="valuation-noise"
              type="range"
              min={0}
              max={MAX_VALUATION_SPREAD * 100}
              step={5}
              value={noisePct}
              onChange={(e) => setNoisePct(Number(e.target.value))}
              className="mt-2 w-full accent-indigo-600"
            />
            <div className="flex justify-between font-mono text-[10px] text-slate-400">
              <span>0%</span>
              <span>±{MAX_VALUATION_SPREAD * 100}%</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {noisePct === 0
                ? "Every rival ranks the board exactly the way it is shown to you."
                : `Each rival gets a private value for every player, up to ±${noisePct}% off the board — and sticks to it all draft. Higher noise means more reaches, and more of your targets sliding.`}
            </p>
          </div>

          <div>
            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">Pace</div>
            <div className="mt-2 flex gap-2">
              {PACE_KEYS.map((k) => (
                <PresetButton
                  key={k}
                  active={pace === k}
                  onClick={() => setPace(k)}
                  label={PACE_LABEL[k]}
                />
              ))}
            </div>
          </div>

          <button
            onClick={start}
            className="w-full rounded-md bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-500"
          >
            Start draft
          </button>
        </div>
      </div>
    );
  }

  // ── drafting ──
  const oc = onClock(draft);
  const done = isComplete(draft);
  const myTurn = isUserOnClock(draft);
  const me = draft.teams[draft.settings.slot - 1];
  const lineup = startingLineup(me, draft.settings.lineup);
  const bench = me.roster.filter((p) => !lineup.some((s) => s.player?.id === p.id));
  const suggestion = myTurn ? suggestedPick(draft) : null;
  const myNext = upcomingPicks(draft, draft.settings.slot);
  const recent = [...draft.picks].reverse().slice(0, 12);
  const scores = done ? scoreTeams(draft) : [];

  const pick = (p: BoardPlayer) => setDraft((d) => (d ? makePick(d, p) : d));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          Snake Draft
          <span className="ml-2 align-middle text-xs font-medium uppercase tracking-wide text-slate-400">
            {draft.settings.teams} teams · pick {draft.settings.slot} · {draft.settings.rounds}{" "}
            rounds
            {noisePct > 0 && ` · ±${noisePct}% valuations`}
          </span>
        </h1>
        <div className="flex items-center gap-2">
          {!done && (
            <>
              <button
                onClick={() => setDraft((d) => (d ? simToUser(d) : d))}
                disabled={myTurn}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Skip to my pick
              </button>
              <button
                onClick={() => setDraft((d) => (d ? simToEnd(d) : d))}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Auto-draft rest
              </button>
            </>
          )}
          <button
            onClick={() => setDraft(null)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            New draft
          </button>
        </div>
      </div>

      {/* on the clock */}
      <div
        className={`mt-4 rounded-lg border p-4 ${
          myTurn
            ? "border-indigo-400 bg-indigo-50 dark:border-indigo-600 dark:bg-indigo-950/40"
            : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
        }`}
      >
        {done ? (
          <div className="text-lg font-semibold text-slate-900 dark:text-white">
            Draft complete — {draft.picks.length} picks
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Round {oc!.round} · Pick {oc!.pickInRound} · #{oc!.overall} overall
              </span>
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                {myTurn ? "You are on the clock" : `${oc!.team.name} is picking…`}
              </div>
            </div>
            {myTurn && suggestion && (
              <button
                onClick={() => pick(suggestion)}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Take best available: {suggestion.name} ({suggestion.pos})
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* board */}
        <div className="lg:col-span-2">
          {done ? (
            <ResultsTable scores={scores} userSlot={draft.settings.slot} />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {(["ALL", ...POS_LIST] as const).map((p) => (
                  <PresetButton
                    key={p}
                    active={filter === p}
                    onClick={() => setFilter(p)}
                    label={p}
                  />
                ))}
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search players…"
                  className="ml-auto w-48 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Player</th>
                      <th className="px-3 py-2">Pos</th>
                      <th className="px-3 py-2 text-right">Value</th>
                      <th className="px-3 py-2 text-right">Market</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {board.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-900">
                        <td className="px-3 py-1.5 font-mono text-xs text-slate-400">{p.rank}</td>
                        <td className="px-3 py-1.5 font-medium text-slate-900 dark:text-white">
                          {p.name}
                          <span className="ml-2 text-xs text-slate-400">{p.nflTeam}</span>
                        </td>
                        <td className="px-3 py-1.5">
                          <PosBadge pos={p.pos} />
                          <span className="ml-1 font-mono text-xs text-slate-400">{p.posRank}</span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-700 dark:text-slate-300">
                          {p.value.toFixed(0)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono text-xs text-slate-400">
                          ${p.mv}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <button
                            onClick={() => pick(p)}
                            disabled={!myTurn}
                            className="rounded border border-indigo-300 px-2 py-0.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-30 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
                          >
                            Draft
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* my team + feed */}
        <div className="space-y-4">
          <Panel title={`My roster (${me.roster.length}/${draft.settings.rounds})`}>
            <ul className="space-y-1 text-sm">
              {lineup.map((s, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2">
                  <span className="w-14 shrink-0 font-mono text-xs uppercase text-slate-400">
                    {s.slot}
                  </span>
                  <span
                    className={`flex-1 truncate ${
                      s.player
                        ? "text-slate-900 dark:text-white"
                        : "italic text-slate-400 dark:text-slate-600"
                    }`}
                  >
                    {s.player?.name ?? "empty"}
                  </span>
                  {s.player && (
                    <span className="font-mono text-xs text-slate-400">
                      {s.player.value.toFixed(0)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {bench.length > 0 && (
              <>
                <div className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Bench
                </div>
                <ul className="mt-1 space-y-1 text-sm">
                  {bench.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-2">
                      <span className="flex-1 truncate text-slate-700 dark:text-slate-300">
                        {p.name}
                      </span>
                      <PosBadge pos={p.pos} />
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-slate-500 dark:text-slate-400">
              {POS_LIST.map((p) => (
                <span key={p}>
                  {p} {posCount(me, p)}
                </span>
              ))}
              <span>· {openStarterSlots(me, draft.settings.lineup)} starters open</span>
            </div>
            {!done && (
              <div className="mt-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                Next up: {myNext.slice(0, 3).map((n) => `#${n}`).join(", ") || "—"}
              </div>
            )}
          </Panel>

          <Panel title="Recent picks">
            {recent.length === 0 ? (
              <p className="text-sm italic text-slate-400">No picks yet.</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {recent.map((p) => (
                  <li key={p.overall} className="flex items-baseline gap-2">
                    <span className="w-10 shrink-0 font-mono text-xs text-slate-400">
                      {p.round}.{String(p.pickInRound).padStart(2, "0")}
                    </span>
                    <PosBadge pos={p.player.pos} />
                    <span
                      className={`flex-1 truncate ${
                        p.isUser
                          ? "font-semibold text-indigo-600 dark:text-indigo-400"
                          : "text-slate-700 dark:text-slate-300"
                      }`}
                    >
                      {p.player.name}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{p.teamName}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ── small presentational helpers ──

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {title}
      </h2>
      {children}
    </div>
  );
}

function PresetButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-3 py-1.5 text-sm ${
        active
          ? "border-indigo-500 bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
          : "border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      }`}
    >
      {label}
    </button>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  compact,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  compact?: boolean;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className={`block font-medium text-slate-700 dark:text-slate-300 ${
          compact ? "text-xs uppercase tracking-wide" : "text-sm"
        }`}
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.round(n))));
        }}
        className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
      />
    </div>
  );
}

function ResultsTable({
  scores,
  userSlot,
}: {
  scores: ReturnType<typeof scoreTeams>;
  userSlot: number;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full text-sm">
        <thead className="bg-slate-100 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Team</th>
            <th className="px-3 py-2 text-right">Starters</th>
            <th className="px-3 py-2 text-right">Roster</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {scores.map((s) => (
            <tr
              key={s.team.slot}
              className={s.team.slot === userSlot ? "bg-indigo-50 dark:bg-indigo-950/40" : ""}
            >
              <td className="px-3 py-1.5 font-mono text-xs text-slate-400">{s.rank}</td>
              <td className="px-3 py-1.5 font-medium text-slate-900 dark:text-white">
                {s.team.name}
              </td>
              <td className="px-3 py-1.5 text-right font-mono">{s.starterValue.toFixed(0)}</td>
              <td className="px-3 py-1.5 text-right font-mono text-slate-400">
                {s.totalValue.toFixed(0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The first few overall picks a slot owns — shown on the setup screen. */
function snakePicksPreview(teams: number, rounds: number, slot: number): string[] {
  const out: string[] = [];
  for (let r = 1; r <= Math.min(rounds, 5); r++) {
    const pickInRound = r % 2 === 1 ? slot : teams - slot + 1;
    out.push(`#${(r - 1) * teams + pickInRound}`);
  }
  if (rounds > 5) out.push("…");
  return out;
}
