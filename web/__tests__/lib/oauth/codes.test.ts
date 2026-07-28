/**
 * @jest-environment node
 *
 * Unit tests for lib/oauth/codes.ts — single-use authorization codes and
 * rotating refresh tokens.
 *
 * The important property here is that consumption is a *conditional* update
 * (`WHERE hash = ? AND consumed_at IS NULL`) rather than a read-then-write, so
 * a replay loses the race in the database instead of in application code.
 * These tests assert both the guard is applied and that a no-row result is
 * treated as a rejection.
 */
import { createHash } from "node:crypto";

const mockMaybeSingle = jest.fn();
const mockInsert = jest.fn();

// `.select()` is terminal in the bulk-revoke path but chains to
// `.maybeSingle()` elsewhere, so the object it returns is both awaitable
// and chainable.
let selectAwaitResult: { data: unknown; error: unknown } = { data: [], error: null };
const selectResult = {
    maybeSingle: mockMaybeSingle,
    then: (resolve: (value: unknown) => unknown) => resolve(selectAwaitResult),
};

// Explicitly typed: the builder methods return the chain itself, so inference
// would be circular.
interface MockChain {
    from: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    eq: jest.Mock;
    is: jest.Mock;
    select: jest.Mock;
}

const chain: MockChain = {
    from: jest.fn(() => chain),
    insert: mockInsert,
    update: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    is: jest.fn(() => chain),
    select: jest.fn(() => selectResult),
};

jest.mock("@/lib/supabase", () => ({
    supabase: {},
    getSupabaseAdmin: jest.fn(() => chain),
}));

import {
    createAuthorizationCode,
    consumeAuthorizationCode,
    createRefreshToken,
    consumeRefreshToken,
    revokeRefreshTokensForUser,
} from "@/lib/oauth/codes";

function sha256Hex(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

function future(): string {
    return new Date(Date.now() + 60_000).toISOString();
}

function past(): string {
    return new Date(Date.now() - 60_000).toISOString();
}

beforeEach(() => {
    jest.clearAllMocks();
    mockInsert.mockResolvedValue({ data: null, error: null });
    selectAwaitResult = { data: [], error: null };
});

describe("createAuthorizationCode", () => {
    test("stores only the hash and returns the plaintext code", async () => {
        const code = await createAuthorizationCode({
            clientId: "mcp_abc",
            userId: "user-1",
            redirectUri: "https://example.com/cb",
            codeChallenge: "challenge",
            scope: "league:read",
        });

        expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
        const inserted = mockInsert.mock.calls[0][0];
        expect(inserted.code_hash).toBe(sha256Hex(code));
        expect(JSON.stringify(inserted)).not.toContain(code);
        expect(inserted.client_id).toBe("mcp_abc");
        expect(inserted.user_id).toBe("user-1");
    });

    test("throws when the insert fails", async () => {
        mockInsert.mockResolvedValue({ data: null, error: { message: "boom" } });
        await expect(
            createAuthorizationCode({
                clientId: "mcp_abc",
                userId: "user-1",
                redirectUri: "https://example.com/cb",
                codeChallenge: "challenge",
                scope: "league:read",
            })
        ).rejects.toThrow(/boom/);
    });
});

describe("consumeAuthorizationCode", () => {
    test("returns the grant and marks the code consumed atomically", async () => {
        mockMaybeSingle.mockResolvedValue({
            data: {
                client_id: "mcp_abc",
                user_id: "user-1",
                redirect_uri: "https://example.com/cb",
                code_challenge: "challenge",
                scope: "league:read",
                expires_at: future(),
            },
            error: null,
        });

        expect(await consumeAuthorizationCode("the-code")).toEqual({
            clientId: "mcp_abc",
            userId: "user-1",
            redirectUri: "https://example.com/cb",
            codeChallenge: "challenge",
            scope: "league:read",
        });

        // The single-use guard: only update rows not already consumed.
        expect(chain.is).toHaveBeenCalledWith("consumed_at", null);
        expect(chain.eq).toHaveBeenCalledWith("code_hash", sha256Hex("the-code"));
    });

    test("rejects a replayed code (conditional update matched no row)", async () => {
        mockMaybeSingle.mockResolvedValue({ data: null, error: null });
        expect(await consumeAuthorizationCode("already-used")).toBeNull();
    });

    test("rejects an expired code even if the row was still unconsumed", async () => {
        mockMaybeSingle.mockResolvedValue({
            data: {
                client_id: "mcp_abc",
                user_id: "user-1",
                redirect_uri: "https://example.com/cb",
                code_challenge: "challenge",
                scope: "league:read",
                expires_at: past(),
            },
            error: null,
        });
        expect(await consumeAuthorizationCode("stale")).toBeNull();
    });

    test("rejects missing input without touching the database", async () => {
        expect(await consumeAuthorizationCode(undefined)).toBeNull();
        expect(chain.update).not.toHaveBeenCalled();
    });
});

describe("refresh tokens", () => {
    test("createRefreshToken stores only the hash", async () => {
        const token = await createRefreshToken({
            clientId: "mcp_abc",
            userId: "user-1",
            scope: "league:read",
        });
        const inserted = mockInsert.mock.calls[0][0];
        expect(inserted.token_hash).toBe(sha256Hex(token));
        expect(JSON.stringify(inserted)).not.toContain(token);
    });

    test("consumeRefreshToken rotates: the token is revoked as it is used", async () => {
        mockMaybeSingle.mockResolvedValue({
            data: {
                client_id: "mcp_abc",
                user_id: "user-1",
                scope: "league:read",
                expires_at: future(),
            },
            error: null,
        });

        expect(await consumeRefreshToken("refresh-1")).toEqual({
            clientId: "mcp_abc",
            userId: "user-1",
            scope: "league:read",
        });
        expect(chain.is).toHaveBeenCalledWith("revoked_at", null);
        expect(chain.update).toHaveBeenCalledWith(
            expect.objectContaining({ revoked_at: expect.any(String) })
        );
    });

    test("rejects a reused or revoked refresh token", async () => {
        mockMaybeSingle.mockResolvedValue({ data: null, error: null });
        expect(await consumeRefreshToken("reused")).toBeNull();
    });

    test("rejects an expired refresh token", async () => {
        mockMaybeSingle.mockResolvedValue({
            data: {
                client_id: "mcp_abc",
                user_id: "user-1",
                scope: "league:read",
                expires_at: past(),
            },
            error: null,
        });
        expect(await consumeRefreshToken("expired")).toBeNull();
    });

    test("revokeRefreshTokensForUser reports how many were revoked", async () => {
        selectAwaitResult = { data: [{ token_hash: "a" }, { token_hash: "b" }], error: null };
        expect(await revokeRefreshTokensForUser("user-1")).toBe(2);
        expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
        expect(chain.is).toHaveBeenCalledWith("revoked_at", null);
    });
});
