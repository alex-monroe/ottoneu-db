import {
    SurplusAdjustmentSchema,
    SurplusAdjustmentsArraySchema,
} from "@/lib/schemas/surplus-adjustment";

describe("SurplusAdjustmentSchema", () => {
    test("accepts a valid row", () => {
        const result = SurplusAdjustmentSchema.safeParse({
            player_id: "p-123",
            adjustment: -2.5,
        });
        expect(result.success).toBe(true);
    });

    test("rejects NaN adjustment", () => {
        const result = SurplusAdjustmentSchema.safeParse({
            player_id: "p-123",
            adjustment: Number.NaN,
        });
        expect(result.success).toBe(false);
    });

    test("rejects Infinity adjustment", () => {
        const result = SurplusAdjustmentSchema.safeParse({
            player_id: "p-123",
            adjustment: Number.POSITIVE_INFINITY,
        });
        expect(result.success).toBe(false);
    });

    test("rejects empty player_id", () => {
        const result = SurplusAdjustmentSchema.safeParse({
            player_id: "",
            adjustment: 1,
        });
        expect(result.success).toBe(false);
    });
});

describe("SurplusAdjustmentsArraySchema", () => {
    test("accepts an empty array", () => {
        expect(SurplusAdjustmentsArraySchema.safeParse([]).success).toBe(true);
    });

    test("accepts a list of valid rows", () => {
        const result = SurplusAdjustmentsArraySchema.safeParse([
            { player_id: "a", adjustment: 1 },
            { player_id: "b", adjustment: -1, notes: "ok" },
        ]);
        expect(result.success).toBe(true);
    });

    test("rejects when any row is invalid", () => {
        const result = SurplusAdjustmentsArraySchema.safeParse([
            { player_id: "a", adjustment: 1 },
            { player_id: "b", adjustment: "nope" },
        ]);
        expect(result.success).toBe(false);
    });
});
