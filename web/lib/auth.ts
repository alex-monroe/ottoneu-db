import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const AUTH_COOKIE_NAME = "ottoneu_auth";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Validate password against environment variable
 */
export function validatePassword(password: string): boolean {
  const correctPassword = process.env.ACCESS_PASSWORD;
  if (!correctPassword) {
    console.error("ACCESS_PASSWORD environment variable not set");
    return false;
  }

  const passwordHash = createHash("sha256").update(password).digest();
  const correctHash = createHash("sha256").update(correctPassword).digest();

  return timingSafeEqual(passwordHash, correctHash);
}

/**
 * Set authentication cookie (7-day expiration, HTTP-only, secure)
 */
export async function setAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, "authenticated", {
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
 * Check if user is authenticated (has valid cookie)
 */
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE_NAME);
  return authCookie?.value === "authenticated";
}
