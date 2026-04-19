import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { LEAGUE_ID } from "@/lib/arb-logic";
import { getAuthenticatedUser } from "@/lib/auth";
import { parseJson } from "@/lib/validate";
import { CreatePlanSchema } from "@/lib/schemas/arbitration-plan";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("arbitration_plans")
    .select("id, name, notes, created_at, updated_at")
    .eq("league_id", LEAGUE_ID)
    .eq("user_id", user.userId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJson(req, CreatePlanSchema);
  if (!parsed.ok) return parsed.response;
  const { name, notes } = parsed.data;

  const { data, error } = await getSupabaseAdmin()
    .from("arbitration_plans")
    .insert({ league_id: LEAGUE_ID, user_id: user.userId, name, notes: notes ?? null })
    .select("id, name, notes, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A plan with that name already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
