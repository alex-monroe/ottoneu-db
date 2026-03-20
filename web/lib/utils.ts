export function isValidRedirect(url: unknown): boolean {
  if (typeof url !== "string") return false;

  // Reject any control characters (like \n, \t, \r) that could be used to bypass validation
  // These characters are stripped by browsers, allowing a payload like `/\n/evil.com`
  // to bypass the // check below but still be executed as `//evil.com` by the browser.
  if (/[\x00-\x1F\x7F]/.test(url)) return false;

  // Only allow relative paths starting with a single slash
  // Prevent // and /\ bypasses
  return url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\");
}
