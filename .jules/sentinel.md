## 2024-03-11 - Bcrypt DoS via Unbounded Password Length
**Vulnerability:** The `/api/auth/register` and `/api/admin/users` endpoints accepted unbounded password lengths before hashing them with `bcrypt.hash(password, 12)`.
**Learning:** Bcrypt is computationally expensive by design, scaling with input length. Allowing unbounded password lengths allows attackers to send massive payloads (e.g., 10MB strings), causing CPU exhaustion and leading to an algorithmic Denial of Service (DoS) attack. Additionally, bcrypt typically truncates inputs after 72 bytes, so characters beyond that do not add security anyway.
**Prevention:** Always enforce a strict maximum length (e.g., 72 characters) on passwords before hashing them with bcrypt or similar algorithms.
