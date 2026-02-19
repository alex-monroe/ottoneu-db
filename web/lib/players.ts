import { supabase } from "./supabase";
import { PlayerListItem, PlayerCardData, Transaction, SeasonStats } from "./types";

/**
 * Fetch all players with their current season stats and league price
 * for the index / search page.
 */
export async function fetchAllPlayers(): Promise<PlayerListItem[]> {
    const { data: players } = await supabase
        .from("players")
        .select("id, ottoneu_id, name, position, nfl_team")
        .order("name");

    if (!players) return [];

    const { data: stats } = await supabase
        .from("player_stats")
        .select("player_id, total_points, games_played, ppg")
        .eq("season", 2025);

    const { data: prices } = await supabase
        .from("league_prices")
        .select("player_id, price, team_name")
        .eq("league_id", 309)
        .eq("season", 2025);

    const { data: transactions } = await supabase
        .from("transactions")
        .select("player_id, transaction_type, team_name, salary")
        .eq("league_id", 309)
        .order("transaction_date", { ascending: false });

    const statsMap = new Map(
        (stats ?? []).map((s) => [s.player_id, s])
    );
    const priceMap = new Map(
        (prices ?? []).map((p) => [p.player_id, p])
    );

    // keys are player_id, values are the LATEST transaction (since sorted desc)
    const transactionMap = new Map();
    (transactions ?? []).forEach((t) => {
        if (!transactionMap.has(t.player_id)) {
            transactionMap.set(t.player_id, t);
        }
    });

    return players.map((p) => {
        const s = statsMap.get(p.id);
        const pr = priceMap.get(p.id);
        const txn = transactionMap.get(p.id);

        let currentPrice = pr?.price ?? null;
        let currentTeam = pr?.team_name ?? null;

        if (txn) {
            if (txn.transaction_type.toLowerCase().includes("cut")) {
                currentPrice = 0;
                currentTeam = null;
            } else {
                currentPrice = txn.salary;
                currentTeam = txn.team_name;
            }
        }

        return {
            id: p.id,
            ottoneu_id: p.ottoneu_id,
            name: p.name,
            position: p.position,
            nfl_team: p.nfl_team,
            price: currentPrice,
            team_name: currentTeam,
            total_points: s ? Number(s.total_points) : null,
            ppg: s ? Number(s.ppg) : null,
            games_played: s?.games_played ?? null,
        };
    });
}

/**
 * Fetch a single player's full card data including transactions.
 */
export async function fetchPlayerCard(
    ottoneuId: number
): Promise<PlayerCardData | null> {
    // Get the player
    const { data: player } = await supabase
        .from("players")
        .select("id, ottoneu_id, name, position, nfl_team, birth_date")
        .eq("ottoneu_id", ottoneuId)
        .single();

    if (!player) return null;

    // Fetch stats, price, and transactions in parallel
    const [statsRes, priceRes, txnRes] = await Promise.all([
        supabase
            .from("player_stats")
            .select("season, total_points, games_played, snaps, ppg, pps")
            .eq("player_id", player.id)
            .order("season", { ascending: false }),
        supabase
            .from("league_prices")
            .select("price, team_name")
            .eq("player_id", player.id)
            .eq("league_id", 309)
            .eq("season", 2025)
            .maybeSingle(),
        supabase
            .from("transactions")
            .select(
                "id, transaction_type, team_name, from_team, salary, transaction_date, raw_description"
            )
            .eq("player_id", player.id)
            .eq("league_id", 309)
            .order("transaction_date", { ascending: false }),
    ]);

    const pr = priceRes.data;
    const txns: Transaction[] = txnRes.data ?? [];

    let currentPrice = pr?.price ?? null;
    let currentTeam = pr?.team_name ?? null;

    if (txns.length > 0) {
        const latestTxn = txns[0];
        if (latestTxn.transaction_type.toLowerCase().includes("cut")) {
            currentPrice = 0;
            currentTeam = null;
        } else {
            currentPrice = latestTxn.salary;
            currentTeam = latestTxn.team_name;
        }
    }

    const seasonStats: SeasonStats[] = (statsRes.data ?? []).map((row) => ({
        season: row.season,
        total_points: row.total_points != null ? Number(row.total_points) : null,
        games_played: row.games_played ?? null,
        snaps: row.snaps ?? null,
        ppg: row.ppg != null ? Number(row.ppg) : null,
        pps: row.pps != null ? Number(row.pps) : null,
    }));

    return {
        id: player.id,
        ottoneu_id: player.ottoneu_id,
        name: player.name,
        position: player.position,
        nfl_team: player.nfl_team,
        birth_date: player.birth_date ?? null,
        price: currentPrice,
        team_name: currentTeam,
        seasonStats,
        transactions: txns,
    };
}
