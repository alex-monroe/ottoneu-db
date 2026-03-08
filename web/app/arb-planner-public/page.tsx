import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/auth";
import { fetchPublicArbPlayers } from "@/lib/analysis";
import {
    ARB_BUDGET_PER_TEAM,
    ARB_MIN_PER_TEAM,
    ARB_MAX_PER_TEAM,
    ARB_MAX_PER_PLAYER_PER_TEAM,
    NUM_TEAMS,
    MY_TEAM,
} from "@/lib/analysis";
import { supabase } from "@/lib/supabase";
import { LEAGUE_ID } from "@/lib/analysis";
import PublicArbPlannerClient from "./PublicArbPlannerClient";

export default async function PublicArbPlannerPage() {
    const user = await getAuthenticatedUser();
    if (!user) redirect("/login");

    const allPlayers = await fetchPublicArbPlayers();

    // Get unique opponent team names
    const opponentTeams = [
        ...new Set(
            allPlayers
                .filter(
                    (p) =>
                        p.team_name != null &&
                        p.team_name !== "" &&
                        p.team_name !== "FA" &&
                        p.team_name !== MY_TEAM
                )
                .map((p) => p.team_name!)
        ),
    ].sort();

    // Fetch saved plans
    const { data: plans } = await supabase
        .from("arbitration_plans")
        .select("id, name, notes, created_at, updated_at")
        .eq("league_id", LEAGUE_ID)
        .eq("user_id", user.userId)
        .order("updated_at", { ascending: false });

    return (
        <main className="min-h-screen bg-white dark:bg-black p-8">
            <div className="max-w-7xl mx-auto space-y-6">
                <header>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                        Arbitration Planner
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2">
                        Plan your ${ARB_BUDGET_PER_TEAM} arbitration budget across{" "}
                        {NUM_TEAMS - 1} opponent teams (${ARB_MIN_PER_TEAM}–$
                        {ARB_MAX_PER_TEAM} per team, max ${ARB_MAX_PER_PLAYER_PER_TEAM} per
                        player).
                    </p>
                </header>

                <PublicArbPlannerClient
                    players={allPlayers}
                    initialPlans={plans ?? []}
                    opponentTeams={opponentTeams}
                />
            </div>
        </main>
    );
}
