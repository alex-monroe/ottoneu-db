## 2024-03-26 - Internal server errors leaking database error messages
**Vulnerability:** Several API routes in `web/app/api` were returning raw database error messages (`error.message`) in HTTP 500 and 404 responses.
**Learning:** This exposes sensitive database structure and query details to potentially malicious users, facilitating targeted attacks (e.g. SQL injection or internal reconnaissance).
**Prevention:** Catch errors gracefully and map them to generic strings like "Internal server error" or "Not found", ensuring internal infrastructure details are not leaked in HTTP response bodies.
