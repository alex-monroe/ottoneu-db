/**
 * Zod schemas for user-management API inputs.
 * bcrypt's 72-byte password limit drives the upper bound.
 */

import { z } from "zod";

export const CreateUserSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(6).max(72),
    has_projections_access: z.boolean().optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
    has_projections_access: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
