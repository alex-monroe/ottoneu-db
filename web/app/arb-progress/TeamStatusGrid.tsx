import type { TeamStatus } from "@/lib/arb-progress";

interface TeamStatusGridProps {
  teams: TeamStatus[];
  teamRaiseTotals: Map<string, number>;
  teamSpentTotals: Map<string, number>;
}

export default function TeamStatusGrid({
  teams,
  teamRaiseTotals,
  teamSpentTotals,
}: TeamStatusGridProps) {
  if (teams.length === 0) {
    return (
      <section>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Teams</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          No team data available. Run the arbitration progress scraper to populate.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">Teams</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {teams.map((team) => {
          const raisedAgainst = teamRaiseTotals.get(team.team_name);
          const spent = teamSpentTotals.get(team.team_name);
          return (
            <div
              key={team.team_name}
              className={`rounded-lg border p-3 text-sm ${
                team.is_complete
                  ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block w-2.5 h-2.5 rounded-full ${
                    team.is_complete
                      ? "bg-green-500 dark:bg-green-400"
                      : "bg-slate-300 dark:bg-slate-600"
                  }`}
                />
                <span
                  className={`font-medium ${
                    team.is_complete
                      ? "text-green-800 dark:text-green-300"
                      : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {team.team_name}
                </span>
              </div>
              {raisedAgainst != null && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 ml-4.5">
                  ${raisedAgainst} raised against
                </p>
              )}
              {spent != null && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 ml-4.5">
                  ${spent} spent on raises
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
