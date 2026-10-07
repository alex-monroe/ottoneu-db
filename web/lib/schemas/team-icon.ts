/**
 * Zod schemas for the team-icon API.
 *
 * Shape only. Whether the bytes are really a PNG/JPEG/WebP of acceptable size
 * is checked by `parseTeamIconDataUrl`, and whose team it is by the route.
 */

import { z } from "zod";
import { MAX_TEAM_ICON_BYTES } from "../team-icons";

// Base64 inflates by 4/3; leave room for the `data:image/...;base64,` prefix.
const MAX_DATA_URL_LENGTH = Math.ceil((MAX_TEAM_ICON_BYTES * 4) / 3) + 64;

export const SetTeamIconSchema = z
    .object({
        dataUrl: z.string().max(MAX_DATA_URL_LENGTH),
        /** Admins only: set another team's icon. Defaults to the caller's team. */
        teamName: z.string().trim().min(1).max(120).optional(),
    })
    .strict();

export type SetTeamIconInput = z.infer<typeof SetTeamIconSchema>;

export const DeleteTeamIconSchema = z
    .object({
        teamName: z.string().trim().min(1).max(120).optional(),
    })
    .strict();
