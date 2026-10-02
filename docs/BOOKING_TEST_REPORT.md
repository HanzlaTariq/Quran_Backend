# Noor Academy 2.1 booking / OTP patch — verification report

Prepared: 2 October 2026. Scope: changed/new files relative to the supplied 2.0.1 patch, including the no-watch restart fix.

## Executed successfully

| Check | Result | Scope / limitation |
| --- | --- | --- |
| `npm test` | **97 passed, 0 failed, 0 skipped** | Node's dependency-free test runner; 84 top-level tests plus subtests. Not database integration. |
| Backend `node --check` | **54 JavaScript/module files, 0 syntax errors** | `src`, `models`, `scripts`, `tests`, including the optional integration suite. Parsing is not execution. |
| Frontend JSX/JavaScript syntax | **117 files, 0 syntax errors** | TypeScript `transpileModule`, React JSX syntax. Includes retained legacy source files. Not an installed Vite build. |
| Reachable local-module import/export graph | **44 JavaScript files, 110 local imports, 409 imported names, 0 errors** | Entry points `backend/src/server.js` and `frontend/src/main.jsx`. External packages are not resolved by this check. |
| Undeclared-name diagnostic scan | **0 remaining diagnostics in the selected categories** | TypeScript `checkJs`, diagnostic codes 2304/2552; standard Node `process`/`Buffer` globals excluded because Node typings are not installed. This is not a complete type check. |

The package keeps the previously installed runtime dependency versions. Node used in the packaging environment: 22.16.0. No runtime packages could be fetched into this environment.

## What the unit tests cover

The existing core, Quran/Hadith library and shared rate-limit-store tests remain in the suite. Added tests cover:

- Required profile fields, normalized languages, optional expertise, protected-field rejection/whitelisting and JPEG-only image validation with byte/dimension limits.
- Six-digit cryptographic OTP generation, keyed hashes bound to challenge/purpose, strict input validation and the configured expiry/attempt/cooldown limits. Unit tests do not send mail or prove atomic database challenge consumption.
- IANA time-zone validation; Pakistan/New York and teacher-anchored weekly recurrence across DST; separate date rollovers; quarter-hour zones and half-hour DST; nonexistent/repeated times; explicit skipped-occurrence reporting rather than silently changing lesson times.
- All seven weekdays, lesson-grid anchoring, overlap rejection, adjacent non-overlap, cross-midnight boundaries, recurring future conflicts, calendar-month durations and month-end invoice anchors.

## Supplied but NOT executed here

`tests/integration.test.js` and `tests/helpers/local-smtp.js` are supplied for a separate, local test setup. They exercise real HTTP/session/CSRF handling, SMTP-received OTP, wrong/used-code rejection, teacher approval, simultaneous requests and admin approvals, real MongoDB transaction behavior, role-scoped timetable visibility, class start/join checks, invoices, cancellation and secure chat.

The suite requires installed runtime dependencies and an exclusive MongoDB Atlas/replica-set database whose name ends in `_test`. Its loopback SMTP collector is only an isolated test receiver, not proof of delivery through Gmail or another public provider. See `BOOKING_UPDATE.md`. It has **not** been run or passed in the packaging environment.

The following are also **not verified here**:

- An installed React/Vite development or production build, or browser-based visual/device regression testing of the newly added screens.
- Live MongoDB schema/index creation on the user's existing records, concurrency under a real Atlas workload, or live legacy-data migration outcomes.
- SMTP authentication with the user's credentials, delivery to a real inbox/spam folder, or production OTP latency.
- Vercel deployment, production cookie/proxy behavior, websocket reconnect behavior, or two-device audio/video across actual networks.

The responsive CSS, server validations and integration-test source are implementations, not evidence that every device or production workflow has already passed. Before real users are enrolled, run the installation checks and one complete three-role workflow on the actual deployment.

## Required acceptance walkthrough on the user's installation

1. Keep existing `.env`/secrets, use the existing Atlas URI, configure authorized SMTP, and run `npm run email:check`. Then verify an actual delivered OTP.
2. Admin signs in with OTP, publishes a course and sets the lesson duration. Teacher verifies email, obtains approval, signs in, uploads a photo and saves seven-day availability in a real IANA zone.
3. Two students in different zones view the same teacher. Submit the same overlapping slot concurrently: only one should be held. No student identity should appear in a public busy-slot response.
4. Admin approves the held request. Verify both timetables, the full recurring schedule, monthly invoices and no duplicate output on repeated approval.
5. Start the scheduled lesson and test the enrolled student's Join button; verify that another student cannot access it. Test actual media permissions/networking separately.
6. Check expired holds, pause/cancel behavior and a DST-crossing week. Run the read-only `npm run schedule:audit` before replacing any old enrollment; reconcile previous payments manually rather than deleting history.
7. Run frontend `npm run build` and deployment checks before pushing/admitting students.

## Packaging integrity

Each repository includes a new `BOOKING_PATCH_MANIFEST.json` listing only its changed/new files and SHA-256 hashes. The manifest deliberately excludes itself. No files need to be deleted to apply this patch. Original environment files, custom Vercel destinations, dependency folders and downloaded Quran/Hadith data are not in the archive.

The package was assembled by byte-comparing the updated trees with the supplied previous patch baseline. A temporary overlay of the patch was compared against the updated trees, and the ZIP was checked for corruption and for exactly the `frontend` / `backend` top-level folders. These checks establish packaging integrity, not production correctness.
