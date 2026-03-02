import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { LEAGUE_ID } from "@/lib/arb-logic";

export async function GET() {
  const { data, error } = await supabase
    .from("arbitration_plans")
    .select("id, name, notes, created_at, updated_at")
    .eq("league_id", LEAGUE_ID)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const { name, notes } = await req.json();

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("arbitration_plans")
    .insert({ league_id: LEAGUE_ID, name: name.trim(), notes: notes ?? null })
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
