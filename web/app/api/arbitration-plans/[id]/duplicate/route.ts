import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { LEAGUE_ID } from "@/lib/arb-logic";
import { getAuthenticatedUser } from "@/lib/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;
  const { name } = await req.json();

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Verify ownership of source plan
  const { data: sourcePlan, error: fetchError } = await supabase
    .from("arbitration_plans")
    .select("user_id")
    .eq("id", id)
    .single();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 404 });
  if (sourcePlan.user_id !== user.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Create new plan
  const { data: newPlan, error: planError } = await supabase
    .from("arbitration_plans")
    .insert({ league_id: LEAGUE_ID, user_id: user.userId, name: name.trim() })
    .select("id, name, notes, created_at, updated_at")
    .single();

  if (planError) {
    if (planError.code === "23505") {
      return NextResponse.json({ error: "A plan with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: planError.message }, { status: 500 });
  }

  // Copy allocations from source plan
  const { data: sourceAllocs, error: allocError } = await supabase
    .from("arbitration_plan_allocations")
    .select("player_id, amount")
    .eq("plan_id", id);

  if (allocError) return NextResponse.json({ error: allocError.message }, { status: 500 });

  if (sourceAllocs && sourceAllocs.length > 0) {
    const rows = sourceAllocs.map((a) => ({
      plan_id: newPlan.id,
      player_id: a.player_id,
      amount: a.amount,
    }));

    const { error: insertError } = await supabase
      .from("arbitration_plan_allocations")
      .insert(rows);

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(newPlan, { status: 201 });
}
