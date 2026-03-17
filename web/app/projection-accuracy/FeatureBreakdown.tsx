"use client";

interface FeatureBreakdownProps {
  featureValues: Record<string, number | null>;
  projectedPpg: number;
}

export default function FeatureBreakdown({
  featureValues,
  projectedPpg,
}: FeatureBreakdownProps) {
  const entries = Object.entries(featureValues).filter(
    ([, v]) => v != null
  ) as [string, number][];

  if (entries.length === 0) return null;

  // Use max absolute value among features as bar scale reference
  const maxAbs = Math.max(...entries.map(([, v]) => Math.abs(v)), 0.01);

  return (
    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
        Feature Breakdown — Proj PPG: {projectedPpg.toFixed(2)}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-1.5">
        {entries.map(([feature, value]) => {
          const barPct = Math.abs(value) / maxAbs;
          const isPositive = value >= 0;
          return (
            <div key={feature} className="flex flex-col gap-0.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-600 dark:text-slate-300 font-mono">
                  {feature.replace(/_/g, " ")}
                </span>
                <span
                  className={`font-semibold tabular-nums ${
                    isPositive
                      ? "text-green-700 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {value.toFixed(2)}
                </span>
              </div>
              {/* Bar */}
              <div className="relative h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`absolute top-0 h-full rounded-full ${
                    isPositive
                      ? "bg-green-500 dark:bg-green-400 left-0"
                      : "bg-red-500 dark:bg-red-400 right-0"
                  }`}
                  style={{ width: `${(barPct * 100).toFixed(1)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
