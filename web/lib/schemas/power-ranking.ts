/**
 * Zod schema for the power-ranking ballot API.
 *
 * Shape only. That the order is a *complete permutation of the current league*
 * is not something a schema can know, so the route checks it with
 * `isCompleteBallot` against the live team list — and only on submit, so a
 * half-finished draft still saves.
 */

import { z } from "zod";
import { NFL_REGULAR_SEASON_WEEKS } from "../config";

/** Longest note a host can attach to a team — a sentence to read out, not a blog. */
export const MAX_NOTE_LENGTH = 280;

/**
 * Longest *working* note. Roomier than the on-air one because it is the
 * opposite kind of writing: nobody reads it out, so it holds the half-formed
 * case for moving a team that you want back in front of you next Tuesday.
 */
export const MAX_PREP_NOTE_LENGTH = 2000;

export const SaveBallotSchema = z.object({
    season: z.number().int().min(2000).max(2100),
    week: z.number().int().min(1).max(NFL_REGULAR_SEASON_WEEKS),
    /** Teams best-first; position in the array is the rank. */
    order: z.array(z.string().trim().min(1).max(120)).max(64),
    notes: z.record(z.string().min(1).max(120), z.string().max(MAX_NOTE_LENGTH)).optional(),
    /**
     * Private working notes, keyed by team name. Never leaves the ballot: no
     * consolidation read returns them and the reveal screen has no field to
     * put them in.
     */
    prepNotes: z
        .record(z.string().min(1).max(120), z.string().max(MAX_PREP_NOTE_LENGTH))
        .optional(),
    /** True locks the ballot in; false keeps it a private draft. */
    submit: z.boolean(),
});

export type SaveBallotInput = z.infer<typeof SaveBallotSchema>;
