"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import type { Matchup } from "@/lib/standings";
import { MAX_NAME_LENGTH } from "@/lib/schemas/pickem";

interface Props {
  season: number;
  week: number;
  games: Matchup[];
  /** "2-0" by team id. */
  records: Record<number, string>;
  /** Saved picks, team id by game id. */
  initialPicks: Record<number, number>;
  /** The saved board name, or null before the player has chosen one. */
  initialName: string | null;
  /** What to prefill the name box with: the bound team, if any. */
  suggestedName: string | null;
  /** "Thu, Sep 17, 8:00 PM ET". */
  locksLabel: string;
}

/**
 * The open week's pick sheet: one card per game, tap a team to pick it.
 *
 * Every tap saves on its own — there is no submit button to forget, because
 * the lock is a clock and a pick that was never sent is a pick lost. The tap
 * updates the card at once and rolls back if the server refuses; a 409 means
 * the week locked underneath the page, so it reloads into the locked view.
 * Tapping the team already picked clears the pick.
 */
export default function PickSheet({
  season,
  week,
  games,
  records,
  initialPicks,
  initialName,
  suggestedName,
  locksLabel,
}: Props) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<number, number>>(initialPicks);
  const [name, setName] = useState<string | null>(initialName);
  const [editingName, setEditingName] = useState(initialName === null);
  const [draftName, setDraftName] = useState(initialName ?? suggestedName ?? "");
  const [savingGame, setSavingGame] = useState<number | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [error, setError] = useState("");

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    setError("");
    try {
      const res = await fetch("/api/pickem/name", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: draftName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't save that name.");
        return;
      }
      setName(data.displayName);
      setDraftName(data.displayName);
      setEditingName(false);
    } catch {
      setError("Couldn't reach the server. Try again in a moment.");
    } finally {
      setSavingName(false);
    }
  };

  const pick = async (gameId: number, teamId: number) => {
    const previous = picks[gameId];
    const next = previous === teamId ? null : teamId;
    setPicks((p) => {
      const copy = { ...p };
      if (next === null) delete copy[gameId];
      else copy[gameId] = next;
      return copy;
    });
    setSavingGame(gameId);
    setError("");

    const rollBack = () =>
      setPicks((p) => {
        const copy = { ...p };
        if (previous === undefined) delete copy[gameId];
        else copy[gameId] = previous;
        return copy;
      });

    try {
      const res = await fetch("/api/pickem/pick", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ season, week, gameId, teamId: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        rollBack();
        setError(data.error || "Couldn't save that pick.");
        if (res.status === 409) router.refresh();
      }
    } catch {
      rollBack();
      setError("Couldn't reach the server. That pick isn't saved.");
    } finally {
      setSavingGame(null);
    }
  };

  const pickedCount = games.filter((g) => picks[g.game_id] !== undefined).length;
  const canPick = name !== null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-raised p-4">
        {editingName ? (
          <form onSubmit={saveName} className="flex flex-wrap items-end gap-2">
            <div>
              <label
                htmlFor="pickem-name"
                className="block text-xs font-medium uppercase tracking-wide text-ink-subtle"
              >
                Your name on the board
              </label>
              <input
                id="pickem-name"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={MAX_NAME_LENGTH}
                placeholder="e.g. Couch Coach"
                className="mt-1 w-64 max-w-full rounded border border-line-strong bg-raised px-2 py-1.5 text-sm text-ink"
              />
            </div>
            <button
              type="submit"
              disabled={savingName || draftName.trim().length === 0}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingName ? "Saving…" : name ? "Save name" : "Start picking"}
            </button>
            {name && (
              <button
                type="button"
                onClick={() => {
                  setDraftName(name);
                  setEditingName(false);
                }}
                className="px-2 py-2 text-sm text-ink-subtle hover:text-ink"
              >
                Cancel
              </button>
            )}
          </form>
        ) : (
          <p className="text-sm text-ink-muted">
            Playing as <strong className="text-ink">{name}</strong>{" "}
            <button
              onClick={() => setEditingName(true)}
              className="text-accent hover:underline"
            >
              change
            </button>
          </p>
        )}
        <p className="text-sm text-ink-subtle">
          {pickedCount} of {games.length} picked · locks {locksLabel}
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {games.map((game) => {
          const side = (id: number, teamName: string, label: string) => {
            const chosen = picks[game.game_id] === id;
            return (
              <button
                onClick={() => pick(game.game_id, id)}
                disabled={!canPick}
                aria-pressed={chosen}
                className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-3 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  chosen
                    ? "border-accent bg-accent-soft text-ink"
                    : "border-line text-ink-muted hover:border-line-strong hover:bg-sunken"
                }`}
              >
                <span className="flex items-center gap-1 text-sm font-semibold leading-tight">
                  {chosen && (
                    <Check size={14} aria-hidden="true" className="shrink-0 text-accent" />
                  )}
                  {teamName}
                </span>
                <span className="text-xs text-ink-subtle">
                  {label}
                  {records[id] ? ` · ${records[id]}` : ""}
                </span>
              </button>
            );
          };
          return (
            <li
              key={game.game_id}
              className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 rounded-lg border border-line bg-raised p-3"
              aria-busy={savingGame === game.game_id}
            >
              {side(game.away_team_id, game.away_team_name, "Away")}
              <span aria-hidden="true" className="self-center text-xs font-medium text-ink-subtle">
                @
              </span>
              {side(game.home_team_id, game.home_team_name, "Home")}
            </li>
          );
        })}
      </ul>

      {!canPick && (
        <p className="text-sm text-ink-subtle">Choose your board name to start picking.</p>
      )}
    </section>
  );
}
