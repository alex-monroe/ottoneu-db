import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { parseJson } from "@/lib/validate";
import { ForgotPasswordSchema } from "@/lib/schemas/user";

/**
 * Ask an admin for a password reset link.
 *
 * There is no mail infrastructure, so this does not send anything: it stamps
 * `password_reset_requested_at`, which puts the account at the top of /admin
 * with a "Reset requested" badge. The admin issues the link from there and
 * hands it over themselves.
 *
 * Public (listed in PUBLIC_API_ROUTES) — the caller is by definition signed
 * out. The response is the same whether or not the email has an account, so
 * this endpoint cannot be used to probe who is registered.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseJson(req, ForgotPasswordSchema);
  if (!parsed.ok) return parsed.response;

  // Only stamp the first request, so re-submitting doesn't move the account to
  // the back of an admin's queue. Errors are logged, not returned: a failure
  // must look the same as "no such account".
  const { error } = await getSupabaseAdmin()
    .from("users")
    .update({ password_reset_requested_at: new Date().toISOString() })
    .eq("email", parsed.data.email)
    .is("password_reset_requested_at", null);
  if (error) console.error("Forgot-password request error:", error);

  return NextResponse.json({ success: true });
}
