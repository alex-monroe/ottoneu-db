## 2024-05-30 - Next.js searchParams Runtime Crash Risk
**Vulnerability:** Calling string methods (`.startsWith()`) directly on `searchParams.get()` or `params` properties.
**Learning:** In Next.js Server Components, `searchParams` properties can evaluate to a string array if the parameter is provided multiple times in the URL (e.g., `?redirect=/a&redirect=/b`). Blindly calling string methods on an array causes a `TypeError`, resulting in a 500 Internal Server Error (Denial of Service).
**Prevention:** Always explicitly check the type of query parameters (`typeof url === 'string'`) before invoking string methods, even when mitigating other vulnerabilities like Open Redirects.
