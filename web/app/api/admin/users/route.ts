import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/auth";
import { parseJson } from "@/lib/validate";
import { CreateUserSchema } from "@/lib/schemas/user";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .select("id, email, is_admin, has_projections_access, created_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = await parseJson(req, CreateUserSchema);
  if (!parsed.ok) return parsed.response;
  const { email, password, has_projections_access } = parsed.data;

  const password_hash = await bcrypt.hash(password, 12);

  const { data, error } = await getSupabaseAdmin()
    .from("users")
    .insert({
      email,
      password_hash,
      has_projections_access: has_projections_access ?? false,
    })
    .select("id, email, is_admin, has_projections_access, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
