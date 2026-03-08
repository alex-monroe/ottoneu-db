import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  const { data: plan, error: planError } = await supabase
    .from("arbitration_plans")
    .select("id, name, notes, user_id, created_at, updated_at")
    .eq("id", id)
    .single();

  if (planError) return NextResponse.json({ error: planError.message }, { status: 404 });
  if (plan.user_id !== user.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: allocs, error: allocError } = await supabase
    .from("arbitration_plan_allocations")
    .select("player_id, amount")
    .eq("plan_id", id);

  if (allocError) return NextResponse.json({ error: allocError.message }, { status: 500 });

  const allocations: Record<string, number> = {};
  for (const a of allocs ?? []) {
    allocations[a.player_id] = a.amount;
  }

  const { user_id: _, ...planWithoutUserId } = plan;
  return NextResponse.json({ ...planWithoutUserId, allocations });
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  // Verify ownership
  const { data: plan, error: fetchError } = await supabase
    .from("arbitration_plans")
    .select("user_id")
    .eq("id", id)
    .single();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 404 });
  if (plan.user_id !== user.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, notes, allocations } = await req.json();

  // Update plan metadata
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = name;
  if (notes !== undefined) updates.notes = notes;

  const { error: planError } = await supabase
    .from("arbitration_plans")
    .update(updates)
    .eq("id", id);

  if (planError) {
    if (planError.code === "23505") {
      return NextResponse.json({ error: "A plan with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: planError.message }, { status: 500 });
  }

  // Upsert allocations if provided
  if (allocations && typeof allocations === "object") {
    const { error: delError } = await supabase
      .from("arbitration_plan_allocations")
      .delete()
      .eq("plan_id", id);

    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });

    const rows = Object.entries(allocations as Record<string, number>)
      .filter(([, amount]) => amount > 0)
      .map(([player_id, amount]) => ({
        plan_id: id,
        player_id,
        amount,
      }));

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from("arbitration_plan_allocations")
        .insert(rows);

      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await context.params;

  // Verify ownership
  const { data: plan, error: fetchError } = await supabase
    .from("arbitration_plans")
    .select("user_id")
    .eq("id", id)
    .single();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 404 });
  if (plan.user_id !== user.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase
    .from("arbitration_plans")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
