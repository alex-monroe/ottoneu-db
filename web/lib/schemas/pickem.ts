/**
 * Zod schemas for the pick'em API.
 *
 * Shape only. Whether the game is in the week, the team plays in it, and the
 * week is still open are facts about the live schedule and the clock, so the
 * route checks them against `fetchPickemWeek` — never the client's claim.
 */

import { z } from "zod";
import { NFL_REGULAR_SEASON_WEEKS } from "../config";

export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 30;

export const SavePickSchema = z
    .object({
        season: z.number().int().min(2000).max(2100),
        week: z.number().int().min(1).max(NFL_REGULAR_SEASON_WEEKS),
        /** Ottoneu's game id, as in `league_matchups.game_id`. */
        gameId: z.number().int().positive(),
        /** The team picked to win, or null to clear the pick. */
        teamId: z.number().int().positive().nullable(),
    })
    .strict();

export type SavePickInput = z.infer<typeof SavePickSchema>;

export const SetPickemNameSchema = z
    .object({
        // Length is checked after whitespace is collapsed, in the route.
        displayName: z.string().max(MAX_NAME_LENGTH * 2),
    })
    .strict();
