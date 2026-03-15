## 2024-03-11 - Bcrypt DoS via Unbounded Password Length
**Vulnerability:** The `/api/auth/register` and `/api/admin/users` endpoints accepted unbounded password lengths before hashing them with `bcrypt.hash(password, 12)`.
**Learning:** Bcrypt is computationally expensive by design, scaling with input length. Allowing unbounded password lengths allows attackers to send massive payloads (e.g., 10MB strings), causing CPU exhaustion and leading to an algorithmic Denial of Service (DoS) attack. Additionally, bcrypt typically truncates inputs after 72 bytes, so characters beyond that do not add security anyway.
**Prevention:** Always enforce a strict maximum length (e.g., 72 characters) on passwords before hashing them with bcrypt or similar algorithms.

## 2024-03-20 - Timing Attack Username Enumeration in Authentication
**Vulnerability:** The `authenticateUser` function in `web/lib/auth.ts` returned early when a user was not found, resulting in a much faster response compared to checking a valid username that requires calculating a bcrypt hash.
**Learning:** By measuring the response time of authentication requests, attackers can determine if a username/email exists in the database. If the response is fast, the user does not exist. If it's slow (due to bcrypt processing), the user exists. This leads to user enumeration.
**Prevention:** Always ensure that authentication paths take roughly the same amount of time regardless of whether the user exists. Use a pre-computed dummy hash and perform a dummy `bcrypt.compare` operation when a user is not found to equalize processing time.
