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
    <div className="bg-sunken rounded-lg p-5 border border-line">
      <h2 className="text-lg font-semibold text-ink mb-3">
        Team Completion
      </h2>
      <div className="grid grid-cols-3 gap-4 text-sm mb-4">
        <div>
          <p className="text-ink-subtle">Complete</p>
          <p className="font-bold text-2xl text-positive">{completeCount}</p>
        </div>
        <div>
          <p className="text-ink-subtle">Incomplete</p>
          <p className="font-bold text-2xl text-amber-600 dark:text-amber-400">{incompleteCount}</p>
        </div>
        <div>
          <p className="text-ink-subtle">Total</p>
          <p className="font-bold text-2xl text-ink">{NUM_TEAMS}</p>
        </div>
      </div>

      <div className="w-full bg-sunken rounded-full h-3">
        <div
          className="bg-green-500 dark:bg-green-400 h-3 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-ink-subtle mt-1">
        {teamsWithData > 0 ? `${Math.round(pct)}% complete` : "No data yet"}
      </p>
    </div>
  );
}
