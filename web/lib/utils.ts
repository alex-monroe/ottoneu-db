export function isValidRedirect(url: unknown): boolean {
  if (typeof url !== "string") return false;
  // Only allow relative paths starting with a single slash
  // Prevent // and /\ bypasses
  return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\");
}
