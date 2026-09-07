import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { signSession, verifySession, type SessionInfo } from "./session";
import { getSupabaseAdmin } from "./supabase";
import { ACCESS_PATH, LOGIN_PATH } from "./access";

const AUTH_COOKIE_NAME = "ottoneu_auth";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export interface AuthenticatedUser {
  userId: string;
  isAdmin: boolean;
  hasProjectionsAccess: boolean;
}

/**
 * Authenticate user by email and password against the database
 */
export async function authenticateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
  const { data: user, error } = await getSupabaseAdmin()
    .from("users")
    .select("id, password_hash, is_admin, has_projections_access")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (error || !user) {
    return null;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return null;
  }

  return {
    userId: user.id,
    isAdmin: user.is_admin,
    hasProjectionsAccess: user.has_projections_access,
  };
}

/**
 * Set authentication cookie with user info (7-day expiration, HTTP-only, secure)
 */
export async function setAuthCookie(userId: string, isAdmin: boolean, hasProjectionsAccess: boolean): Promise<void> {
  const cookieStore = await cookies();
  const token = await signSession(userId, isAdmin, hasProjectionsAccess);
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

/**
 * Clear authentication cookie
 */
export async function clearAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

/**
 * Get authenticated user info from session cookie (no DB call)
 */
export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME);
  const session: SessionInfo = await verifySession(authCookie?.value);

  if (!session.valid || !session.userId) {
    return null;
  }

  return {
    userId: session.userId,
    isAdmin: session.isAdmin ?? false,
    hasProjectionsAccess: session.hasProjectionsAccess ?? false,
  };
}

/**
 * Check if user is authenticated (has valid cookie)
 */
export async function isAuthenticated(): Promise<boolean> {
  const user = await getAuthenticatedUser();
  return user !== null;
}

/**
 * Server-component guard for a page that requires projections access.
 *
 * `web/middleware.ts` already gates every route in `PROJECTIONS_ROUTES`, so in
 * practice this rarely fires; it exists so a page can state its own requirement
 * in code rather than hand-rolling a check that drifts from the route list, and
 * so a route accidentally dropped from that list still fails closed.
 *
 * Sends a signed-in user without access to /access rather than /login — see the
 * loop documented in `lib/access.ts`.
 *
 * @param from Path to return the user to once access is granted.
 */
export async function requireProjectionsAccess(from?: string): Promise<AuthenticatedUser> {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect(from ? `${LOGIN_PATH}?redirect=${encodeURIComponent(from)}` : LOGIN_PATH);
  }
  if (!user.hasProjectionsAccess) {
    redirect(from ? `${ACCESS_PATH}?from=${encodeURIComponent(from)}` : ACCESS_PATH);
  }
  return user;
}

/**
 * Live access state for the signed-in user, read from the database rather than
 * the session cookie.
 *
 * The cookie is a 7-day snapshot, so a user granted access an hour ago still
 * carries `hasProjectionsAccess: false` in it. The /access page has to tell
 * someone the truth about their own account, so it reads through.
 */
export interface LiveAccessState {
  userId: string;
  email: string;
  hasProjectionsAccess: boolean;
  isAdmin: boolean;
  accessRequestedAt: string | null;
  /** Ottoneu team bound to this account; null = unbound. */
  teamName: string | null;
}

export async function getLiveAccessState(): Promise<LiveAccessState | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const { data } = await getSupabaseAdmin()
    .from("users")
    .select("id, email, is_admin, has_projections_access, access_requested_at, team_name")
    .eq("id", user.userId)
    .single();

  if (!data) return null;
  return {
    userId: data.id,
    email: data.email,
    hasProjectionsAccess: data.has_projections_access,
    isAdmin: data.is_admin,
    accessRequestedAt: data.access_requested_at ?? null,
    teamName: data.team_name ?? null,
  };
}
