/**
 * @jest-environment node
 *
 * Unit tests for lib/oauth/clients.ts — redirect URI rules, DCR request
 * validation, and client authentication.
 */
import { createHash } from "node:crypto";

jest.mock("@/lib/supabase", () => ({
    supabase: {},
    getSupabaseAdmin: jest.fn(),
}));

import {
    isValidRedirectUri,
    redirectUriAllowed,
    parseRegistrationRequest,
    verifyClientSecret,
    type OAuthClient,
} from "@/lib/oauth/clients";

function makeClient(overrides: Partial<OAuthClient> = {}): OAuthClient {
    return {
        clientId: "mcp_abc",
        clientName: "Test Client",
        clientSecretHash: null,
        redirectUris: ["https://example.com/callback"],
        grantTypes: ["authorization_code", "refresh_token"],
        scope: "league:read",
        ...overrides,
    };
}

describe("isValidRedirectUri", () => {
    test("accepts https URIs", () => {
        expect(isValidRedirectUri("https://example.com/callback")).toBe(true);
        expect(isValidRedirectUri("https://gemini.google.com/oauth/cb?x=1")).toBe(true);
    });

    test("accepts http only on loopback (for local clients and the inspector)", () => {
        expect(isValidRedirectUri("http://localhost:6274/oauth/callback")).toBe(true);
        expect(isValidRedirectUri("http://127.0.0.1:8080/cb")).toBe(true);
        expect(isValidRedirectUri("http://example.com/callback")).toBe(false);
    });

    test("rejects fragments, relative paths, and non-http schemes", () => {
        expect(isValidRedirectUri("https://example.com/cb#frag")).toBe(false);
        expect(isValidRedirectUri("/callback")).toBe(false);
        expect(isValidRedirectUri("javascript:alert(1)")).toBe(false);
        expect(isValidRedirectUri("not a uri")).toBe(false);
    });
});

describe("redirectUriAllowed", () => {
    const client = makeClient({ redirectUris: ["https://example.com/callback"] });

    test("requires an exact match", () => {
        expect(redirectUriAllowed(client, "https://example.com/callback")).toBe(true);
        expect(redirectUriAllowed(client, "https://example.com/callback/")).toBe(false);
        expect(redirectUriAllowed(client, "https://example.com/callback?x=1")).toBe(false);
        expect(redirectUriAllowed(client, "https://evil.com/callback")).toBe(false);
    });

    test("does not allow a prefix or subdomain to sneak through", () => {
        expect(redirectUriAllowed(client, "https://example.com.evil.com/callback")).toBe(false);
        expect(redirectUriAllowed(client, "https://example.com/callback/../evil")).toBe(false);
    });
});

describe("parseRegistrationRequest", () => {
    test("accepts a minimal valid registration and defaults sensibly", () => {
        const parsed = parseRegistrationRequest({
            client_name: "Gemini Spark",
            redirect_uris: ["https://example.com/cb"],
        });
        expect(parsed).toEqual({
            clientName: "Gemini Spark",
            redirectUris: ["https://example.com/cb"],
            tokenEndpointAuthMethod: "client_secret_post",
            grantTypes: ["authorization_code", "refresh_token"],
        });
    });

    test("requires a non-empty redirect_uris array", () => {
        expect(parseRegistrationRequest({})).toMatchObject({ error: "invalid_redirect_uri" });
        expect(parseRegistrationRequest({ redirect_uris: [] })).toMatchObject({
            error: "invalid_redirect_uri",
        });
        expect(parseRegistrationRequest({ redirect_uris: "https://example.com/cb" })).toMatchObject({
            error: "invalid_redirect_uri",
        });
    });

    test("rejects an invalid redirect URI inside an otherwise valid array", () => {
        expect(
            parseRegistrationRequest({
                redirect_uris: ["https://example.com/cb", "http://evil.com/cb"],
            })
        ).toMatchObject({ error: "invalid_redirect_uri" });
    });

    test("rejects unsupported grant types and auth methods", () => {
        expect(
            parseRegistrationRequest({
                redirect_uris: ["https://example.com/cb"],
                grant_types: ["implicit"],
            })
        ).toMatchObject({ error: "invalid_client_metadata" });

        expect(
            parseRegistrationRequest({
                redirect_uris: ["https://example.com/cb"],
                token_endpoint_auth_method: "private_key_jwt",
            })
        ).toMatchObject({ error: "invalid_client_metadata" });
    });

    test("supports registering a public (PKCE-only) client", () => {
        expect(
            parseRegistrationRequest({
                redirect_uris: ["https://example.com/cb"],
                token_endpoint_auth_method: "none",
            })
        ).toMatchObject({ tokenEndpointAuthMethod: "none" });
    });

    test("rejects non-object bodies", () => {
        expect(parseRegistrationRequest(null)).toMatchObject({ error: "invalid_client_metadata" });
        expect(parseRegistrationRequest([])).toMatchObject({ error: "invalid_client_metadata" });
        expect(parseRegistrationRequest("string")).toMatchObject({
            error: "invalid_client_metadata",
        });
    });

    test("falls back to a placeholder name and truncates long ones", () => {
        expect(parseRegistrationRequest({ redirect_uris: ["https://e.com/c"] })).toMatchObject({
            clientName: "Unnamed MCP client",
        });
        const parsed = parseRegistrationRequest({
            redirect_uris: ["https://e.com/c"],
            client_name: "x".repeat(500),
        });
        expect((parsed as { clientName: string }).clientName).toHaveLength(200);
    });
});

describe("verifyClientSecret", () => {
    const secret = "super-secret-value";
    const hash = createHash("sha256").update(secret).digest("hex");

    test("accepts the correct secret for a confidential client", async () => {
        const client = makeClient({ clientSecretHash: hash });
        expect(await verifyClientSecret(client, secret)).toBe(true);
    });

    test("rejects a wrong or missing secret for a confidential client", async () => {
        const client = makeClient({ clientSecretHash: hash });
        expect(await verifyClientSecret(client, "wrong")).toBe(false);
        expect(await verifyClientSecret(client, undefined)).toBe(false);
        expect(await verifyClientSecret(client, "")).toBe(false);
    });

    test("public clients authenticate with no secret, and must not send one", async () => {
        const client = makeClient({ clientSecretHash: null });
        expect(await verifyClientSecret(client, undefined)).toBe(true);
        expect(await verifyClientSecret(client, "unexpected-secret")).toBe(false);
    });
});
