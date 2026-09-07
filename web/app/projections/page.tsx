import {
  fetchProjectionBoard,
  getHistoricalSeasonsForYear,
} from "@/lib/analysis";
import { getStatsSeason, getProjectionSeason } from "@/lib/season";
import ActiveModelCard from "@/components/ActiveModelCard";
import ProjectionsClient from "./ProjectionsClient";
import PageShell, { PageHeader } from "@/components/PageShell";
import { EmptyState } from "@/components/states";
import DataFreshness from "@/components/DataFreshness";

export const revalidate = 3600;

interface Props {
  searchParams: Promise<{ year?: string }>;
}

export default async function ProjectionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const [statsSeason, projectionSeason] = await Promise.all([
    getStatsSeason(),
    getProjectionSeason(),
  ]);

  // Selectable projection years: the just-completed season (backtest view) and
  // the upcoming projection season (forward-looking). Deduped when they coincide
  // (during the in-season phase, statsSeason === projectionSeason).
  const projectionYears = Array.from(
    new Set([statsSeason, projectionSeason])
  ).sort((a, b) => a - b);

  const rawYear = Number(params.year);
  const projectionYear = projectionYears.includes(rawYear)
    ? rawYear
    : projectionSeason;

  const rows = await fetchProjectionBoard(projectionYear, statsSeason);
  const historicalSeasons = getHistoricalSeasonsForYear(projectionYear);
  const isForward = projectionYear > statsSeason;

  if (rows.length === 0) {
    return (
      <PageShell width="wide">
        <PageHeader
          eyebrow="Season-Long Projections"
          title={`${projectionYear} Player Projections`}
        />
        <EmptyState title="No projections for this season yet">
          The season-long model has not been run for {projectionYear}. Projections
          are rebuilt when the pipeline runs; until then there is nothing to rank.
        </EmptyState>
      </PageShell>
    );
  }

  return (
    <PageShell width="wide">
        <PageHeader
          eyebrow="Season-Long Projections"
          title={`${projectionYear} Player Projections`}
        >
          <p className="mt-2 max-w-prose text-ink-muted">
            {isForward ? (
              <>
                Projected points per game for every player, including rookies.
                Ranked overall and by position — use it for arbitration, keeper,
                and auction decisions. The Δ column compares the projection to{" "}
                {statsSeason} actual PPG.
              </>
            ) : (
              <>
                <strong>Backtest view:</strong> what the model would have
                projected for {projectionYear} from {historicalSeasons.join(", ")}{" "}
                history, vs. actual {projectionYear} results. Green = beat the
                projection; red = missed it.
              </>
            )}
          </p>
        </PageHeader>
      <DataFreshness source="projections" />

        <ProjectionsClient
          initialData={rows}
          projectionYear={projectionYear}
          statsSeason={statsSeason}
          projectionYears={projectionYears}
          isForward={isForward}
        />

        {/* Methodology. This used to be admin-only, which meant the people
            reading the projections were the ones forbidden from seeing how they
            were made. Anyone who can see the number can see the method. */}
        <ActiveModelCard
            footer={
              <>
                <p className="text-sm text-ink-muted">
                  Built from {historicalSeasons.join(", ")} history. Players with
                  no NFL track record use a separate rookie fallback —{" "}
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                    Rookie
                  </span>{" "}
                  (drafted, by draft capital) or{" "}
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                    College
                  </span>{" "}
                  (prospect, position-average rookie PPG).
                </p>
                <p className="text-xs text-ink-subtle pt-1">
                  <strong>{statsSeason} PPG</strong> — actual {statsSeason} stats
                  &nbsp;·&nbsp; <strong>Proj {projectionYear}</strong> — model
                  output &nbsp;·&nbsp; <strong>Δ</strong> — Proj minus{" "}
                  {statsSeason} PPG
                </p>
              </>
            }
          />
    </PageShell>
  );
}
