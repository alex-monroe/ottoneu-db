## 2024-03-20 - [Fix Open Redirect Bypass in `isValidRedirect`]
**Vulnerability:** Open redirect bypass via control characters in `isValidRedirect`.
**Learning:** Simple `startsWith("/")` checks are insufficient for open redirects. Browsers strip out certain control characters (like `\n`, `\t`, `\r`) when parsing URLs. This allows an attacker to split the `//` sequence (e.g., `/\n/evil.com`) to bypass explicit `url.startsWith("//")` checks, which the browser then executes as a protocol-relative absolute URL `//evil.com`.
**Prevention:** Explicitly reject control characters (`[\x00-\x1F\x7F]`) when validating relative URLs.
