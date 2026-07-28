/**
 * @jest-environment node
 *
 * Unit tests for lib/oauth/tokens.ts — access and consent token signing.
 * Node environment: JSDOM lacks a full crypto.subtle implementation.
 */
import {
    issueAccessToken,
    verifyAccessToken,
    issueConsentRequestToken,
    verifyConsentRequestToken,
    generateOpaqueToken,
} from "@/lib/oauth/tokens";
import { signSession } from "@/lib/session";
import { ACCESS_TOKEN_TTL_SECONDS } from "@/lib/oauth/constants";

const originalSecret = process.env.SESSION_SECRET;

beforeEach(() => {
    process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
});

afterAll(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
});

describe("access tokens", () => {
    test("round-trips claims", async () => {
        const { accessToken, expiresIn } = await issueAccessToken({
            userId: "user-1",
            clientId: "mcp_abc",
            scope: "league:read",
        });
        expect(expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
        expect(await verifyAccessToken(accessToken)).toEqual({
            userId: "user-1",
            clientId: "mcp_abc",
            scope: "league:read",
        });
    });

    test("rejects a tampered payload", async () => {
        const { accessToken } = await issueAccessToken({
            userId: "user-1",
            clientId: "mcp_abc",
            scope: "league:read",
        });
        const [, signature] = accessToken.split(".");
        const forgedPayload = Buffer.from(
            JSON.stringify({
                typ: "oauth_at",
                sub: "someone-else",
                cid: "mcp_abc",
                scope: "league:read",
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + 3600,
            })
        ).toString("base64url");
        expect(await verifyAccessToken(`${forgedPayload}.${signature}`)).toBeNull();
    });

    test("rejects a token signed with a different secret", async () => {
        const { accessToken } = await issueAccessToken({
            userId: "user-1",
            clientId: "mcp_abc",
            scope: "league:read",
        });
        process.env.SESSION_SECRET = "a-completely-different-secret";
        expect(await verifyAccessToken(accessToken)).toBeNull();
    });

    test("rejects an expired token", async () => {
        const realNow = Date.now;
        const past = realNow() - (ACCESS_TOKEN_TTL_SECONDS + 60) * 1000;
        jest.spyOn(Date, "now").mockReturnValueOnce(past);
        const { accessToken } = await issueAccessToken({
            userId: "user-1",
            clientId: "mcp_abc",
            scope: "league:read",
        });
        jest.restoreAllMocks();
        expect(await verifyAccessToken(accessToken)).toBeNull();
    });

    test("rejects malformed input", async () => {
        expect(await verifyAccessToken(undefined)).toBeNull();
        expect(await verifyAccessToken("")).toBeNull();
        expect(await verifyAccessToken("not-a-token")).toBeNull();
        expect(await verifyAccessToken("too.many.parts")).toBeNull();
    });

    test("fails closed when SESSION_SECRET is unset", async () => {
        const { accessToken } = await issueAccessToken({
            userId: "user-1",
            clientId: "mcp_abc",
            scope: "league:read",
        });
        delete process.env.SESSION_SECRET;
        expect(await verifyAccessToken(accessToken)).toBeNull();
    });

    test("a session cookie is not accepted as an access token", async () => {
        // Both are HMAC-signed with the same key; only the payload shape and
        // `typ` discriminator keep them apart.
        const sessionToken = await signSession("user-1", true, true);
        expect(await verifyAccessToken(sessionToken)).toBeNull();
    });

    test("a consent token is not accepted as an access token", async () => {
        const consent = await issueConsentRequestToken({
            clientId: "mcp_abc",
            redirectUri: "https://example.com/cb",
            codeChallenge: "challenge",
            scope: "league:read",
            state: null,
            userId: "user-1",
            resource: null,
        });
        expect(await verifyAccessToken(consent)).toBeNull();
    });
});

describe("consent request tokens", () => {
    test("round-trips the validated authorization request", async () => {
        const token = await issueConsentRequestToken({
            clientId: "mcp_abc",
            redirectUri: "https://example.com/cb",
            codeChallenge: "challenge-value",
            scope: "league:read",
            state: "xyz",
            userId: "user-1",
            resource: "https://example.com/api/mcp/mcp",
        });
        expect(await verifyConsentRequestToken(token)).toEqual({
            clientId: "mcp_abc",
            redirectUri: "https://example.com/cb",
            codeChallenge: "challenge-value",
            scope: "league:read",
            state: "xyz",
            userId: "user-1",
            resource: "https://example.com/api/mcp/mcp",
        });
    });

    test("an access token is not accepted as a consent token", async () => {
        const { accessToken } = await issueAccessToken({
            userId: "user-1",
            clientId: "mcp_abc",
            scope: "league:read",
        });
        expect(await verifyConsentRequestToken(accessToken)).toBeNull();
    });
});

describe("generateOpaqueToken", () => {
    test("produces unique, URL-safe, high-entropy values", () => {
        const tokens = new Set(Array.from({ length: 50 }, () => generateOpaqueToken()));
        expect(tokens.size).toBe(50);
        for (const token of tokens) {
            expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
            expect(token.length).toBeGreaterThanOrEqual(43);
        }
    });
});
