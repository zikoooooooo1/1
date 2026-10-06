# Security

## Authentication

- No production seed accounts or default credentials.
- Initial administrator is created with an interactive console command.
- New passwords set through application workflows require 12–128 characters and use Node `scrypt`, unique 16-byte random salts, and a 64-byte derived key. Comparisons are timing-safe.
- Login failures are limited per source/account and per source IP in a 15-minute window, persisted in the database. A generic response avoids account enumeration. A dummy hash verification covers unknown accounts.
- Sessions use 256-bit random tokens; only SHA-256 digests are stored. Sessions expire after eight hours. Cookies are HttpOnly, SameSite=Strict, and Secure in production.
- Initial/imported/replacement passwords must be changed on first use. Account archive and administrator password reset revoke all sessions. Personal password changes revoke other sessions.
- Administrator password reset requires the acting administrator's password, explicit UI confirmation, and an audit event. No reset password is echoed in API responses.

## Authorization and request safety

API authentication precedes all protected routers. Active role is always database-derived. Every write needs a session-bound CSRF header; provided Origin headers must match the configured public origin. HTTPS is required in production configuration. No CORS wildcard is enabled.

Class assignments, enrollments, publication status, ownership, attempt timing, and result release govern data access. Search and export use appropriate scope. SQLite constraints, parameterized values, and Zod schemas defend relationships and input. Catalog table/column identifiers are application-controlled. HTTP 409 protects optimistic updates from silent overwrite.

## Content and files

React text rendering escapes stored text; user HTML is not rendered. Helmet supplies CSP and other security headers. CSP disallows framing and objects. Private responses are `no-store`. Uploaded files are stored outside the static root, under random storage IDs.

Uploads are limited to 10 MB, one file/request, with a 200 MB per-user quota. Accepted content is PDF, PNG, JPEG, WebP, and plain text; image/PDF signatures are checked. File downloads use attachment disposition, `nosniff`, and a sandbox CSP. Authorization is checked on every download. External links accept only HTTP(S), with safe new-tab relationship attributes.

File signature checks are not a malware scanner. Schools needing scanning must add an approved scanning pipeline before general uploads, without making private storage publicly accessible. PDFs and documents should be handled by up-to-date client software.

## Assessment integrity

Server times control availability and duration. Question/option randomization is persisted per attempt. Active attempts are unique. Answer updates reject stale versions and closed windows. Submission is idempotent; manual grading is bounded by question points. Correct answers are excluded from active student question payloads. Results are hidden until released.

This is not browser lockdown or an absolute anti-cheating system. It makes no claims about preventing screenshots, separate devices, or collusion.

## Operations

Use TLS, an exact `APP_ORIGIN`, a private local database/files directory, and a process user with limited filesystem access. `TRUST_PROXY=1` trusts loopback proxies only. Do not expose the Node port directly when proxy trust is enabled. Keep secrets out of arguments/logs, and protect encrypted backups outside the web root.

Logs include request IDs and coarse error codes, not raw request bodies or SQL traces. Audit records contain minimal metadata. Student data is retained by archive rather than removed automatically. Establish a school-specific retention and access policy before importing real data.

## Review and tests

The integration suite checks anonymous routes, CSRF/origin checks, role escalation, unrelated teacher/student IDs, private resources, question banks, unpublished content, unpublished results, duplicate import/submission, and stale updates. Browser and code-review results are recorded by the implementation task; these checks are not a substitute for a school's independent security assessment or operational monitoring.

## School Microsoft identity

Approved Microsoft student sign-in uses tenant-restricted OIDC with PKCE, state, browser binding, nonce and verified RS256 ID tokens. The `acct=0` optional claim is required to exclude guests. An administrator must create the identity first; verified `tid` + `oid` selects that existing student. No automatic signup is allowed. Local student accounts may also be created by an administrator. Email is only profile data, never an account-linking authority. Microsoft accounts cannot receive local passwords. Admin/teacher roles come only from CLASO administration. See [Microsoft setup](docs/MICROSOFT_SETUP.md) for school group restrictions and session revocation limits.
