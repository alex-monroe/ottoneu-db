"use client";

import { PlanValidation } from "@/lib/arb-planner-validation";

interface BudgetTrackerProps {
  validation: PlanValidation;
}

export default function BudgetTracker({ validation }: BudgetTrackerProps) {
  const { teamStatuses, totalAllocated, totalBudget, remaining, isValid, errors } = validation;
  const pct = Math.min((totalAllocated / totalBudget) * 100, 100);

  return (
    <div className="space-y-4">
      {/* Total Budget Bar */}
      <div className="bg-slate-50 dark:bg-slate-900 rounded-lg p-4 border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Total Budget
          </span>
          <span className="text-sm font-bold text-slate-900 dark:text-white">
            ${totalAllocated} / ${totalBudget}
            <span className="font-normal text-slate-500 dark:text-slate-400 ml-2">
              (${remaining} remaining)
            </span>
          </span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all ${
              totalAllocated > totalBudget
                ? "bg-red-500"
                : isValid
                  ? "bg-green-500"
                  : "bg-blue-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Per-Team Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {teamStatuses.map((ts) => {
          let borderColor = "border-slate-200 dark:border-slate-700";
          let bgColor = "bg-white dark:bg-slate-900";

          if (ts.allocated > 0 && ts.isValid) {
            borderColor = "border-green-300 dark:border-green-700";
            bgColor = "bg-green-50 dark:bg-green-950/30";
          } else if (ts.allocated > 8) {
            borderColor = "border-red-300 dark:border-red-700";
            bgColor = "bg-red-50 dark:bg-red-950/30";
          } else if (ts.allocated > 0) {
            borderColor = "border-yellow-300 dark:border-yellow-700";
            bgColor = "bg-yellow-50 dark:bg-yellow-950/30";
          }

          return (
            <div
              key={ts.team_name}
              className={`${bgColor} border ${borderColor} rounded-lg p-2 text-center`}
            >
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">
                {ts.team_name}
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white">
                ${ts.allocated}
              </div>
              <div className="text-xs text-slate-400 dark:text-slate-500">
                / $8 max
              </div>
            </div>
          );
        })}
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
