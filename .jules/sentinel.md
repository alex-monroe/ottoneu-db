## 2024-05-15 - [Security Headers]
**Vulnerability:** Missing global HTTP security headers (CSP, HSTS, X-Frame-Options) in the Next.js application.
**Learning:** The application was vulnerable to clickjacking and cross-site scripting due to the absence of defensive headers.
**Prevention:** Enforce strict security headers centrally in the Next.js middleware for all routes.
