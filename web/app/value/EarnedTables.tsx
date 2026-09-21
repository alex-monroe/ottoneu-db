"use client";

import DataTable from "@/components/DataTable";
import {
  corePlayerCols,
  fantasyTeamCol,
  gamesPlayedCol,
  ownerCol,
  playerNameCol,
  positionCol,
  totalPointsCol,
} from "@/components/columns";
import type {
  Column,
  EarnedValuePlayer,
  HighlightRule,
  PlayerHoverData,
} from "@/lib/types";

interface TeamEarnedRow {
  team_name: string;
  players: number;
  paid_to_date: number;
  earned_to_date: number;
  realized_surplus: number;
  return_on_salary: number | null;
  [key: string]: string | number | null | undefined;
}

/**
 * Dollars earned per dollar paid, to two places, with 1.00 as the break-even
 * mark. Rendered rather than formatted because `format: "currency"` would print
 * it as a price and `"decimal"` gives no sense of which side of even it is.
 */
function returnCol<Row>(): Column<Row> {
  return {
    key: "return_on_salary",
    label: "Return",
    explain: "return_on_salary",
    renderCell: (value) => {
      if (value == null) return <span className="text-ink-subtle">—</span>;
      const ratio = Number(value);
      const tone =
        ratio >= 1
          ? "text-positive"
          : ratio >= 0.75
            ? "text-ink-muted"
            : "text-negative";
      return (
        <span className={`font-medium tabular-nums ${tone}`}>
          {ratio.toFixed(2)}&times;
        </span>
      );
    },
  };
}

/**
 * The money columns. A completed season shows whole dollars, which is what this
 * page has always shown; a season in progress shows cents, because prorating a $1
 * floor to a fortnight puts it at $0.12 and a single decimal would round most of
 * the bottom of the board to nothing. The precision has to match what
 * `earned-value.ts` actually computed, or the column quietly re-rounds it.
 */
function moneyCol<Row>(
  key: string,
  label: string,
  complete: boolean,
  explain?: string,
): Column<Row> {
  return {
    key,
    label,
    explain,
    renderCell: (value) => {
      if (value == null) return <span className="text-ink-subtle">—</span>;
      const n = Number(value);
      const shown = Math.abs(complete ? Math.round(n) : n).toFixed(complete ? 0 : 2);
      return (
        <span className="tabular-nums">
          {n < 0 ? `-$${shown}` : `$${shown}`}
        </span>
      );
    },
  };
}

const GOOD: HighlightRule<EarnedValuePlayer>[] = [
  {
    key: "return_on_salary",
    op: "gte",
    value: 2,
    className: "bg-green-50 dark:bg-green-950/30",
  },
];

const BAD: HighlightRule<EarnedValuePlayer>[] = [
  {
    key: "return_on_salary",
    op: "lt",
    value: 0.5,
    className: "bg-red-50 dark:bg-red-950/30",
  },
];

function teamRules(viewerTeam: string | null): HighlightRule<TeamEarnedRow>[] {
  return viewerTeam
    ? [
        {
          key: "team_name",
          op: "eq",
          value: viewerTeam,
          className: "bg-blue-50 dark:bg-blue-950/30",
        },
      ]
    : [];
}

interface Props {
  bestReturns: EarnedValuePlayer[];
  worstReturns: EarnedValuePlayer[];
  myTeam: EarnedValuePlayer[];
  freeAgents: EarnedValuePlayer[];
  teamSummary: TeamEarnedRow[];
  hoverDataMap: Record<string, PlayerHoverData> | null;
  viewerTeam: string | null;
  /** Whether the window is a finished season — drives dollar formatting. */
  complete: boolean;
}

/**
 * Earned-value tables. Columns carry `renderCell` functions, so they are built
 * here in a client component rather than passed down from the server section.
 */
export default function EarnedTables({
  bestReturns,
  worstReturns,
  myTeam,
  freeAgents,
  teamSummary,
  hoverDataMap,
  viewerTeam,
  complete,
}: Props) {
  const paidLabel = complete ? "Salary" : "Paid";
  const surplusLabel = complete ? "Realized" : "+/−";
  // Over a finished season "Paid" *is* the salary and needs no gloss; prorated to
  // a window it is a different number and has to say so.
  const paidExplain = complete ? undefined : "salary_to_date";

  const playerCols: Column<EarnedValuePlayer>[] = [
    ...corePlayerCols<EarnedValuePlayer>({ hoverDataMap }),
    moneyCol<EarnedValuePlayer>("salary_to_date", paidLabel, complete, paidExplain),
    moneyCol<EarnedValuePlayer>("earned_value", "Earned", complete, "earned_value"),
    moneyCol<EarnedValuePlayer>(
      "realized_surplus",
      surplusLabel,
      complete,
      "realized_surplus",
    ),
    returnCol<EarnedValuePlayer>(),
    totalPointsCol<EarnedValuePlayer>(),
    gamesPlayedCol<EarnedValuePlayer>(),
    ownerCol<EarnedValuePlayer>(),
  ];

  const myTeamCols: Column<EarnedValuePlayer>[] = [
    playerNameCol<EarnedValuePlayer>({ hoverDataMap }),
    positionCol<EarnedValuePlayer>(),
    moneyCol<EarnedValuePlayer>("salary_to_date", paidLabel, complete, paidExplain),
    moneyCol<EarnedValuePlayer>("earned_value", "Earned", complete, "earned_value"),
    moneyCol<EarnedValuePlayer>(
      "realized_surplus",
      surplusLabel,
      complete,
      "realized_surplus",
    ),
    returnCol<EarnedValuePlayer>(),
    totalPointsCol<EarnedValuePlayer>(),
    gamesPlayedCol<EarnedValuePlayer>(),
  ];

  // Free agents have no salary to divide by, so Paid, +/− and Return are all
  // meaningless for them — the question is only "who is producing and unowned".
  const faCols: Column<EarnedValuePlayer>[] = [
    ...corePlayerCols<EarnedValuePlayer>({ hoverDataMap }),
    moneyCol<EarnedValuePlayer>("earned_value", "Earned", complete),
    totalPointsCol<EarnedValuePlayer>(),
    gamesPlayedCol<EarnedValuePlayer>(),
  ];

  const teamCols: Column<TeamEarnedRow>[] = [
    fantasyTeamCol<TeamEarnedRow>(),
    { key: "players", label: "Players", format: "number" },
    moneyCol<TeamEarnedRow>("paid_to_date", paidLabel, complete, paidExplain),
    moneyCol<TeamEarnedRow>("earned_to_date", "Earned", complete, "earned_value"),
    moneyCol<TeamEarnedRow>(
      "realized_surplus",
      surplusLabel,
      complete,
      "realized_surplus",
    ),
    returnCol<TeamEarnedRow>(),
  ];

  return (
    <>
      <section>
        <h3 className="mb-1 text-xl font-semibold text-ink">
          What each roster has bought
        </h3>
        <p className="mb-3 text-sm text-ink-subtle">
          The league&apos;s shape in one table: every team&apos;s salary against
          the value its players have actually earned.
        </p>
        <DataTable
          columns={teamCols}
          data={teamSummary}
          highlightRules={teamRules(viewerTeam)}
        />
      </section>

      {myTeam.length > 0 && (
        <section>
          <h3 className="mb-3 text-xl font-semibold text-ink">
            {viewerTeam} — player by player
          </h3>
          <DataTable columns={myTeamCols} data={myTeam} highlightRules={BAD} />
        </section>
      )}

      <section>
        <h3 className="mb-3 text-xl font-semibold text-ink">
          Best returns on salary
        </h3>
        <DataTable columns={playerCols} data={bestReturns} highlightRules={GOOD} />
      </section>

      <section>
        <h3 className="mb-3 text-xl font-semibold text-ink">
          Worst returns on salary
        </h3>
        <DataTable columns={playerCols} data={worstReturns} highlightRules={BAD} />
      </section>

      {freeAgents.length > 0 && (
        <section>
          <h3 className="mb-1 text-xl font-semibold text-ink">
            Producing, and unowned
          </h3>
          <p className="mb-3 text-sm text-ink-subtle">
            Free agents ranked by what they have earned. Nobody is paying for
            these points.
          </p>
          <DataTable columns={faCols} data={freeAgents} />
        </section>
      )}
    </>
  );
}
