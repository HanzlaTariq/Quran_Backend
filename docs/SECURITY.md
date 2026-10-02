> For this two-repository patch, read ../UPDATE_GUIDE.md first. Sibling frontend/paths in this historical note refer to the other repository.

# Security implementation and release checklist

This document describes implemented controls and remaining responsibilities. It is not a penetration-test certificate or a guarantee of immunity from attack.

## Controls in the source

- **Authentication:** bcrypt password hashing; opaque random session tokens stored as hashes server-side; HttpOnly, SameSite=Lax cookies with Secure enabled in production; active-user and teacher-approval checks; session revocation on logout/password changes/resets. New passwords enforce length and bcrypt's UTF-8 byte limit. Password login preserves intentional spaces.
- **Request integrity:** exact configured origins, session-bound CSRF for authenticated writes and signed nonce CSRF for anonymous auth writes; JSON-object body requirement; explicit typed fields and ID/enum/date/length checks; no request object passed directly into Mongo query/update filters.
- **Permissions:** server-side role/ownership scope on academy records, conversation membership on chat reads/writes and class membership on signaling. Public registration cannot set admin privileges. Public teacher output is an explicit field allowlist.
- **Messaging:** encrypted new message text and previews using AES-256-GCM; authenticated recipient resolution on the server; client IDs make same-message retries idempotent; sender-only message removal; owned read receipts. Chat has request/size limits, and HTML is rendered as text rather than inserted as raw HTML.
- **Socket controls:** sessions and CSRF checked at handshake; action authorization rechecked against the database; server-assigned rooms; signaling restricted to the same authorized class; message/payload/event limits; session expiry/revocation disconnect behavior.
- **Server and export hygiene:** Helmet headers/CSP, CORS, JSON size limits, global/auth/chat throttling, generic unclassified server errors, no embedded production secrets, and spreadsheet-formula protection in CSV exports.

These controls should be confirmed in a real installation with the supplied integration tests and manual negative tests. Frontend route guards alone are not security controls.

## Encryption boundaries

Chat encryption is **at rest on the server**, not end-to-end encryption. An authorized running server with `CHAT_KEY` can read the text. Use HTTPS/WSS to protect traffic in transit. Legacy plaintext remains readable for compatibility until `npm run messages:encrypt` is run. The UI explicitly says new messages are encrypted at rest.

Back up `CHAT_KEY` separately and securely from the database. Key rotation requires a deliberate decrypt/re-encrypt migration; replacing the key in `.env` is not rotation. Deleted messages become tombstones; old backups may still contain prior content. Create a documented retention and deletion policy before accepting personal or children's information.

## Before public deployment

1. Run on supported/patched Node and MongoDB releases. Install dependencies, review `npm audit`, build the actual React/Vite bundle, retain generated lockfiles and repeat the tests. No audit or dependency lock could be generated in the offline delivery environment.
2. Terminate HTTPS at a trusted reverse proxy; configure exact `ALLOWED_ORIGINS` and `PUBLIC_URL`; set `NODE_ENV=production`. Enable `TRUST_PROXY=1` only for one genuinely trusted proxy hop. Incorrect trust-proxy configuration can undermine IP limits. Do not expose MongoDB publicly.
3. Generate private session/chat keys with setup, create a unique admin credential, restrict DB permissions, secure backups, and monitor operational errors. Never publish `.env` or real credentials in source repositories or screenshots.
4. Verify teacher identity manually before approval. Email ownership verification, MFA, identity-document verification, moderation tooling and automated abuse investigation are not included. The legacy `isVerified` property is not proof of identity.
5. Configure SMTP for password resets and a TURN service for remote calls. The basic TURN settings return static credentials to authenticated participants; production deployments should use short-lived TURN credentials and provider-specific abuse controls rather than widely shared long-lived values.
6. Test student-to-student isolation, unapproved/inactive teacher blocking, cancelled enrollment writes, session expiry, CSRF rejection, CSV injection protection, and cross-class signaling rejection. See `TESTING.md`.
7. Review privacy notice, consent, account closure, data minimization, backup retention, access monitoring and applicable operating requirements with your institution. The code does not supply legal compliance certification.

## Known limits

Rate limits and room presence are local to a single process. A shared deployment needs coordinated stores. No independent security audit, stress/load benchmark or simultaneous-booking race proof has been completed. Password recovery depends on configured email; no SMS/phone reset is implemented. Admin audit entries cover selected important actions rather than a tamper-proof record of every database read. Uploaded file processing is intentionally absent; assignment audio is an external HTTPS link and should be independently trusted by participants.

Do not mix this backend with the original unprotected messaging endpoints, or trust role/identity IDs supplied by an arbitrary socket client.
