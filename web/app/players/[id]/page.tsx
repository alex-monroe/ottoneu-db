import { fetchPlayerCard } from "@/lib/players";
import { notFound } from "next/navigation";
import Link from "next/link";
import { POSITION_COLORS, Position } from "@/lib/types";

export const revalidate = 3600;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    const player = await fetchPlayerCard(Number(id));
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
    const player = await fetchPlayerCard(Number(id));

    if (!player) notFound();

    const posColor =
        POSITION_COLORS[player.position as Position] ?? "#6B7280";

    return (
        <main className="min-h-screen bg-white dark:bg-black p-8">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* Back link */}
                <Link
                    href="/players"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                    ← Back to Players
                </Link>

                {/* ===== Header Card ===== */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="p-6 sm:p-8" style={{ borderTop: `4px solid ${posColor}` }}>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
                                        {player.name}
                                    </h1>
                                    <span
                                        className="px-2 py-1 rounded text-xs font-bold text-white"
                                        style={{ backgroundColor: posColor }}
                                    >
                                        {player.position}
                                    </span>
                                </div>
                                <p className="text-slate-500 dark:text-slate-400 mt-1">
                                    {player.nfl_team} · Ottoneu ID: {player.ottoneu_id}
                                </p>
                            </div>

                            <div className="flex items-center gap-6">
                                {player.price != null && (
                                    <div className="text-center">
                                        <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                                            ${player.price}
                                        </p>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                            Salary
                                        </p>
                                    </div>
                                )}
                                <div className="text-center">
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                        {player.team_name ?? "Free Agent"}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        Owner
                                    </p>
                                </div>
                            </div>
                        </div>

                        <a
                            href={`https://ottoneu.fangraphs.com/playercard?id=${player.ottoneu_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline mt-3"
                        >
                            View on Ottoneu ↗
                        </a>
                    </div>
                </div>

                {/* ===== Season Stats ===== */}
                {player.total_points != null && (
                    <section>
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
                            2025 Season Stats
                        </h2>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                            {[
                                {
                                    label: "Total Points",
                                    value: Number(player.total_points).toFixed(1),
                                },
                                { label: "Games", value: player.games_played ?? "—" },
                                { label: "Snaps", value: player.snaps?.toLocaleString() ?? "—" },
                                {
                                    label: "PPG",
                                    value:
                                        player.ppg != null ? Number(player.ppg).toFixed(2) : "—",
                                },
                                {
                                    label: "PPS",
                                    value:
                                        player.pps != null ? Number(player.pps).toFixed(4) : "—",
                                },
                            ].map((stat) => (
                                <div
                                    key={stat.label}
                                    className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900"
                                >
                                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                        {stat.label}
                                    </p>
                                    <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
                                        {stat.value}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ===== Transaction History ===== */}
                <section>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-4">
                        Transaction History
                        {player.transactions.length > 0 && (
                            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
                                ({player.transactions.length})
                            </span>
                        )}
                    </h2>

                    {player.transactions.length === 0 ? (
                        <p className="text-slate-500 dark:text-slate-400 text-sm py-4">
                            No transactions recorded for this player.
                        </p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-800">
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">
                                            Date
                                        </th>
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">
                                            Type
                                        </th>
                                        <th className="px-3 py-2.5 text-left font-semibold text-slate-700 dark:text-slate-300">
                                            Team
                                        </th>
                                        <th className="px-3 py-2.5 text-right font-semibold text-slate-700 dark:text-slate-300">
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
                                                ? "text-emerald-600 dark:text-emerald-400"
                                                : txn.transaction_type === "cut"
                                                    ? "text-red-500 dark:text-red-400"
                                                    : "text-amber-600 dark:text-amber-400";

                                        return (
                                            <tr
                                                key={txn.id}
                                                className={`border-t border-slate-100 dark:border-slate-800 ${i % 2 === 0
                                                        ? "bg-white dark:bg-slate-950"
                                                        : "bg-slate-50 dark:bg-slate-900"
                                                    }`}
                                            >
                                                <td className="px-3 py-2 text-slate-700 dark:text-slate-300 whitespace-nowrap">
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
                                                <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                                                    {txn.team_name ?? "—"}
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono text-slate-800 dark:text-slate-200">
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
            </div>
        </main>
    );
}
