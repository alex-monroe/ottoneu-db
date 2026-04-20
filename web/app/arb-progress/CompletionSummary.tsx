import { NUM_TEAMS } from "@/lib/config";

interface CompletionSummaryProps {
  completeCount: number;
  incompleteCount: number;
  teamsWithData: number;
}

export default function CompletionSummary({
  completeCount,
  incompleteCount,
  teamsWithData,
}: CompletionSummaryProps) {
  const pct = teamsWithData > 0 ? (completeCount / teamsWithData) * 100 : 0;

  return (
    <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">
        Team Completion
      </h2>
      <div className="grid grid-cols-3 gap-4 text-sm mb-4">
        <div>
          <p className="text-slate-500 dark:text-slate-400">Complete</p>
          <p className="font-bold text-2xl text-green-600 dark:text-green-400">{completeCount}</p>
        </div>
        <div>
          <p className="text-slate-500 dark:text-slate-400">Incomplete</p>
          <p className="font-bold text-2xl text-amber-600 dark:text-amber-400">{incompleteCount}</p>
        </div>
        <div>
          <p className="text-slate-500 dark:text-slate-400">Total</p>
          <p className="font-bold text-2xl text-slate-900 dark:text-white">{NUM_TEAMS}</p>
        </div>
      </div>

      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
        <div
          className="bg-green-500 dark:bg-green-400 h-3 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
        {teamsWithData > 0 ? `${Math.round(pct)}% complete` : "No data yet"}
      </p>
    </div>
  );
}
