import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { signSession, verifySession, type SessionInfo } from "./session";
import { getSupabaseAdmin } from "./supabase";

const AUTH_COOKIE_NAME = "ottoneu_auth";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export interface AuthenticatedUser {
  userId: string;
  isAdmin: boolean;
  hasProjectionsAccess: boolean;
}

// Pre-computed dummy hash to equalize response times (prevents timing-based username enumeration)
// Generated via bcrypt.hashSync("dummy_password", 10)
const DUMMY_HASH = "$2a$10$tMh4zN5G4vP/Tqy.kZ6cyeQ5L8w11h03eB6f/0f3GjHjI39v9m/b2";

/**
 * Authenticate user by email and password against the database
 */
export async function authenticateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
  // Prevent DoS via bcrypt CPU exhaustion
  if (password.length > 72) {
    return null;
  }

  const { data: user, error } = await getSupabaseAdmin()
    .from("users")
    .select("id, password_hash, is_admin, has_projections_access")
    .eq("email", email.toLowerCase().trim())
    .single();

  if (error || !user) {
    // Perform dummy hash comparison to prevent timing attacks
    await bcrypt.compare(password, DUMMY_HASH);
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
