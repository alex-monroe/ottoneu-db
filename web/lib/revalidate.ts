import { timingSafeEqualStrings } from "@/lib/oauth/crypto";

/**
 * On-demand revalidation for `/api/revalidate`, called by the GitHub Actions
 * data workflows right after they write to Supabase. Without it a fresh scrape
 * only reaches the site when each page's time-based `revalidate` window lapses
 * (up to an hour); with it the next request after a scrape renders new data.
 */

/** Hard cap on scoped paths per call, so a bad caller cannot fan out. */
export const MAX_PATHS = 20;

/**
 * True when the request's `Authorization: Bearer <token>` matches
 * `REVALIDATE_SECRET`. An unset secret rejects everything: the endpoint is off
 * until the operator configures it, never open.
 */
export function isAuthorizedRevalidation(
  authorization: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  const match = authorization?.match(/^Bearer (.+)$/);
  return match != null && timingSafeEqualStrings(match[1], secret);
}

/**
 * The paths to revalidate. No `paths` (or an empty list) means the whole site:
 * the root layout reads tables every scraper touches (positional ranks, team
 * icons), so scoping is opt-in. Returns null for a malformed body.
 */
export function parseRevalidationPaths(body: unknown): string[] | "all" | null {
  if (body == null) return "all";
  if (typeof body !== "object" || Array.isArray(body)) return null;
  const paths = (body as { paths?: unknown }).paths;
  if (paths === undefined) return "all";
  if (!Array.isArray(paths) || paths.length > MAX_PATHS) return null;
  if (paths.length === 0) return "all";
  const valid = paths.every(
    (p) => typeof p === "string" && p.startsWith("/") && !p.startsWith("//") && p.length <= 200,
  );
  return valid ? (paths as string[]) : null;
}
