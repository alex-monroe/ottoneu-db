## 2025-05-18 - [Fix open redirect bypass in login]
**Vulnerability:** Open redirect via whitespace or control characters in `isValidRedirect`.
**Learning:** `startsWith("/")` checks alone are insufficient to prevent open redirects because URLs starting with `/\` or `//` or a leading whitespace/control character before the `/` could bypass the check.
**Prevention:** Always validate against leading whitespaces or control characters before doing path validation.