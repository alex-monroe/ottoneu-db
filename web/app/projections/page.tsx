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
      projection_method: p.projection_method ?? "weighted_average_ppg",
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
            Two methods are applied based on the player&apos;s history depth:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Veteran (2+ seasons):</strong> Games-weighted, recency-weighted
              average across up to three seasons with weights{" "}
              <strong>0.50 / 0.30 / 0.20</strong> (most recent to oldest). Injury-shortened
              seasons are discounted by{" "}
              <code className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded text-xs">
                games / 17
              </code>.
            </li>
            <li>
              <strong>Rookie / First-Year (1 season, shown as{" "}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                Rookie
              </span>):</strong>{" "}
              Season PPG scaled by a usage trajectory factor derived from
              H2 vs H1 snaps-per-game, clamped to ±50%. Rising H2 usage
              projects higher; falling H2 usage projects lower.
            </li>
            <li>
              <strong>Obs PPG</strong> — this season&apos;s actual points-per-game
            </li>
            <li>
              <strong>Proj PPG</strong> — projected next-season PPG
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
