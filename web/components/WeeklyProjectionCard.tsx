import type { WeeklyProjection, WeeklyStatLine } from "@/lib/weekly-projections";

/**
 * Weekly (per-game) projections on a player card.
 *
 * Kept visually and verbally distinct from the seasonal projection shown in the
 * header: that number is this site's own market-free model in points PER GAME
 * across a season; these are a third party's forecast for ONE game. The heading
 * names the source and the week, and the "as of" stamp says how fresh it is —
 * a reader must never have to guess which of the two they are looking at.
 *
 * The previous week deliberately stays on the card after its games are played,
 * with the actual result beside the projection, so people can see how it did.
 */

/** Display order and labels for the scoring categories we store. */
const STAT_LABELS: [keyof WeeklyStatLine & string, string][] = [
    ["passing_yards", "Pass Yds"],
    ["passing_tds", "Pass TD"],
    ["interceptions", "INT"],
    ["rushing_yards", "Rush Yds"],
    ["rushing_tds", "Rush TD"],
    ["receptions", "Rec"],
    ["receiving_yards", "Rec Yds"],
    ["receiving_tds", "Rec TD"],
    ["fg_made_0_39", "FG 0-39"],
    ["fg_made_40_49", "FG 40-49"],
    ["fg_made_50_plus", "FG 50+"],
    ["pat_made", "PAT"],
];

function StatLine({ stats }: { stats: WeeklyStatLine | null }) {
    if (!stats) return null;
    const entries = STAT_LABELS.filter(([key]) => stats[key]);
    if (entries.length === 0) return null;
    return (
        <dl className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
            {entries.map(([key, label]) => (
                <div key={key} className="flex items-baseline gap-1.5">
                    <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
                    <dd className="text-xs font-mono text-slate-700 dark:text-slate-300">
                        {Number(stats[key]).toFixed(1)}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

function WeekBlock({
    week,
    row,
    label,
}: {
    week: number;
    row: WeeklyProjection | undefined;
    label: string;
}) {
    return (
        <div className="flex-1 min-w-[220px] rounded-lg border border-slate-200 dark:border-slate-800 p-4">
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Week {week}
                </p>
                <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    {label}
                </p>
            </div>

            {!row ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-3">
                    — <span className="text-xs">no projection (bye or inactive)</span>
                </p>
            ) : (
                <>
                    <div className="flex items-end gap-6 mt-2">
                        <div>
                            <p className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                                {row.projected_points?.toFixed(1) ?? "—"}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Projected pts
                            </p>
                        </div>
                        {row.actual_points != null && (
                            <div>
                                <p className="text-2xl font-bold font-mono text-slate-800 dark:text-slate-200">
                                    {row.actual_points.toFixed(1)}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Actual</p>
                            </div>
                        )}
                        {row.opponent && (
                            <div>
                                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                                    {row.opponent}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Opp</p>
                            </div>
                        )}
                    </div>
                    <StatLine stats={row.actual_stats ?? row.projected_stats} />
                </>
            )}
        </div>
    );
}

export default function WeeklyProjectionCard({
    upcoming,
    previous,
    rows,
    source,
    asOf,
}: {
    upcoming: number | null;
    previous: number | null;
    rows: Map<number, WeeklyProjection>;
    source: string;
    asOf: string | null;
}) {
    if (upcoming == null && previous == null) return null;

    return (
        <section>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                    Weekly Projections
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Per-game · {source} · scored with Ottoneu rules
                    {asOf ? ` · as of ${new Date(asOf).toLocaleString()}` : ""}
                </p>
            </div>

            <div className="flex flex-wrap gap-4">
                {upcoming != null && (
                    <WeekBlock week={upcoming} row={rows.get(upcoming)} label="Upcoming" />
                )}
                {previous != null && (
                    <WeekBlock week={previous} row={rows.get(previous)} label="Last week" />
                )}
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                A third party&apos;s forecast for a single game — not the season-long
                projected PPG shown above, which comes from this site&apos;s own model.
            </p>
        </section>
    );
}
