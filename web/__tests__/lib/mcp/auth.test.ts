/**
 * Unit tests for lib/mcp/auth.ts — MCP bearer-key verification.
 */
import { isValidKey, verifyBearer } from "@/lib/mcp/auth";

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

    afterEach(() => {
        if (originalKey === undefined) delete process.env.MCP_API_KEY;
        else process.env.MCP_API_KEY = originalKey;
    });

    test("returns AuthInfo for the correct key", () => {
        process.env.MCP_API_KEY = "league-key";
        const auth = verifyBearer(req, "league-key");
        expect(auth).toEqual({
            token: "league-key",
            clientId: "league-shared-key",
            scopes: ["read"],
        });
    });

    test("returns undefined for a wrong key", () => {
        process.env.MCP_API_KEY = "league-key";
        expect(verifyBearer(req, "not-the-key")).toBeUndefined();
    });

    test("returns undefined for a missing token", () => {
        process.env.MCP_API_KEY = "league-key";
        expect(verifyBearer(req, undefined)).toBeUndefined();
    });

    test("fails closed when MCP_API_KEY is unset", () => {
        delete process.env.MCP_API_KEY;
        expect(verifyBearer(req, "anything")).toBeUndefined();
    });
});
