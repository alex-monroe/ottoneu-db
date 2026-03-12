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
