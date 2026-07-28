/**
 * @jest-environment node
 *
 * Unit tests for lib/mcp/auth.ts — the MCP endpoint accepts either an OAuth
 * access token or the shared MCP_API_KEY. Node environment: OAuth token
 * verification uses crypto.subtle, which JSDOM does not fully implement.
 */
import { isValidKey, verifyBearer } from "@/lib/mcp/auth";
import { issueAccessToken } from "@/lib/oauth/tokens";
import { signSession } from "@/lib/session";

describe("isValidKey", () => {
    test("accepts a matching key", () => {
        expect(isValidKey("secret-123", "secret-123")).toBe(true);
    });

    test("rejects a mismatched key", () => {
        expect(isValidKey("wrong", "secret-123")).toBe(false);
    });

    test("rejects a mismatched key of the same length", () => {
        expect(isValidKey("secret-124", "secret-123")).toBe(false);
    });

    test("rejects an empty candidate", () => {
        expect(isValidKey("", "secret-123")).toBe(false);
        expect(isValidKey(undefined, "secret-123")).toBe(false);
    });

    test("fails closed when the expected key is unset or empty", () => {
        expect(isValidKey("anything", undefined)).toBe(false);
        expect(isValidKey("anything", "")).toBe(false);
        expect(isValidKey("", "")).toBe(false);
    });
});

describe("verifyBearer", () => {
    const req = {} as Request;
    const originalKey = process.env.MCP_API_KEY;
    const originalSecret = process.env.SESSION_SECRET;

    beforeEach(() => {
        process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
    });

    afterEach(() => {
        if (originalKey === undefined) delete process.env.MCP_API_KEY;
        else process.env.MCP_API_KEY = originalKey;
        if (originalSecret === undefined) delete process.env.SESSION_SECRET;
        else process.env.SESSION_SECRET = originalSecret;
    });

    describe("shared key mode", () => {
        test("returns AuthInfo for the correct key", async () => {
            process.env.MCP_API_KEY = "league-key";
            expect(await verifyBearer(req, "league-key")).toEqual({
                token: "league-key",
                clientId: "league-shared-key",
                scopes: ["read"],
                extra: { authMode: "shared_key" },
            });
        });

        test("returns undefined for a wrong key", async () => {
            process.env.MCP_API_KEY = "league-key";
            expect(await verifyBearer(req, "not-the-key")).toBeUndefined();
        });

        test("returns undefined for a missing token", async () => {
            process.env.MCP_API_KEY = "league-key";
            expect(await verifyBearer(req, undefined)).toBeUndefined();
        });

        test("fails closed when MCP_API_KEY is unset", async () => {
            delete process.env.MCP_API_KEY;
            expect(await verifyBearer(req, "anything")).toBeUndefined();
        });
    });

    describe("OAuth mode", () => {
        test("accepts a valid access token and surfaces the granting user", async () => {
            delete process.env.MCP_API_KEY;
            const { accessToken } = await issueAccessToken({
                userId: "user-1",
                clientId: "mcp_abc",
                scope: "league:read",
            });

            expect(await verifyBearer(req, accessToken)).toEqual({
                token: accessToken,
                clientId: "mcp_abc",
                scopes: ["league:read"],
                extra: { userId: "user-1", authMode: "oauth" },
            });
        });

        test("rejects an access token signed with a different secret", async () => {
            const { accessToken } = await issueAccessToken({
                userId: "user-1",
                clientId: "mcp_abc",
                scope: "league:read",
            });
            process.env.SESSION_SECRET = "rotated-secret";
            expect(await verifyBearer(req, accessToken)).toBeUndefined();
        });

        test("rejects an expired access token", async () => {
            const past = Date.now() - 2 * 60 * 60 * 1000;
            jest.spyOn(Date, "now").mockReturnValueOnce(past);
            const { accessToken } = await issueAccessToken({
                userId: "user-1",
                clientId: "mcp_abc",
                scope: "league:read",
            });
            jest.restoreAllMocks();
            expect(await verifyBearer(req, accessToken)).toBeUndefined();
        });

        test("does not accept a login session cookie as an MCP token", async () => {
            const sessionToken = await signSession("user-1", true, true);
            expect(await verifyBearer(req, sessionToken)).toBeUndefined();
        });
    });

    test("both credentials work against the same endpoint", async () => {
        process.env.MCP_API_KEY = "league-key";
        const { accessToken } = await issueAccessToken({
            userId: "user-1",
            clientId: "mcp_abc",
            scope: "league:read",
        });

        expect(await verifyBearer(req, "league-key")).toMatchObject({
            extra: { authMode: "shared_key" },
        });
        expect(await verifyBearer(req, accessToken)).toMatchObject({
            extra: { authMode: "oauth" },
        });
        expect(await verifyBearer(req, "neither-of-these")).toBeUndefined();
    });
});
