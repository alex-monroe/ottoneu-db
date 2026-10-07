/**
 * @jest-environment node
 *
 * Unit tests for lib/password-reset.ts — admin-issued, single-use reset links.
 *
 * Same properties as lib/oauth/codes.ts: only the hash is stored, consumption
 * is a conditional UPDATE so a replayed link is rejected by the database, and
 * an expired link is dead. Plus one of its own: issuing a new link burns the
 * previous one.
 */
import { createHash } from "node:crypto";

const mockMaybeSingle = jest.fn();
const mockInsert = jest.fn();

// Awaiting the chain itself (the burn-earlier-links UPDATE) resolves to this.
let awaitResult: { data: unknown; error: unknown } = { data: null, error: null };

// Explicitly typed: the builder methods return the chain itself, so inference
// would be circular.
interface MockChain {
    from: jest.Mock;
    insert: jest.Mock;
    update: jest.Mock;
    eq: jest.Mock;
    is: jest.Mock;
    select: jest.Mock;
    maybeSingle: jest.Mock;
    then: (resolve: (value: unknown) => unknown) => unknown;
}

const chain: MockChain = {
    from: jest.fn(() => chain),
    insert: mockInsert,
    update: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    is: jest.fn(() => chain),
    select: jest.fn(() => chain),
    maybeSingle: mockMaybeSingle,
    then: (resolve) => resolve(awaitResult),
};

jest.mock("@/lib/supabase", () => ({
    supabase: {},
    getSupabaseAdmin: jest.fn(() => chain),
}));

import {
    createResetToken,
    peekResetToken,
    consumeResetToken,
    resetPath,
    RESET_TOKEN_TTL_SECONDS,
} from "@/lib/password-reset";

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
    awaitResult = { data: null, error: null };
});

describe("createResetToken", () => {
    test("stores only the hash, records the issuing admin, and returns the plaintext", async () => {
        const before = Date.now();
        const token = await createResetToken("user-1", "admin-1");

        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        const inserted = mockInsert.mock.calls[0][0];
        expect(inserted.token_hash).toBe(sha256Hex(token));
        expect(JSON.stringify(inserted)).not.toContain(token);
        expect(inserted.user_id).toBe("user-1");
        expect(inserted.created_by).toBe("admin-1");

        const ttl = new Date(inserted.expires_at).getTime() - before;
        expect(ttl).toBeGreaterThanOrEqual(RESET_TOKEN_TTL_SECONDS * 1000 - 1000);
        expect(ttl).toBeLessThanOrEqual(RESET_TOKEN_TTL_SECONDS * 1000 + 1000);
    });

    test("burns the account's earlier unused links before issuing a new one", async () => {
        await createResetToken("user-1", "admin-1");

        expect(chain.update).toHaveBeenCalledWith({ consumed_at: expect.any(String) });
        expect(chain.eq).toHaveBeenCalledWith("user_id", "user-1");
        expect(chain.is).toHaveBeenCalledWith("consumed_at", null);
        // The burn runs first, so the new link is never caught by it.
        expect(chain.update.mock.invocationCallOrder[0]).toBeLessThan(
            mockInsert.mock.invocationCallOrder[0],
        );
    });

    test("does not issue a link if earlier ones could not be revoked", async () => {
        awaitResult = { data: null, error: { message: "boom" } };
        await expect(createResetToken("user-1", "admin-1")).rejects.toThrow(/boom/);
        expect(mockInsert).not.toHaveBeenCalled();
    });

    test("throws when the insert fails", async () => {
        mockInsert.mockResolvedValue({ data: null, error: { message: "insert failed" } });
        await expect(createResetToken("user-1", "admin-1")).rejects.toThrow(/insert failed/);
    });

    test("issues a different token every time", async () => {
        const a = await createResetToken("user-1", "admin-1");
        const b = await createResetToken("user-1", "admin-1");
        expect(a).not.toBe(b);
    });
});

describe("peekResetToken", () => {
    test("returns the account email for a live link without consuming it", async () => {
        mockMaybeSingle
            .mockResolvedValueOnce({
                data: { user_id: "user-1", expires_at: future(), consumed_at: null },
                error: null,
            })
            .mockResolvedValueOnce({ data: { email: "a@example.com" }, error: null });

        expect(await peekResetToken("tok")).toEqual({ email: "a@example.com" });
        expect(chain.eq).toHaveBeenCalledWith("token_hash", sha256Hex("tok"));
        expect(chain.update).not.toHaveBeenCalled();
    });

    test.each([
        ["used", { user_id: "user-1", expires_at: future(), consumed_at: past() }],
        ["expired", { user_id: "user-1", expires_at: past(), consumed_at: null }],
    ])("rejects a %s link", async (_label, row) => {
        mockMaybeSingle.mockResolvedValueOnce({ data: row, error: null });
        expect(await peekResetToken("tok")).toBeNull();
    });

    test("rejects an unknown or missing token", async () => {
        mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
        expect(await peekResetToken("nope")).toBeNull();
        expect(await peekResetToken(undefined)).toBeNull();
        expect(await peekResetToken("")).toBeNull();
    });
});

describe("consumeResetToken", () => {
    test("returns the user id and marks the link consumed atomically", async () => {
        mockMaybeSingle.mockResolvedValue({
            data: { user_id: "user-1", expires_at: future() },
            error: null,
        });

        expect(await consumeResetToken("tok")).toBe("user-1");
        // The single-use guard: only update a link not already consumed.
        expect(chain.update).toHaveBeenCalledWith({ consumed_at: expect.any(String) });
        expect(chain.eq).toHaveBeenCalledWith("token_hash", sha256Hex("tok"));
        expect(chain.is).toHaveBeenCalledWith("consumed_at", null);
    });

    test("rejects a replayed or superseded link (conditional update matched no row)", async () => {
        mockMaybeSingle.mockResolvedValue({ data: null, error: null });
        expect(await consumeResetToken("already-used")).toBeNull();
    });

    test("rejects an expired link", async () => {
        mockMaybeSingle.mockResolvedValue({
            data: { user_id: "user-1", expires_at: past() },
            error: null,
        });
        expect(await consumeResetToken("stale")).toBeNull();
    });

    test("rejects a missing token without touching the database", async () => {
        expect(await consumeResetToken(null)).toBeNull();
        expect(chain.from).not.toHaveBeenCalled();
    });
});

describe("resetPath", () => {
    test("points at the reset page with the token URL-encoded", () => {
        expect(resetPath("a-b_c")).toBe("/reset-password?token=a-b_c");
        expect(resetPath("a+b/c")).toBe("/reset-password?token=a%2Bb%2Fc");
    });
});
