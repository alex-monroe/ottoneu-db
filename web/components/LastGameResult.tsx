import type { LastGame } from "@/lib/power-rankings";

const RESULT_STYLE: Record<NonNullable<LastGame["result"]>, string> = {
  W: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  L: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  T: "bg-sunken text-ink-muted",
};

function score(points: number | null): string {
  return points == null ? "—" : points.toFixed(1);
}

/**
 * Last week's game in one line: "Wk 2 [W] 131.4–98.2 vs Opponent". A game not
 * yet final shows its running score without a result chip.
 */
export default function LastGameResult({
  game,
  size = "xs",
}: {
  game: LastGame;
  size?: "xs" | "sm";
}) {
  const text = size === "sm" ? "text-sm" : "text-xs";
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-1.5 ${text} text-ink-muted`}>
      <span className="text-ink-subtle">Wk {game.week}</span>
      {game.result ? (
        <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${RESULT_STYLE[game.result]}`}>
          {game.result}
        </span>
      ) : (
        <span className="text-xs text-ink-subtle">{game.final ? "" : "in progress"}</span>
      )}
      <span className="font-mono tabular-nums text-ink">
        {score(game.points)}–{score(game.opponentPoints)}
      </span>
      <span>vs {game.opponent}</span>
    </span>
  );
}
