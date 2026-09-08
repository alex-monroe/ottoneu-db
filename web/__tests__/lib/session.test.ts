/**
 * @jest-environment node
 *
 * Uses the node environment so that `crypto.subtle` (Web Crypto) is available
 * on Node 18+. JSDOM's shim does not provide a fully featured subtle crypto.
 */
import { signSession, verifySession } from "@/lib/session";

const ORIGINAL_SECRET = process.env.SESSION_SECRET;

beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
});

afterAll(() => {
    if (ORIGINAL_SECRET === undefined) {
        delete process.env.SESSION_SECRET;
    } else {
        process.env.SESSION_SECRET = ORIGINAL_SECRET;
    }
});

describe("signSession / verifySession round-trip", () => {
    test("signs and verifies a session with the embedded user info", async () => {
        const token = await signSession("user-42", true, false);
        const session = await verifySession(token);

        expect(session.valid).toBe(true);
        expect(session.userId).toBe("user-42");
        expect(session.isAdmin).toBe(true);
        expect(session.hasProjectionsAccess).toBe(false);
    });

    test("preserves hasProjectionsAccess=true through the round trip", async () => {
        const token = await signSession("user-1", false, true);
        const session = await verifySession(token);

        expect(session.valid).toBe(true);
        expect(session.isAdmin).toBe(false);
        expect(session.hasProjectionsAccess).toBe(true);
    });

    test("carries the podcaster role, and defaults it to false", async () => {
        const host = await verifySession(await signSession("user-1", false, false, true));
        expect(host.isPodcaster).toBe(true);
        expect(host.isAdmin).toBe(false);
        expect(host.hasProjectionsAccess).toBe(false);

        const plain = await verifySession(await signSession("user-1", false, false));
        expect(plain.isPodcaster).toBe(false);
    });

    test("each sign call produces a unique token (nonce)", async () => {
        const a = await signSession("user-1", false, false);
        const b = await signSession("user-1", false, false);
        expect(a).not.toBe(b);
    });
});

/**
 * Sign a payload exactly the way the pre-podcaster version of session.ts did.
 * Reproduced here rather than imported, because the point is that a token
 * minted by code that no longer exists still verifies: cookies live seven days,
 * so shipping the new field must not sign every league member out.
 */
async function signV1(
    userId: string,
    isAdmin: boolean,
    hasProjectionsAccess: boolean,
    timestamp = Date.now(),
): Promise<string> {
    const enc = new TextEncoder();
    const secretHash = await crypto.subtle.digest(
        "SHA-256",
        enc.encode(process.env.SESSION_SECRET!),
    );
    const key = await crypto.subtle.importKey(
        "raw",
        secretHash,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
    const payload = `user:${userId}:${isAdmin}:${hasProjectionsAccess}:${timestamp}:${crypto.randomUUID()}`;
    const b64url = (bytes: Uint8Array) =>
        Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const payloadB64 = b64url(enc.encode(payload));
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
    return `${payloadB64}.${b64url(new Uint8Array(sig))}`;
}

describe("cookies minted before the podcaster role", () => {
    test("still verify, with the new flag reading false", async () => {
        const session = await verifySession(await signV1("user-9", true, true));
        expect(session.valid).toBe(true);
        expect(session.userId).toBe("user-9");
        expect(session.isAdmin).toBe(true);
        expect(session.hasProjectionsAccess).toBe(true);
        // Not a host until the cookie is re-signed — which is what
        // /api/auth/refresh and the /podcast hub are for.
        expect(session.isPodcaster).toBe(false);
    });

    test("still expire on the same seven-day clock", async () => {
        const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;
        const stale = await signV1("user-9", false, false, Date.now() - EIGHT_DAYS_MS);
        expect((await verifySession(stale)).valid).toBe(false);
    });
});

describe("verifySession rejection paths", () => {
    test("rejects undefined / null / non-string tokens", async () => {
        expect((await verifySession(undefined)).valid).toBe(false);
        expect((await verifySession(null)).valid).toBe(false);
        expect((await verifySession("")).valid).toBe(false);
    });

    test("rejects a payload with an unrecognised field count", async () => {
        // A validly signed token is not enough: a payload shape this verifier
        // does not know must not be parsed positionally into the wrong fields.
        const enc = new TextEncoder();
        const secretHash = await crypto.subtle.digest(
            "SHA-256",
            enc.encode(process.env.SESSION_SECRET!),
        );
        const key = await crypto.subtle.importKey(
            "raw",
            secretHash,
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );
        const b64url = (bytes: Uint8Array) =>
            Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const payloadB64 = b64url(enc.encode(`user:u:true:true:true:true:${Date.now()}:nonce`));
        const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payloadB64));
        expect(
            (await verifySession(`${payloadB64}.${b64url(new Uint8Array(sig))}`)).valid,
        ).toBe(false);
    });

    test("rejects tokens without the payload.signature shape", async () => {
        expect((await verifySession("not-a-token")).valid).toBe(false);
        expect((await verifySession("too.many.parts")).valid).toBe(false);
    });

    test("rejects a tampered payload with a valid-looking signature", async () => {
        const token = await signSession("user-42", false, false);
        const [payload, signature] = token.split(".");
        // Flip a character in the payload — signature no longer matches.
        const tamperedPayload = payload.slice(0, -1) + (payload.slice(-1) === "A" ? "B" : "A");
        const tampered = `${tamperedPayload}.${signature}`;

        const session = await verifySession(tampered);
        expect(session.valid).toBe(false);
    });

    test("rejects a token signed with a different secret", async () => {
        const token = await signSession("user-42", false, false);
        process.env.SESSION_SECRET = "different-secret";

        const session = await verifySession(token);
        expect(session.valid).toBe(false);
    });

    test("rejects an expired token (> 7 days old)", async () => {
        const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;
        const realNow = Date.now;
        const past = realNow() - EIGHT_DAYS_MS;

        // Sign at t=past, verify at t=now.
        jest.spyOn(Date, "now").mockReturnValueOnce(past);
        const token = await signSession("user-42", false, false);

        const session = await verifySession(token);
        expect(session.valid).toBe(false);

        (Date.now as jest.Mock).mockRestore?.();
    });

    test("accepts a token 6 days old (within 7-day window)", async () => {
        const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
        const past = Date.now() - SIX_DAYS_MS;

        jest.spyOn(Date, "now").mockReturnValueOnce(past);
        const token = await signSession("user-42", false, false);

        const session = await verifySession(token);
        expect(session.valid).toBe(true);

        (Date.now as jest.Mock).mockRestore?.();
    });

    test("throws when SESSION_SECRET is missing (signSession)", async () => {
        delete process.env.SESSION_SECRET;
        await expect(signSession("user-42", false, false)).rejects.toThrow(
            /SESSION_SECRET/
        );
    });

    test("returns invalid (does not throw) when SESSION_SECRET is missing on verify", async () => {
        const token = await signSession("user-42", false, false);
        delete process.env.SESSION_SECRET;

        const session = await verifySession(token);
        // verifySession catches the thrown error from getSessionKey and returns invalid.
        expect(session.valid).toBe(false);
    });
});
