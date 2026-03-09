import { SurplusPlayer, ProjectedSalaryPlayer } from "./types";
import { MY_TEAM } from "./config";

/**
 * Analyzes My Team's roster for keep/cut decisions based on surplus value.
 *
 * Recommendation Logic:
 * - Surplus >= 10: Strong Keep
 * - Surplus >= 0: Keep
 * - Surplus >= -5: Borderline
 * - Else: Cut
 */
export function analyzeProjectedSalary(players: SurplusPlayer[]): ProjectedSalaryPlayer[] {
    const myRoster = players.filter((p) => p.team_name === MY_TEAM);

    return myRoster.map((p) => {
        let rec = "Cut";
        if (p.surplus >= 10) {
            rec = "Strong Keep";
        } else if (p.surplus >= 0) {
            rec = "Keep";
        } else if (p.surplus >= -5) {
            rec = "Borderline";
        }

        return {
            ...p,
            recommendation: rec,
        };
    }).sort((a, b) => b.surplus - a.surplus);
}
