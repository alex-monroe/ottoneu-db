/**
 * Zod schemas for arbitration-plan API inputs.
 */

import { z } from "zod";

export const CreatePlanSchema = z.object({
    name: z.string().trim().min(1).max(100),
    notes: z.string().max(2000).nullish(),
});

export type CreatePlanInput = z.infer<typeof CreatePlanSchema>;

export const UpdatePlanSchema = z.object({
    name: z.string().trim().min(1).max(100).optional(),
    notes: z.string().max(2000).nullish(),
    // Allocations are { player_id: amount }. Negative or NaN amounts get rejected.
    // amount=0 is allowed (later filtered before insert) so the client can clear an entry.
    allocations: z
        .record(z.string().min(1), z.number().int().min(0))
        .optional(),
});

export type UpdatePlanInput = z.infer<typeof UpdatePlanSchema>;

export const DuplicatePlanSchema = z.object({
    name: z.string().trim().min(1).max(100),
});

export type DuplicatePlanInput = z.infer<typeof DuplicatePlanSchema>;
