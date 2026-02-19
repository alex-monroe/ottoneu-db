import { fetchAndMergeProjectedData, SEASON } from "@/lib/analysis";
import ProjectionsClient from "./ProjectionsClient";

export const revalidate = 3600;

export default async function ProjectionsPage() {
  const players = await fetchAndMergeProjectedData();

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
      name: p.name,
      position: p.position,
      nfl_team: p.nfl_team,
      team_name: p.team_name ?? "FA",
      price: p.price,
      observed_ppg: p.observed_ppg,
      projected_ppg: p.ppg,
      ppg_delta: p.ppg - p.observed_ppg,
    }))
    .sort((a, b) => b.projected_ppg - a.projected_ppg);

  return (
    <main className="min-h-screen bg-white dark:bg-black p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Player Projections ({SEASON})
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            Weighted-average PPG projections built from 2022–2024 historical
            seasons. Delta shows how a player is trending vs. their projection.
          </p>
        </header>

        {/* Methodology */}
        <section className="bg-slate-50 dark:bg-slate-900 rounded-lg p-5 border border-slate-200 dark:border-slate-800 space-y-3 text-sm text-slate-700 dark:text-slate-300">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Methodology
          </h2>
          <p>
            Each player&apos;s projected PPG is a weighted average of their per-game
            output across the three most recent seasons, with recency weights{" "}
            <strong>0.50 / 0.30 / 0.20</strong> (most recent to oldest). Seasons
            with fewer than 4 games played are discounted proportionally (
            <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">
              weight × games / 4
            </code>
            ) to reduce noise from small samples. Players with no qualifying
            historical seasons are excluded.
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Obs PPG</strong> — this season&apos;s actual points-per-game
            </li>
            <li>
              <strong>Proj PPG</strong> — weighted historical average
            </li>
            <li>
              <strong>Delta</strong> — Obs PPG minus Proj PPG (positive = outperforming
              projection, negative = underperforming)
            </li>
          </ul>
        </section>

        <ProjectionsClient initialData={rows} />
      </div>
    </main>
  );
}
