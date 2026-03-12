import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { LEAGUE_ID } from "@/lib/arb-logic";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await getSupabaseAdmin()
    .from("surplus_adjustments")
    .select("player_id, adjustment, notes")
    .eq("league_id", LEAGUE_ID)
    .eq("user_id", user.userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

interface AdjustmentRow {
  player_id: string;
  adjustment: number;
  notes?: string;
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: AdjustmentRow[] = await req.json();

  const rows = body.map((item) => ({
    player_id: item.player_id,
    league_id: LEAGUE_ID,
    user_id: user.userId,
    adjustment: item.adjustment,
    notes: item.notes ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await getSupabaseAdmin()
    .from("surplus_adjustments")
    .upsert(rows, { onConflict: "player_id,league_id,user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
