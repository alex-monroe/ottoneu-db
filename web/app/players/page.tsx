import { fetchAllPlayers } from "@/lib/players";
import PlayerSearch from "@/components/PlayerSearch";

export const revalidate = 3600; // Revalidate every hour

export const metadata = {
    title: "Players | Ottoneu Analytics",
    description: "Browse and search all players in Ottoneu League 309",
};

export default async function PlayersPage() {
    const players = await fetchAllPlayers();

    return (
        <main className="min-h-screen bg-white dark:bg-black p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <header>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Player Directory
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">
                        Browse all players in League 309. Click a name to view their full
                        card with stats and transaction history.
                    </p>
                </header>

                <PlayerSearch players={players} />
            </div>
        </main>
    );
}
