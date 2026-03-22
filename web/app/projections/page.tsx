import {
  fetchAndMergeProjectedData,
  PROJECTION_YEARS,
  DEFAULT_PROJECTION_YEAR,
  getHistoricalSeasonsForYear,
  SEASON,
} from "@/lib/analysis";
import ProjectionsClient from "./ProjectionsClient";

export const revalidate = 3600;

interface Props {
  searchParams: Promise<{ year?: string }>;
}

export default async function ProjectionsPage({ searchParams }: Props) {
  const params = await searchParams;
  const rawYear = Number(params.year);
  const projectionYear = (PROJECTION_YEARS as readonly number[]).includes(rawYear)
    ? rawYear
    : DEFAULT_PROJECTION_YEAR;

  const players = await fetchAndMergeProjectedData(projectionYear);
  const historicalSeasons = getHistoricalSeasonsForYear(projectionYear);

  if (players.length === 0) {
    return (
      <main className="min-h-screen bg-white dark:bg-black p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            No projection data available.
          </h1>
        </div>
      </main>
    );
  }

  const rows = players
    .map((p) => ({
      player_id: p.player_id,
      ottoneu_id: p.ottoneu_id,
      name: p.name,
      position: p.position,
      nfl_team: p.nfl_team,
      team_name: p.team_name ?? "FA",
      price: p.price,
      observed_ppg: p.observed_ppg,
      projected_ppg: p.ppg,
      ppg_delta: p.ppg - p.observed_ppg,
      projection_method: p.projection_method ?? "weighted_average_ppg",
    }))
    .sort((a, b) => b.projected_ppg - a.projected_ppg);

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Player Projections — {projectionYear}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            {projectionYear > SEASON ? (
              <>
                <strong>Forward-looking:</strong> {SEASON} actual PPG vs.
                projected {projectionYear} performance, built from{" "}
                {historicalSeasons.join(", ")} history. Use this for arbitration
                and keeper decisions.
              </>
            ) : (
              <>
                <strong>Backtest:</strong> What the model would have projected
                for {projectionYear} using {historicalSeasons.join(", ")} history,
                compared to actual {SEASON} results. Green = outperformed
                projection; red = underperformed.
              </>
            )}
          </p>
        </header>

        {/* Methodology */}
        <section className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800 space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Methodology (v8 — age_regression)
          </h2>
          <p>
            Three additive features combined into a single projected PPG:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Weighted PPG:</strong> Games-weighted, recency-weighted
              average across {historicalSeasons.join(", ")} with weights{" "}
              <strong>0.50 / 0.30 / 0.20</strong> (most recent to oldest).
              Each season is scaled by{" "}
              <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                games / 17
              </code>{" "}
              to discount injury-shortened years.
            </li>
            <li>
              <strong>Age curve:</strong> Small adjustment (±2%) based on
              positional age curves — players near their peak age get a boost;
              older players get a slight discount.
            </li>
            <li>
              <strong>Regression to mean:</strong> Pulls outlier projections
              toward the positional average PPG, reducing overconfidence in
              extreme single-season performances.
            </li>
            <li>
              <strong>College Prospect (shown as{" "}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                College
              </span>):</strong>{" "}
              Average PPG of first-year NFL players at the same position.
            </li>
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
            <strong>{SEASON} PPG</strong> — actual {SEASON} season stats &nbsp;·&nbsp;{" "}
            <strong>Proj {projectionYear}</strong> — model output built from {historicalSeasons.join(", ")} history &nbsp;·&nbsp;{" "}
            <strong>Δ</strong> — Proj minus {SEASON} PPG
          </p>
        </section>

        <ProjectionsClient initialData={rows} projectionYear={projectionYear} />
      </div>
    </main>
  );
}
