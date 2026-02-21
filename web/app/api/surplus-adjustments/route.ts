import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { LEAGUE_ID } from "@/lib/arb-logic";

export async function GET() {
  const { data, error } = await supabase
    .from("surplus_adjustments")
    .select("player_id, adjustment, notes")
    .eq("league_id", LEAGUE_ID);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

interface AdjustmentRow {
  player_id: string;
  adjustment: number;
  notes?: string;
}

export async function POST(req: NextRequest) {
  const body: AdjustmentRow[] = await req.json();

  const rows = body.map((item) => ({
    player_id: item.player_id,
    league_id: LEAGUE_ID,
    adjustment: item.adjustment,
    notes: item.notes ?? null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("surplus_adjustments")
    .upsert(rows, { onConflict: "player_id,league_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
