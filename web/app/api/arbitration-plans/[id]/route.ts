import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface Params {
  params: Promise<{ id: string }>;
}

// PUT /api/arbitration-plans/[id] — update plan allocations
export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const { allocations, name } = await req.json();

  // Optionally update the plan name
  if (name !== undefined) {
    const { error: nameError } = await supabase
      .from("arbitration_plans")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (nameError) {
      if (nameError.code === "23505") {
        return NextResponse.json(
          { error: "A plan with that name already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: nameError.message },
        { status: 500 }
      );
    }
  }

  // Update allocations if provided
  if (allocations !== undefined) {
    // Delete existing allocations
    const { error: deleteError } = await supabase
      .from("arbitration_plan_allocations")
      .delete()
      .eq("plan_id", id);

    if (deleteError)
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );

    // Insert new allocations (only non-zero ones)
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

      if (insertError)
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
    }

    // Update the plan's updated_at timestamp
    await supabase
      .from("arbitration_plans")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/arbitration-plans/[id] — delete a plan
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const { error } = await supabase
    .from("arbitration_plans")
    .delete()
    .eq("id", id);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
