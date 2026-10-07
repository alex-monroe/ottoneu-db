import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabaseAdmin } from "@/lib/supabase";
import { setAuthCookie } from "@/lib/auth";
import { parseJson } from "@/lib/validate";
import { ResetPasswordSchema } from "@/lib/schemas/user";
import { consumeResetToken } from "@/lib/password-reset";
import { revokeRefreshTokensForUser } from "@/lib/oauth/codes";

/**
 * Set a new password from an admin-issued reset link, then sign the user in.
 *
 * Public (listed in PUBLIC_API_ROUTES): the token in the body is the
 * credential. The password is validated *before* the token is consumed, so a
 * too-short password doesn't burn the link.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, ResetPasswordSchema);
  if (!parsed.ok) return parsed.response;
  const { token, password } = parsed.data;

  const userId = await consumeResetToken(token);
  if (!userId) {
    return NextResponse.json(
      { error: "This reset link is invalid or has expired. Ask an admin for a new one." },
      { status: 400 },
    );
  }

  const password_hash = await bcrypt.hash(password, 12);
  const { data: user, error } = await getSupabaseAdmin()
    .from("users")
    .update({
      password_hash,
      password_reset_requested_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id, is_admin, has_projections_access, is_podcaster")
    .single();

  if (error || !user) {
    console.error("Password reset error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  // A reset is how someone takes their account back, so connected MCP clients
  // have to sign in again too.
  try {
    await revokeRefreshTokensForUser(user.id);
  } catch (e) {
    console.error("Failed to revoke OAuth tokens after password reset:", e);
  }

  await setAuthCookie(user.id, user.is_admin, user.has_projections_access, user.is_podcaster);
  return NextResponse.json({ success: true });
}
