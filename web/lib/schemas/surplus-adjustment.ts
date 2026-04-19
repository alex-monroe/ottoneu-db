/**
 * Zod schemas for surplus-adjustment API inputs.
 */

import { z } from "zod";

export const SurplusAdjustmentSchema = z.object({
    player_id: z.string().min(1),
    adjustment: z.number().finite(),
    notes: z.string().max(2000).optional(),
});

export type SurplusAdjustmentInput = z.infer<typeof SurplusAdjustmentSchema>;

export const SurplusAdjustmentsArraySchema = z.array(SurplusAdjustmentSchema);

export type SurplusAdjustmentsInput = z.infer<typeof SurplusAdjustmentsArraySchema>;
