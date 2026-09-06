import { formatRecord, formatStreak, type PlayoffPicture } from "@/lib/standings";

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

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export default function StandingsTable({ playoffs, compact = false, viewerTeam = null }: Props) {
  const { seeds, slots, started } = playoffs;

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
      <table className="w-full min-w-[420px] border-collapse">
        <thead className="bg-slate-50 dark:bg-slate-900">
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
                className={`border-t border-slate-100 dark:border-slate-800/70 ${
                  cutLine ? "border-b-2 border-b-amber-400 dark:border-b-amber-500" : ""
                } ${isMine ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
              >
                <td className="px-3 py-2 text-sm tabular-nums text-slate-400 dark:text-slate-500">
                  {row.rank}
                </td>
                <td className="px-3 py-2 text-sm text-slate-900 dark:text-white">
                  <span className={isMine ? "font-semibold" : ""}>{row.team_name}</span>
                  {row.clinched && (
                    <span className="ml-2 text-[11px] font-semibold uppercase text-emerald-600 dark:text-emerald-400">
                      clinched
                    </span>
                  )}
                  {row.eliminated && (
                    <span className="ml-2 text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500">
                      eliminated
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-700 dark:text-slate-200">
                  {formatRecord(row)}
                </td>
                <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
                  {row.points_for.toFixed(2)}
                </td>
                {!compact && (
                  <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    {row.points_against.toFixed(2)}
                  </td>
                )}
                {!compact && (
                  <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">
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
