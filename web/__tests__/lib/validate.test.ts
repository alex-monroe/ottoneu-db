/**
 * @jest-environment node
 *
 * Uses the node environment so the global Web `Request` constructor is
 * available — `next/server` (imported transitively via `@/lib/validate`)
 * extends it. JSDOM's Request shim doesn't expose all the fields next/server
 * relies on.
 */
import { z } from "zod";
import { parseJson } from "@/lib/validate";
import type { NextRequest } from "next/server";

function fakeRequest(body: unknown, { malformed = false } = {}): NextRequest {
    const json = malformed
        ? () => Promise.reject(new Error("Unexpected token"))
        : () => Promise.resolve(body);
    // We only exercise the `json()` method on the request — cast is safe for tests.
    return { json } as unknown as NextRequest;
}

const Schema = z.object({ name: z.string().min(1) });

describe("parseJson", () => {
    test("returns parsed data on a valid body", async () => {
        const result = await parseJson(fakeRequest({ name: "ok" }), Schema);
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.data.name).toBe("ok");
    });

    test("returns 400 with issues on schema failure", async () => {
        const result = await parseJson(fakeRequest({ name: "" }), Schema);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.response.status).toBe(400);
            const json = await result.response.json();
            expect(json.error).toBe("Invalid request body");
            expect(Array.isArray(json.issues)).toBe(true);
            expect(json.issues.length).toBeGreaterThan(0);
        }
    });

    test("returns 400 on malformed JSON", async () => {
        const result = await parseJson(fakeRequest(null, { malformed: true }), Schema);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.response.status).toBe(400);
            const json = await result.response.json();
            expect(json.error).toBe("Invalid JSON");
        }
    });
});
