export function isValidRedirect(url: unknown): boolean {
  if (typeof url !== "string") return false;
  // Reject bypasses via whitespace or control characters
  if (/[\s\x00-\x1F\x7F]/.test(url)) return false;
  // Only allow relative paths starting with a single slash
  // Prevent // and /\ bypasses
  return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\");
}
