import {
    CreatePlanSchema,
    DuplicatePlanSchema,
    UpdatePlanSchema,
} from "@/lib/schemas/arbitration-plan";

describe("CreatePlanSchema", () => {
    test("accepts a valid payload", () => {
        const result = CreatePlanSchema.safeParse({ name: "My Plan", notes: "scratch" });
        expect(result.success).toBe(true);
    });

    test("trims the name", () => {
        const result = CreatePlanSchema.parse({ name: "  Padded  " });
        expect(result.name).toBe("Padded");
    });

    test("rejects empty / whitespace-only names", () => {
        expect(CreatePlanSchema.safeParse({ name: "" }).success).toBe(false);
        expect(CreatePlanSchema.safeParse({ name: "   " }).success).toBe(false);
    });

    test("rejects name longer than 100 chars", () => {
        const result = CreatePlanSchema.safeParse({ name: "a".repeat(101) });
        expect(result.success).toBe(false);
    });

    test("rejects notes longer than 2000 chars", () => {
        const result = CreatePlanSchema.safeParse({
            name: "Plan",
            notes: "x".repeat(2001),
        });
        expect(result.success).toBe(false);
    });

    test("notes can be null", () => {
        const result = CreatePlanSchema.safeParse({ name: "Plan", notes: null });
        expect(result.success).toBe(true);
    });
});

describe("UpdatePlanSchema", () => {
    test("accepts a valid full payload", () => {
        const result = UpdatePlanSchema.safeParse({
            name: "Renamed",
            notes: "updated",
            allocations: { abc: 5, def: 0 },
        });
        expect(result.success).toBe(true);
    });

    test("accepts an empty payload (everything optional)", () => {
        expect(UpdatePlanSchema.safeParse({}).success).toBe(true);
    });

    test("rejects negative allocation amounts", () => {
        const result = UpdatePlanSchema.safeParse({ allocations: { abc: -1 } });
        expect(result.success).toBe(false);
    });

    test("rejects non-integer allocation amounts", () => {
        const result = UpdatePlanSchema.safeParse({ allocations: { abc: 1.5 } });
        expect(result.success).toBe(false);
    });

    test("rejects empty player_id keys", () => {
        const result = UpdatePlanSchema.safeParse({ allocations: { "": 1 } });
        expect(result.success).toBe(false);
    });
});

describe("DuplicatePlanSchema", () => {
    test("requires a non-empty name", () => {
        expect(DuplicatePlanSchema.safeParse({ name: "Copy" }).success).toBe(true);
        expect(DuplicatePlanSchema.safeParse({ name: "" }).success).toBe(false);
    });
});
