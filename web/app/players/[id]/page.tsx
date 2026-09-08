import { fetchPlayerDetail, fetchPlayerProjection, fetchDraftSharksValue } from "@/lib/data";
import { fetchPlayerWeeklyProjections, fetchWeeklyAsOf } from "@/lib/weekly-projections";
import { getDisplayWeeks } from "@/lib/nfl-week";
import WeeklyProjectionCard from "@/components/WeeklyProjectionCard";
import { getAuthenticatedUser } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { POSITION_COLORS, type Position } from "@/lib/types";
import PositionBadge from "@/components/PositionBadge";
import TeamName from "@/components/TeamName";
import { teamHref } from "@/lib/teams";
import StatValue from "@/components/StatValue";
import PageShell from "@/components/PageShell";

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const player = await fetchPlayerDetail(Number(id));
    if (!player) return { title: "Player Not Found" };
    return {
        title: `${player.name} | Ottoneu Analytics`,
        description: `Player card for ${player.name} — ${player.position}, ${player.nfl_team}`,
    };
}

export default async function PlayerCardPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const player = await fetchPlayerDetail(Number(id));

    if (!player) notFound();

    // Fetch auth + projection in parallel (auth returns null for unauthenticated)
    const user = await getAuthenticatedUser();
    const [projection, draftSharks] = user?.hasProjectionsAccess
        ? await Promise.all([
              fetchPlayerProjection(player.id),
              fetchDraftSharksValue(player.id),
          ])
        : [null, null];

    // Weekly (per-game) projections: the upcoming slate plus the one just
    // played, so a finished week's projection stays visible next to its result.
    // Gated behind projections access, same as the seasonal projection above.
    const displayWeeks = await getDisplayWeeks();
    const weeklyWeeks = [displayWeeks.upcoming, displayWeeks.previous].filter(
        (w): w is number => w != null,
    );
    const [weeklyRows, weeklyAsOf] =
        user?.hasProjectionsAccess && displayWeeks.season != null && weeklyWeeks.length > 0
            ? await Promise.all([
                  fetchPlayerWeeklyProjections(player.id, displayWeeks.season, weeklyWeeks),
                  fetchWeeklyAsOf(displayWeeks.season, weeklyWeeks[0]),
              ])
            : [new Map(), null];
    const weeklySource = [...weeklyRows.values()][0]?.source ?? "Sleeper";

    const posColor = POSITION_COLORS[player.position as Position] ?? "#6B7280";

    const age = player.birth_date
        ? (() => {
              const today = new Date();
              const dob = new Date(player.birth_date + "T00:00:00");
              let a = today.getFullYear() - dob.getFullYear();
              const m = today.getMonth() - dob.getMonth();
              if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) a--;
              return a;
          })()
        : null;

    return (
        <PageShell>
                {/* Back link */}
                <Link
                    href="/players"
                    className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                >
                    ← Back to Players
                </Link>

                {/* ===== Header Card ===== */}
                <div className="rounded-xl border border-line overflow-hidden">
                    <div className="p-6 sm:p-8" style={{ borderTop: `4px solid ${posColor}` }}>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-3xl font-bold text-ink">
                                        {player.name}
                                    </h1>
                                    <PositionBadge position={player.position} />
                                </div>
                                <p className="text-ink-subtle mt-1">
                                    {player.nfl_team}{age != null ? ` · Age ${age}` : ""} · Ottoneu ID: {player.ottoneu_id}
                                </p>
                            </div>

                            <div className="flex items-center gap-6">
                                {projection && (
                                    <div className="text-center">
                                        <p className="text-3xl font-bold text-accent font-mono">
                                            {projection.projected_ppg.toFixed(2)}
                                        </p>
                                        <p className="text-xs text-ink-subtle mt-0.5">
                                            Proj. PPG
                                        </p>
                                    </div>
                                )}
                                {player.price != null && (
                                    <div className="text-center">
                                        <p className="text-3xl font-bold text-positive font-mono">
                                            ${player.price}
                                        </p>
                                        <p className="text-xs text-ink-subtle mt-0.5">
                                            Salary
                                        </p>
                                    </div>
                                )}
                                {draftSharks?.ds_auction_value != null && (
                                    <div className="text-center">
                                        <p className="text-3xl font-bold text-violet-600 dark:text-violet-400 font-mono">
                                            ${draftSharks.ds_auction_value}
                                        </p>
                                        <p className="text-xs text-ink-subtle mt-0.5">
                                            DS Projected Value
                                        </p>
                                    </div>
                                )}
                                {draftSharks?.market_auction_value != null && (
                                    <div className="text-center">
                                        <p className="text-3xl font-bold text-violet-600 dark:text-violet-400 font-mono">
                                            ${draftSharks.market_auction_value}
                                        </p>
                                        <p className="text-xs text-ink-subtle mt-0.5">
                                            Benchmark Value
                                        </p>
                                    </div>
                                )}
                                <div className="text-center">
                                    <p className="text-sm font-medium text-ink-muted">
                                        {player.team_name ? (
                                            <TeamName name={player.team_name} />
                                        ) : (
                                            "Free Agent"
                                        )}
                                    </p>
                                    <p className="text-xs text-ink-subtle mt-0.5">
                                        Owner
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Related rail — the player card used to be a cul-de-sac
                            whose only internal link was "back to Players". */}
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                            {player.team_name && player.team_name !== "FA" && (
                                <Link
                                    href={teamHref(player.team_name)}
                                    className="text-accent hover:underline"
                                >
                                    {player.team_name}&apos;s roster &amp; cap →
                                </Link>
                            )}
                            <Link href="/lineup" className="text-accent hover:underline">
                                Lineup planner →
                            </Link>
                            {user?.hasProjectionsAccess && (
                                <>
                                    <Link href="/value?tab=surplus" className="text-accent hover:underline">
                                        Surplus rankings →
                                    </Link>
                                    <Link href="/arbitration" className="text-accent hover:underline">
                                        Arbitration targets →
                                    </Link>
                                </>
                            )}
                            <a
                                href={`https://ottoneu.fangraphs.com/football/309/player_card/nfl/${player.ottoneu_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-accent hover:underline"
                            >
                                View on Ottoneu ↗
                            </a>
                        </div>
                    </div>
                </div>

                {/* ===== Weekly Projections ===== */}
                {user?.hasProjectionsAccess && weeklyRows.size > 0 && (
                    <WeeklyProjectionCard
                        upcoming={displayWeeks.upcoming}
                        previous={displayWeeks.previous}
                        rows={weeklyRows}
                        source={weeklySource}
                        asOf={weeklyAsOf}
                    />
                )}

                {/* ===== Season Stats ===== */}
                {player.seasonStats.length > 0 && (
                    <section>
                        <h2 className="text-xl font-semibold text-ink mb-4">
                            Season Stats
                        </h2>
                        <div className="overflow-x-auto rounded-lg border border-line">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="bg-sunken">
                                        <th className="px-3 py-2.5 text-left font-semibold text-ink-muted">Season</th>
                                        <th className="px-3 py-2.5 text-right font-semibold text-ink-muted">Total Pts</th>
                                        <th className="px-3 py-2.5 text-right font-semibold text-ink-muted">Games</th>
                                        <th className="px-3 py-2.5 text-right font-semibold text-ink-muted">Snaps</th>
                                        <th className="px-3 py-2.5 text-right font-semibold text-ink-muted">PPG</th>
                                        <th className="px-3 py-2.5 text-right font-semibold text-ink-muted">PPS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {player.seasonStats.map((s, i) => (
                                        <tr
                                            key={s.season}
                                            className={`border-t border-line ${i % 2 === 0 ? "bg-raised" : "bg-sunken"}`}
                                        >
                                            <td className="px-3 py-2 font-semibold text-ink-muted">{s.season}</td>
                                            <td className="px-3 py-2 text-right font-mono text-ink-muted">
                                                <StatValue value={s.total_points} format="decimal" />
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-ink-muted">
                                                <StatValue value={s.games_played} format="number" />
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-ink-muted">
                                                {s.snaps != null ? s.snaps.toLocaleString() : "—"}
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-ink-muted">
                                                <StatValue value={s.ppg} format="decimal" />
                                            </td>
                                            <td className="px-3 py-2 text-right font-mono text-ink-muted">
                                                {s.pps != null ? s.pps.toFixed(4) : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {/* ===== Transaction History ===== */}
                <section>
                    <h2 className="text-xl font-semibold text-ink mb-4">
                        Transaction History
                        {player.transactions.length > 0 && (
                            <span className="ml-2 text-sm font-normal text-ink-subtle">
                                ({player.transactions.length})
                            </span>
                        )}
                    </h2>

                    {player.transactions.length === 0 ? (
                        <p className="text-ink-subtle text-sm py-4">
                            No transactions recorded for this player.
                        </p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-line">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="bg-sunken">
                                        <th className="px-3 py-2.5 text-left font-semibold text-ink-muted">
                                            Date
                                        </th>
                                        <th className="px-3 py-2.5 text-left font-semibold text-ink-muted">
                                            Type
                                        </th>
                                        <th className="px-3 py-2.5 text-left font-semibold text-ink-muted">
                                            Team
                                        </th>
                                        <th className="px-3 py-2.5 text-right font-semibold text-ink-muted">
                                            Salary
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {player.transactions.map((txn, i) => {
                                        const typeLabel = txn.transaction_type
                                            .replace(/^move \(from (.+)\)$/, "Trade from $1")
                                            .replace(/^add$/, "Add")
                                            .replace(/^cut$/, "Cut");

                                        const typeColor =
                                            txn.transaction_type === "add"
                                                ? "text-positive"
                                                : txn.transaction_type === "cut"
                                                    ? "text-red-500 dark:text-red-400"
                                                    : "text-amber-600 dark:text-amber-400";

                                        return (
                                            <tr
                                                key={txn.id}
                                                className={`border-t border-line ${i % 2 === 0
                                                    ? "bg-raised"
                                                    : "bg-sunken"
                                                    }`}
                                            >
                                                <td className="px-3 py-2 text-ink-muted whitespace-nowrap">
                                                    {txn.transaction_date
                                                        ? new Date(
                                                            txn.transaction_date + "T00:00:00"
                                                        ).toLocaleDateString("en-US", {
                                                            month: "short",
                                                            day: "numeric",
                                                            year: "numeric",
                                                        })
                                                        : "—"}
                                                </td>
                                                <td
                                                    className={`px-3 py-2 font-semibold whitespace-nowrap ${typeColor}`}
                                                >
                                                    {typeLabel}
                                                </td>
                                                <td className="px-3 py-2 text-ink-muted">
                                                    {txn.team_name ? <TeamName name={txn.team_name} /> : "—"}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono text-ink-muted">
                                                    {txn.salary != null ? `$${txn.salary}` : "—"}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
        </PageShell>
    );
}
