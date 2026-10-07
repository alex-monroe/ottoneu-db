import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAuthenticatedUser } from "@/lib/auth";
import { createResetToken, resetPath, RESET_TOKEN_TTL_SECONDS } from "@/lib/password-reset";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Issue a password reset link for an account.
 *
 * Works whether or not the user asked for one on /forgot-password — an admin
 * who hears "I can't log in" over text can skip the request step. Returns the
 * path (not a full URL): the admin panel prefixes its own origin, so the link
 * always points at the deployment the admin is looking at.
 */
export async function POST(_req: NextRequest, context: RouteContext) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await context.params;

  const { data: target } = await getSupabaseAdmin()
    .from("users")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  try {
    const token = await createResetToken(id, user.userId);
    return NextResponse.json({
      path: resetPath(token),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_SECONDS * 1000).toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
