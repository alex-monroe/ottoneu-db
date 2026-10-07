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
    // The podcast-tools role. Independent of the other two flags, so it is its
    // own optional field rather than part of a level.
    is_podcaster: z.boolean().optional(),
    // The Ottoneu team this account manages. Empty string clears the binding —
    // z.null() would not survive a JSON round-trip from a <select>.
    team_name: z.string().trim().max(120).nullable().optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

/** A "forgot password" request: just the account's email. */
export const ForgotPasswordSchema = z.object({
    email: z.string().trim().toLowerCase().email().max(254),
});

export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

/** Setting a new password from an admin-issued reset link. */
export const ResetPasswordSchema = z
    .object({
        token: z.string().min(1).max(256),
        password: z.string().min(6).max(72),
        confirmPassword: z.string(),
    })
    .refine((v) => v.password === v.confirmPassword, {
        message: "Passwords do not match",
        path: ["confirmPassword"],
    });

export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
