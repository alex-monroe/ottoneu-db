## 2024-05-02 - Missing Input Length Boundaries
**Vulnerability:** Several API routes handling user text input (such as `name` and `notes` fields in arbitration plans and surplus adjustments) lacked maximum length boundaries.
**Learning:** Without explicit string length limits, attackers can send extremely large payloads leading to database query timeouts, excessive memory usage, and potential Denial of Service (DoS) attacks.
**Prevention:** Always enforce strict upper boundaries (e.g., `maxLength` limits) on all user-supplied string inputs before further processing or database insertion.
