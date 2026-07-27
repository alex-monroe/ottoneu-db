/**
 * @jest-environment node
 *
 * Unit tests for lib/oauth/pkce.ts — PKCE S256 verification.
 */
import { createHash, randomBytes } from "node:crypto";
import { verifyCodeChallenge, isSupportedChallengeMethod } from "@/lib/oauth/pkce";

/** Independent S256 implementation, so the test doesn't reuse the code under test. */
function challengeFor(verifier: string): string {
    return createHash("sha256").update(verifier).digest("base64url");
}

const VERIFIER = randomBytes(32).toString("base64url"); // 43 chars

describe("isSupportedChallengeMethod", () => {
    test("accepts S256 only", () => {
        expect(isSupportedChallengeMethod("S256")).toBe(true);
    });

    test("rejects plain, lowercase, empty, and missing methods", () => {
        expect(isSupportedChallengeMethod("plain")).toBe(false);
        expect(isSupportedChallengeMethod("s256")).toBe(false);
        expect(isSupportedChallengeMethod("")).toBe(false);
        expect(isSupportedChallengeMethod(undefined)).toBe(false);
        expect(isSupportedChallengeMethod(null)).toBe(false);
    });
});

describe("verifyCodeChallenge", () => {
    test("accepts the verifier that produced the challenge", async () => {
        expect(await verifyCodeChallenge(VERIFIER, challengeFor(VERIFIER))).toBe(true);
    });

    test("rejects a different verifier", async () => {
        const other = randomBytes(32).toString("base64url");
        expect(await verifyCodeChallenge(other, challengeFor(VERIFIER))).toBe(false);
    });

    test("rejects a verifier passed as its own challenge (plain downgrade)", async () => {
        expect(await verifyCodeChallenge(VERIFIER, VERIFIER)).toBe(false);
    });

    test("rejects missing inputs", async () => {
        expect(await verifyCodeChallenge(undefined, challengeFor(VERIFIER))).toBe(false);
        expect(await verifyCodeChallenge(VERIFIER, undefined)).toBe(false);
        expect(await verifyCodeChallenge("", "")).toBe(false);
    });

    test("enforces the RFC 7636 length bounds", async () => {
        const tooShort = "a".repeat(42);
        const tooLong = "a".repeat(129);
        expect(await verifyCodeChallenge(tooShort, challengeFor(tooShort))).toBe(false);
        expect(await verifyCodeChallenge(tooLong, challengeFor(tooLong))).toBe(false);

        const minimum = "a".repeat(43);
        expect(await verifyCodeChallenge(minimum, challengeFor(minimum))).toBe(true);
    });

    test("rejects verifiers with characters outside the unreserved set", async () => {
        const illegal = `${"a".repeat(42)}/`;
        expect(await verifyCodeChallenge(illegal, challengeFor(illegal))).toBe(false);
    });
});
