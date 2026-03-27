import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("id, email, is_admin, has_projections_access, created_at")
    .order("created_at", { ascending: true });

  if (error) { console.error(error); return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { email, password, has_projections_access } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  if (password.length > 72) {
    return NextResponse.json({ error: "Password must be at most 72 characters" }, { status: 400 });
  }

  const password_hash = await bcrypt.hash(password, 12);

  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .insert({
      email: email.toLowerCase().trim(),
      password_hash,
      has_projections_access: has_projections_access ?? false,
    })
    .select("id, email, is_admin, has_projections_access, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
