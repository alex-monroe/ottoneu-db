/**
 * @jest-environment node
 *
 * Unit tests for auth.ts. Uses the node environment for Web Crypto (session
 * signing runs through the real session module).
 */
import bcrypt from "bcryptjs";
import { signSession } from "@/lib/session";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCookieStore = {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
};

jest.mock("next/headers", () => ({
    cookies: jest.fn(async () => mockCookieStore),
}));

const mockSingle = jest.fn();
const supabaseAdminChain = {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: mockSingle,
};

jest.mock("@/lib/supabase", () => ({
    supabase: {},
    getSupabaseAdmin: jest.fn(() => supabaseAdminChain),
}));

// Import AFTER mocks are registered.
import { authenticateUser, getAuthenticatedUser } from "@/lib/auth";

const ORIGINAL_SECRET = process.env.SESSION_SECRET;

beforeAll(() => {
    process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
});

afterAll(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = ORIGINAL_SECRET;
});

beforeEach(() => {
    mockCookieStore.get.mockReset();
    mockCookieStore.set.mockReset();
    mockCookieStore.delete.mockReset();
    mockSingle.mockReset();
    supabaseAdminChain.from.mockClear();
    supabaseAdminChain.select.mockClear();
    supabaseAdminChain.eq.mockClear();
});

// ---------------------------------------------------------------------------
// authenticateUser
// ---------------------------------------------------------------------------

describe("authenticateUser", () => {
    test("returns user info when email + password match", async () => {
        const hash = await bcrypt.hash("correct-password", 4);
        mockSingle.mockResolvedValueOnce({
            data: {
                id: "user-1",
                password_hash: hash,
                is_admin: true,
                has_projections_access: false,
            },
            error: null,
        });

        const result = await authenticateUser("User@Example.com", "correct-password");
        expect(result).toEqual({
            userId: "user-1",
            isAdmin: true,
            hasProjectionsAccess: false,
        });
        // Email is lowercased + trimmed before the lookup.
        expect(supabaseAdminChain.eq).toHaveBeenCalledWith("email", "user@example.com");
    });

    test("returns null on wrong password", async () => {
        const hash = await bcrypt.hash("correct-password", 4);
        mockSingle.mockResolvedValueOnce({
            data: {
                id: "user-1",
                password_hash: hash,
                is_admin: false,
                has_projections_access: false,
            },
            error: null,
        });

        const result = await authenticateUser("user@example.com", "wrong-password");
        expect(result).toBeNull();
    });

    test("returns null when user not found", async () => {
        mockSingle.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
        const result = await authenticateUser("missing@example.com", "whatever");
        expect(result).toBeNull();
    });

    test("returns null on database error", async () => {
        mockSingle.mockResolvedValueOnce({ data: null, error: { message: "db fail" } });
        const result = await authenticateUser("user@example.com", "whatever");
        expect(result).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// getAuthenticatedUser
// ---------------------------------------------------------------------------

describe("getAuthenticatedUser", () => {
    test("returns user info for a valid cookie", async () => {
        const token = await signSession("user-42", true, true);
        mockCookieStore.get.mockReturnValueOnce({ value: token });

        const result = await getAuthenticatedUser();
        expect(result).toEqual({
            userId: "user-42",
            isAdmin: true,
            hasProjectionsAccess: true,
        });
    });

    test("returns null when cookie is missing", async () => {
        mockCookieStore.get.mockReturnValueOnce(undefined);
        expect(await getAuthenticatedUser()).toBeNull();
    });

    test("returns null for a malformed cookie value", async () => {
        mockCookieStore.get.mockReturnValueOnce({ value: "not-a-valid-token" });
        expect(await getAuthenticatedUser()).toBeNull();
    });

    test("returns null for a cookie signed with a different secret", async () => {
        const token = await signSession("user-42", false, false);
        process.env.SESSION_SECRET = "different-secret";
        mockCookieStore.get.mockReturnValueOnce({ value: token });

        const result = await getAuthenticatedUser();
        expect(result).toBeNull();

        process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
    });

    test("returns null for an expired cookie", async () => {
        const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;
        jest.spyOn(Date, "now").mockReturnValueOnce(Date.now() - EIGHT_DAYS_MS);
        const expired = await signSession("user-42", false, false);
        mockCookieStore.get.mockReturnValueOnce({ value: expired });

        expect(await getAuthenticatedUser()).toBeNull();
    });

    test("defaults isAdmin/hasProjectionsAccess to false when session flags are absent", async () => {
        const token = await signSession("user-42", false, false);
        mockCookieStore.get.mockReturnValueOnce({ value: token });

        const result = await getAuthenticatedUser();
        expect(result).toEqual({
            userId: "user-42",
            isAdmin: false,
            hasProjectionsAccess: false,
        });
    });
});
