/**
 * Team icons — the pure half: URL shape, lookup key, and upload validation.
 *
 * Safe to import from client components (no database access); the reads and
 * writes live in `team-icons-data.ts`, the same split as `positional-rank.ts`
 * / `positional-rank-data.ts`.
 *
 * An icon is a small square raster image a manager sets for their team. The
 * browser crops and resizes it to {@link TEAM_ICON_SIZE}px before upload, so
 * the server only has to check it is what it says it is.
 */

import type { TeamIconVersions } from "./types";

/** Edge length, in pixels, the browser resizes an upload to. */
export const TEAM_ICON_SIZE = 128;

/** Decoded size cap. A 128×128 WebP/PNG is a few KB; this is generous. */
export const MAX_TEAM_ICON_BYTES = 64 * 1024;

export const TEAM_ICON_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type TeamIconType = (typeof TEAM_ICON_TYPES)[number];

/** Team names are display strings; compare them forgivingly (see `sameTeamName`). */
export function teamIconKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Public URL of a team's icon. `version` busts the immutable cache on change. */
export function teamIconSrc(name: string, version: number): string {
  return `/team-icons/${encodeURIComponent(name.trim())}?v=${version}`;
}

/** The icon URL for `name`, or null when the team has none. */
export function lookupTeamIcon(
  versions: TeamIconVersions | null | undefined,
  name: string | null | undefined,
): string | null {
  const label = name?.trim();
  if (!versions || !label || label === "FA") return null;
  const version = versions[teamIconKey(label)];
  return version == null ? null : teamIconSrc(label, version);
}

/** True when `bytes` start with the signature of `type`. */
function hasSignature(bytes: Uint8Array, type: TeamIconType): boolean {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  switch (type) {
    case "image/png":
      return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/jpeg":
      return starts([0xff, 0xd8, 0xff]);
    case "image/webp":
      // "RIFF" <size> "WEBP"
      return starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8);
  }
}

export type ParsedTeamIcon =
  | { ok: true; contentType: TeamIconType; base64: string; bytes: Uint8Array }
  | { ok: false; error: string };

/**
 * Validate an uploaded `data:` URL.
 *
 * Only PNG, JPEG and WebP are accepted — never SVG, which can carry script and
 * would be served from the site's own origin. The declared type must match the
 * file's magic bytes, so a renamed file cannot slip through as another type.
 */
export function parseTeamIconDataUrl(dataUrl: string): ParsedTeamIcon {
  const match = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl.trim());
  if (!match) return { ok: false, error: "The icon must be a PNG, JPEG or WebP image." };

  const contentType = match[1] as TeamIconType;
  if (!TEAM_ICON_TYPES.includes(contentType)) {
    return { ok: false, error: "The icon must be a PNG, JPEG or WebP image." };
  }

  const base64 = match[2];
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (bytes.length === 0) return { ok: false, error: "The image is empty." };
  if (bytes.length > MAX_TEAM_ICON_BYTES) {
    return {
      ok: false,
      error: `The image is too large (${Math.ceil(bytes.length / 1024)}KB; the limit is ${MAX_TEAM_ICON_BYTES / 1024}KB).`,
    };
  }
  if (!hasSignature(bytes, contentType)) {
    return { ok: false, error: "The file is not the image type it claims to be." };
  }
  return { ok: true, contentType, base64, bytes };
}
