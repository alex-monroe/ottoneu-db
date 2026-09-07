"use client";

import DataTable from "@/components/DataTable";
import type { Column, HighlightRule, PlayerHoverData, SurplusPlayer } from "@/lib/types";
import {
  corePlayerCols,
  fantasyTeamCol,
  surplusCols,
  ppgCol,
  fullVorpCol,
  ownerCol,
  playerNameCol,
  positionCol,
  salaryCol,
  valueCol,
} from "@/components/columns";

interface TeamSummaryRow {
  team_name: string;
  players: number;
  total_salary: number;
  total_value: number;
  total_surplus: number;
  [key: string]: string | number | null | undefined;
}

const TEAM_SUMMARY_COLUMNS: Column<TeamSummaryRow>[] = [
  fantasyTeamCol<TeamSummaryRow>(),
  { key: "players", label: "Players", format: "number" },
  { key: "total_salary", label: "Total Salary", format: "currency" },
  { key: "total_value", label: "Total Value", format: "currency" },
  { key: "total_surplus", label: "Total Surplus", format: "currency" },
];

const BARGAIN_RULES: HighlightRule<SurplusPlayer>[] = [
  { key: "surplus", op: "gte", value: 30, className: "bg-green-50 dark:bg-green-950/30" },
];

const OVERPAID_RULES: HighlightRule<SurplusPlayer>[] = [
  { key: "surplus", op: "lt", value: -20, className: "bg-red-50 dark:bg-red-950/30" },
];

const MY_ROSTER_RULES: HighlightRule<SurplusPlayer>[] = [
  { key: "surplus", op: "lt", value: 0, className: "bg-red-50 dark:bg-red-950/30" },
  { key: "surplus", op: "gte", value: 20, className: "bg-green-50 dark:bg-green-950/30" },
];

/** Highlight the viewer's own row in the per-team summary. Built per render
 *  rather than at module scope, since the team differs per viewer. */
function teamSummaryRules(viewerTeam: string | null): HighlightRule<TeamSummaryRow>[] {
  return viewerTeam
    ? [{ key: "team_name", op: "eq", value: viewerTeam, className: "bg-blue-50 dark:bg-blue-950/30" }]
    : [];
}

interface SurplusTablesProps {
  bestBargains: SurplusPlayer[];
  mostOverpaid: SurplusPlayer[];
  myTeam: SurplusPlayer[];
  myTotals: { salary: number; value: number; surplus: number };
  freeAgents: SurplusPlayer[];
  teamSummary: TeamSummaryRow[];
  hoverDataMap: Record<string, PlayerHoverData> | null;
  /** The signed-in viewer's team, or null when unbound. */
  viewerTeam: string | null;
}

/**
 * Surplus-value tables. Columns carry `renderCell` functions, so they are built
 * here in a client component rather than passed from the server section.
 */
export default function SurplusTables({
  bestBargains,
  mostOverpaid,
  myTeam,
  myTotals,
  freeAgents,
  teamSummary,
  hoverDataMap,
  viewerTeam,
}: SurplusTablesProps) {
  const coreColumns: Column<SurplusPlayer>[] = [
    ...corePlayerCols<SurplusPlayer>({ hoverDataMap }),
    ...surplusCols<SurplusPlayer>(),
    ppgCol<SurplusPlayer>(),
    fullVorpCol<SurplusPlayer>("VORP"),
    ownerCol<SurplusPlayer>(),
  ];
  const myTeamColumns: Column<SurplusPlayer>[] = [
    playerNameCol<SurplusPlayer>({ hoverDataMap }),
    positionCol<SurplusPlayer>(),
    salaryCol<SurplusPlayer>(),
    valueCol<SurplusPlayer>(),
    { key: "surplus", label: "Surplus", format: "currency" },
    ppgCol<SurplusPlayer>(),
    fullVorpCol<SurplusPlayer>("VORP"),
  ];
  const faColumns: Column<SurplusPlayer>[] = [
    ...corePlayerCols<SurplusPlayer>({ hoverDataMap }),
    valueCol<SurplusPlayer>(),
    ppgCol<SurplusPlayer>(),
    fullVorpCol<SurplusPlayer>("VORP"),
  ];

  return (
    <>
      {/* Best Bargains */}
      <section>
        <h3 className="text-xl font-semibold text-ink mb-3">
          Top 20 Bargains
        </h3>
        <DataTable columns={coreColumns} data={bestBargains} highlightRules={BARGAIN_RULES} />
      </section>

      {/* Most Overpaid */}
      <section>
        <h3 className="text-xl font-semibold text-ink mb-3">
          Top 20 Most Overpaid
        </h3>
        <DataTable columns={coreColumns} data={mostOverpaid} highlightRules={OVERPAID_RULES} />
      </section>

      {/* My Team */}
      {myTeam.length > 0 && (
        <section>
          <h3 className="text-xl font-semibold text-ink mb-3">
            {viewerTeam} — Surplus Breakdown
          </h3>
          <DataTable columns={myTeamColumns} data={myTeam} highlightRules={MY_ROSTER_RULES} />
          <div className="mt-3 flex flex-wrap gap-6 text-sm text-ink-muted">
            <span>
              Total Salary:{" "}
              <strong className="text-ink">${myTotals.salary}</strong>
            </span>
            <span>
              Total Value:{" "}
              <strong className="text-ink">${myTotals.value}</strong>
            </span>
            <span>
              Total Surplus:{" "}
              <strong
                className={
                  myTotals.surplus >= 0
                    ? "text-green-700 dark:text-green-400"
                    : "text-red-700 dark:text-red-400"
                }
              >
                ${myTotals.surplus}
              </strong>
            </span>
          </div>
        </section>
      )}

      {/* Free Agent Targets */}
      {freeAgents.length > 0 && (
        <section>
          <h3 className="text-xl font-semibold text-ink mb-3">
            Top Free Agents by Value
          </h3>
          <DataTable columns={faColumns} data={freeAgents} />
        </section>
      )}

      {/* Per-Team Summary */}
      <section>
        <h3 className="text-xl font-semibold text-ink mb-3">
          Per-Team Summary
        </h3>
        <DataTable
          columns={TEAM_SUMMARY_COLUMNS}
          data={teamSummary}
          highlightRules={teamSummaryRules(viewerTeam)}
        />
      </section>
    </>
  );
}
