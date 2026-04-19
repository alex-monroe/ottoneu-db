/**
 * Shared validation helper for API route inputs.
 *
 * Usage:
 *   const parsed = await parseJson(req, MySchema);
 *   if (!parsed.ok) return parsed.response;
 *   const data = parsed.data; // typed as z.infer<typeof MySchema>
 */

import { NextRequest, NextResponse } from "next/server";
import type { z, ZodType } from "zod";

export type ParseResult<T> =
    | { ok: true; data: T }
    | { ok: false; response: NextResponse };

/**
 * Parse and validate a JSON request body against a Zod schema.
 * On failure, returns a 400 response with a `issues` array (Zod's default).
 * On success, returns the typed, parsed data.
 */
export async function parseJson<T extends ZodType>(
    req: NextRequest,
    schema: T,
): Promise<ParseResult<z.infer<T>>> {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Invalid JSON", issues: [] },
                { status: 400 },
            ),
        };
    }
    const result = schema.safeParse(body);
    if (!result.success) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: "Invalid request body", issues: result.error.issues },
                { status: 400 },
            ),
        };
    }
    return { ok: true, data: result.data };
}
