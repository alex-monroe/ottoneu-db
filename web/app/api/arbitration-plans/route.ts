import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { LEAGUE_ID } from "@/lib/arb-logic";

// GET /api/arbitration-plans — list all plans with their allocations
export async function GET() {
  const { data: plans, error: plansError } = await supabase
    .from("arbitration_plans")
    .select("*")
    .eq("league_id", LEAGUE_ID)
    .order("updated_at", { ascending: false });

  if (plansError)
    return NextResponse.json({ error: plansError.message }, { status: 500 });

  if (!plans || plans.length === 0) return NextResponse.json([]);

  // Fetch all allocations for these plans
  const planIds = plans.map((p) => p.id);
  const { data: allocations, error: allocError } = await supabase
    .from("arbitration_plan_allocations")
    .select("plan_id, player_id, amount")
    .in("plan_id", planIds);

  if (allocError)
    return NextResponse.json({ error: allocError.message }, { status: 500 });

  // Group allocations by plan_id
  const allocsByPlan = new Map<string, Record<string, number>>();
  for (const a of allocations ?? []) {
    if (!allocsByPlan.has(a.plan_id)) allocsByPlan.set(a.plan_id, {});
    allocsByPlan.get(a.plan_id)![a.player_id] = a.amount;
  }

  const result = plans.map((p) => ({
    ...p,
    allocations: allocsByPlan.get(p.id) ?? {},
  }));

  return NextResponse.json(result);
}

// POST /api/arbitration-plans — create a new plan
export async function POST(req: NextRequest) {
  const { name } = await req.json();

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("arbitration_plans")
    .insert({ league_id: LEAGUE_ID, name: name.trim() })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "A plan with that name already exists" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ...data, allocations: {} });
}
