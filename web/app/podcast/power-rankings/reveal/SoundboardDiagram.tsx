/**
 * A thumbnail of the podcast's physical 4x4 soundboard with the revealed
 * team's button lit, so whoever is on the board can find the clip without
 * hunting for it mid-reveal.
 *
 * The top row holds non-team clips; the twelve teams fill the bottom three
 * rows. `SOUNDBOARD_ORDER` lists them the way the board is laid out: bottom
 * row first, each row left to right.
 */

export const SOUNDBOARD_ORDER = [
  // Bottom row
  "Ball So Hard University",
  "Marin County Mountain Runners",
  "The Golden Gouda",
  "Irish Invasion",
  // Second row from the bottom
  "The Hard Eight",
  "The Roseman Empire",
  "Pacific Punt Masters",
  "The Royal Dynasty",
  // Third row from the bottom
  "The Trigeminal Thunderclaps",
  "The Triple Helix",
  "Tinseltown Little Gold Men",
  "The Witchcraft",
] as const;

const COLS = 4;
const ROWS = 4;

/**
 * Letters only, lower-cased, without a leading "The" — so "The  Hard Eight ",
 * "Hard Eight" and "Pacific Puntmasters" all still find their button.
 */
function key(name: string): string {
  return name
    .trim()
    .replace(/^the\s+/i, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

const POSITION = new Map(SOUNDBOARD_ORDER.map((name, i) => [key(name), i]));

/**
 * Where a team's button sits, counted from the top-left as the board is
 * seen, or null for a team that is not on the board.
 */
export function soundboardCell(teamName: string): { row: number; col: number } | null {
  const i = POSITION.get(key(teamName));
  if (i === undefined) return null;
  const rowFromBottom = Math.floor(i / COLS);
  return { row: ROWS - 1 - rowFromBottom, col: i % COLS };
}

export default function SoundboardDiagram({
  teamName,
  className = "",
}: {
  teamName: string;
  className?: string;
}) {
  const cell = soundboardCell(teamName);
  if (!cell) return null;

  const label = `Soundboard: row ${ROWS - cell.row} from the bottom, button ${cell.col + 1} from the left`;

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-grid shrink-0 grid-cols-4 gap-[3px] rounded-md border border-line-strong bg-page p-[3px] align-middle ${className}`}
    >
      {Array.from({ length: ROWS * COLS }, (_, i) => {
        const row = Math.floor(i / COLS);
        const col = i % COLS;
        const lit = row === cell.row && col === cell.col;
        return (
          <span
            key={i}
            className={`block h-3 w-3 rounded-[2px] sm:h-3.5 sm:w-3.5 ${
              lit
                ? "bg-blue-600 ring-2 ring-blue-300 dark:bg-blue-400 dark:ring-blue-700"
                : row === 0
                  ? "bg-sunken opacity-50"
                  : "bg-sunken"
            }`}
          />
        );
      })}
    </span>
  );
}
