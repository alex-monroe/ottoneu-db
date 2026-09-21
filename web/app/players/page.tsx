import {
    fetchPlayerList,
    fetchPlayerSet,
    listStatWindowSeasons,
} from "@/lib/data";
import PlayerSearch from "@/components/PlayerSearch";
import PlayerEfficiencyClient from "@/components/PlayerEfficiencyClient";
import StatWindowNote from "@/components/StatWindowNote";
import StatWindowPicker from "@/components/StatWindowPicker";
import Tabs from "@/components/Tabs";
import type { ChartPoint, Player } from "@/lib/types";
import PageShell from "@/components/PageShell";

export const revalidate = 3600; // Revalidate every hour

export const metadata = {
    title: "Players | Ottoneu Analytics",
    description: "Browse and search all players in Ottoneu League 309",
};

/** Build the salary-vs-production scatter points (skips zero-PPG players). */
function buildEfficiencyData(players: Player[]): ChartPoint[] {
    return players
        .map((player) => {
            const ppg = player.ppg;
            const pps = player.pps;
            const price = player.price;
            const total_points = player.total_points;

            if (ppg === 0) return null;

            return {
                name: player.name,
                position: player.position,
                nfl_team: player.nfl_team,
                total_points,
                ppg,
                pps,
                price,
                cost_per_ppg: ppg > 0 ? price / ppg : 0,
                cost_per_pps: pps > 0 ? price / pps : 0,
                games_played: player.games_played,
                snaps: player.snaps,
            };
        })
        .filter(Boolean) as ChartPoint[];
}

interface Props {
    searchParams: Promise<{ tab?: string; season?: string }>;
}

export default async function PlayersPage({ searchParams }: Props) {
    const { tab, season } = await searchParams;

    // The efficiency chart and the tier benchmarks are a read of one season's
    // production, so they get the same season switch /value has: during the
    // season, "what has happened so far" and "what happened last year" are
    // different questions and a manager wants to see both.
    const seasons = await listStatWindowSeasons();
    const requested = Number(season);
    const chosen = seasons.includes(requested) ? requested : seasons[0];

    const [players, { players: efficiencyPlayers, window }] = await Promise.all([
        fetchPlayerList(),
        fetchPlayerSet(chosen),
    ]);
    const efficiencyData = buildEfficiencyData(efficiencyPlayers);
    const seasonLabels: Record<number, string> = Object.fromEntries(
        seasons.map((s) => [s, s === window.season ? window.shortLabel : String(s)]),
    );

    const directory = (
        <div className="space-y-6">
            <header>
                <h2 className="text-2xl font-bold tracking-tight text-ink">
                    Player Directory
                </h2>
                <p className="text-ink-subtle mt-2">
                    Browse all players in League 309. Click a name to view their full
                    card with stats and transaction history.
                </p>
            </header>
            <PlayerSearch players={players} />
        </div>
    );

    const efficiency = (
        <div className="space-y-8">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-ink">
                        Player Efficiency — {window.label}
                    </h2>
                    <p className="text-ink-subtle mt-2">
                        Salary vs. production (Points Per Game or Points Per Snap).
                    </p>
                </div>
                {seasons.length > 1 && (
                    <StatWindowPicker
                        seasons={seasons}
                        current={window.season}
                        labels={seasonLabels}
                    />
                )}
            </header>

            <StatWindowNote window={window} what="rates" />

            <PlayerEfficiencyClient data={efficiencyData} window={window} />

            <section className="bg-sunken rounded-lg p-6 border border-line">
                <h3 className="text-lg font-semibold mb-4 text-ink">Analysis Notes</h3>
                <ul className="list-disc list-inside space-y-2 text-ink-muted">
                    <li><strong>Y-Axis (Salary)</strong>: Higher is more expensive.</li>
                    <li><strong>X-Axis (PPG/PPS)</strong>: Further right means more efficient production per game/snap.</li>
                    <li><strong>Bubble Size</strong>: Represents Total Points. Larger bubbles = higher total volume.</li>
                    <li>Ideally, you want players in the <strong>Bottom-Right</strong> quadrant (High Production, Low Salary).</li>
                </ul>
            </section>
        </div>
    );

    return (
        <PageShell width="wide">
                <header>
                    <h1 className="text-3xl font-bold tracking-tight text-ink">
                        Players
                    </h1>
                    <p className="text-ink-subtle mt-2">
                        Search the league directory or explore the salary-vs-production chart.
                    </p>
                </header>

                <Tabs
                    activeId={tab}
                    tabs={[
                        { id: "directory", label: "Directory", content: directory },
                        { id: "efficiency", label: "Efficiency", content: efficiency },
                    ]}
                />
        </PageShell>
    );
}
