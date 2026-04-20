import { ARB_BUDGET_PER_TEAM } from "@/lib/config";
import type { TeamSpendingEntry } from "@/lib/arb-progress";
import TeamSpendingTable from "./TeamSpendingTable";

export default function TeamSpendingSection({ data }: { data: TeamSpendingEntry[] }) {
  if (data.length === 0) return null;
  return (
    <section>
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-3">
        Team Spending Breakdown
      </h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">
        How each team allocated their ${ARB_BUDGET_PER_TEAM} arbitration budget. Click a row to see which players they targeted.
      </p>
      <TeamSpendingTable data={data} />
    </section>
  );
}
