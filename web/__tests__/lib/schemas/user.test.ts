import { CreateUserSchema, ForgotPasswordSchema, ResetPasswordSchema, UpdateUserSchema } from "@/lib/schemas/user";

describe("CreateUserSchema", () => {
    test("accepts a valid payload", () => {
        const result = CreateUserSchema.safeParse({
            email: "user@example.com",
            password: "secret123",
            has_projections_access: true,
        });
        expect(result.success).toBe(true);
    });

    test("normalizes email (trim + lowercase)", () => {
        const result = CreateUserSchema.parse({
            email: "  USER@Example.COM ",
            password: "secret123",
        });
        expect(result.email).toBe("user@example.com");
    });

    test("rejects passwords shorter than 6 characters", () => {
        const result = CreateUserSchema.safeParse({
            email: "u@example.com",
            password: "short",
        });
        expect(result.success).toBe(false);
    });

    test("rejects passwords longer than 72 characters (bcrypt limit)", () => {
        const result = CreateUserSchema.safeParse({
            email: "u@example.com",
            password: "a".repeat(73),
        });
        expect(result.success).toBe(false);
    });

    test("rejects invalid email", () => {
        const result = CreateUserSchema.safeParse({
            email: "not-an-email",
            password: "secret123",
        });
        expect(result.success).toBe(false);
    });

    test("rejects missing required fields", () => {
        const result = CreateUserSchema.safeParse({ email: "u@example.com" });
        expect(result.success).toBe(false);
    });

    test("has_projections_access is optional", () => {
        const result = CreateUserSchema.safeParse({
            email: "u@example.com",
            password: "secret123",
        });
        expect(result.success).toBe(true);
    });
});

describe("UpdateUserSchema", () => {
    test("accepts has_projections_access", () => {
        const result = UpdateUserSchema.safeParse({ has_projections_access: false });
        expect(result.success).toBe(true);
    });

    test("accepts empty object", () => {
        const result = UpdateUserSchema.safeParse({});
        expect(result.success).toBe(true);
    });

    test("rejects non-boolean has_projections_access", () => {
        const result = UpdateUserSchema.safeParse({ has_projections_access: "yes" });
        expect(result.success).toBe(false);
    });
});

describe("ForgotPasswordSchema", () => {
    test("normalises the email so it matches the stored lowercase address", () => {
        const r = ForgotPasswordSchema.safeParse({ email: "  Alex@Example.COM " });
        expect(r.success && r.data.email).toBe("alex@example.com");
    });

    test("rejects a non-email", () => {
        expect(ForgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
    });
});

describe("ResetPasswordSchema", () => {
    const ok = { token: "tok", password: "secret1", confirmPassword: "secret1" };

    test("accepts a matching password within bcrypt's limits", () => {
        expect(ResetPasswordSchema.safeParse(ok).success).toBe(true);
    });

    test("rejects mismatched confirmation", () => {
        const r = ResetPasswordSchema.safeParse({ ...ok, confirmPassword: "secret2" });
        expect(r.success).toBe(false);
        expect(!r.success && r.error.issues[0].message).toBe("Passwords do not match");
    });

    test.each([
        ["too short", "12345"],
        ["over bcrypt's 72-byte limit", "x".repeat(73)],
    ])("rejects a password that is %s", (_label, password) => {
        expect(
            ResetPasswordSchema.safeParse({ ...ok, password, confirmPassword: password }).success,
        ).toBe(false);
    });

    test("requires a token", () => {
        expect(ResetPasswordSchema.safeParse({ ...ok, token: "" }).success).toBe(false);
    });
});
