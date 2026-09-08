import { formatRecord, formatStreak, type PlayoffPicture } from "@/lib/standings";
import TeamName from "./TeamName";
import { Th } from "./TableParts";

/**
 * The league table, with the playoff cut line drawn where it actually falls.
 *
 * `compact` is the homepage variant: team, record and points-for only. The full
 * variant adds points against, streak and the clinched/eliminated flags, which
 * only mean anything once games have been played.
 */

interface Props {
  playoffs: PlayoffPicture;
  compact?: boolean;
  /** The signed-in viewer's team, bolded in the table. Null = highlight none. */
  viewerTeam?: string | null;
}

export default function StandingsTable({ playoffs, compact = false, viewerTeam = null }: Props) {
  const { seeds, slots, started } = playoffs;

  return (
    // The compact variant lives in one column of the homepage's `lg:grid-cols-3`
    // — about 352px inside `max-w-6xl` — so a 420px floor gave the standings
    // panel its own horizontal scrollbar at every desktop width. It already
    // drops PA and Streak; it can drop the min-width with them.
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className={`w-full border-collapse ${compact ? "" : "min-w-[420px]"}`}>
        <thead className="bg-sunken">
          <tr>
            <Th>#</Th>
            <Th>Team</Th>
            <Th right>Record</Th>
            <Th right>PF</Th>
            {!compact && <Th right>PA</Th>}
            {!compact && <Th right>Streak</Th>}
          </tr>
        </thead>
        <tbody>
          {seeds.map((row) => {
            const isMine = viewerTeam != null && row.team_name.trim() === viewerTeam;
            // The line sits under the last team currently in the field, so a
            // reader can see at a glance who is in and who is chasing.
            const cutLine = started && row.rank === slots && seeds.length > slots;
            return (
              <tr
                key={row.team_id}
                className={`border-t border-line ${
                  cutLine ? "border-b-2 border-b-phase" : ""
                } ${isMine ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
              >
                <td className="px-3 py-2 text-sm tabular-nums text-ink-subtle">
                  {row.rank}
                </td>
                <td className="px-3 py-2 text-sm text-ink">
                  <TeamName name={row.team_name} mine={isMine} />
                  {row.clinched && (
                    <span className="ml-2 text-[11px] font-semibold uppercase text-positive">
                      clinched
                    </span>
                  )}
                  {row.eliminated && (
                    <span className="ml-2 text-[11px] font-semibold uppercase text-ink-subtle">
                      eliminated
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-sm tabular-nums text-ink-muted">
                  {formatRecord(row)}
                </td>
                <td className="px-3 py-2 text-right text-sm tabular-nums text-ink-muted">
                  {row.points_for.toFixed(2)}
                </td>
                {!compact && (
                  <td className="px-3 py-2 text-right text-sm tabular-nums text-ink-subtle">
                    {row.points_against.toFixed(2)}
                  </td>
                )}
                {!compact && (
                  <td className="px-3 py-2 text-right text-sm tabular-nums text-ink-subtle">
                    {formatStreak(row.streak)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
