# Noor Academy 2.1 — enrollment, timetable, fees and OTP update

## Apply this patch, not a full replacement

This ZIP has exactly two top-level folders: `frontend/` and `backend/`. It contains only files added or changed relative to the previous 2.0.1 update plus the no-watch backend restart fix. It is NOT a standalone complete project.

1. Commit/back up BOTH existing repositories, and take a MongoDB backup.
2. Stop both development servers. Copy the CONTENTS of `backend/` into the existing backend repo root, and the CONTENTS of `frontend/` into the existing frontend repo root. Merge directories and replace matching files; do not delete the whole `src` or `models` folders.
3. Keep your actual `.env`, MongoDB URI, existing `SESSION_SECRET`, `CHAT_KEY`, downloaded `data/`, and customized `vercel.json`. They are not included in this patch. Do not regenerate the chat key: saved encrypted messages need the original key.
4. No new runtime dependency was introduced. Keep the dependencies already installed for 2.0.1. On a fresh clone, run the existing `npm install --package-lock=false` command in each repo.
5. Restart the backend with `npm run dev` and the frontend with `npm run dev`. The backend dev command intentionally has NO `--watch`, preserving the earlier ECONNRESET fix.

Health response at `http://localhost:5000/api/health` now has version `2.1.0`. The frontend proxy health address is `http://localhost:5173/api/health`.

## Mandatory: real email delivery

Registration creates an **unverified** account; it does not create a session. A six-digit code must be delivered by SMTP and verified. Every later password-based sign-in also requires a fresh emailed code. Existing pre-update sessions must sign in again.

The following belong in the BACKEND `.env` / Vercel environment only:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=YOUR_FULL_EMAIL_ADDRESS
SMTP_PASS=YOUR_NEW_APP_PASSWORD
SMTP_FROM="Noor Academy <YOUR_FULL_EMAIL_ADDRESS>"
```

Replace the examples with real authorized credentials. The code also supports existing `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASSWORD`, and `EMAIL_FROM` names. A nonempty `SMTP_*` value takes precedence over its `EMAIL_*` counterpart. Never commit credentials. A previously shared app password must be revoked and replaced.

Check connection/authentication without sending a code:

```bat
npm run email:check
```

A successful check proves SMTP connection/authentication, NOT inbox delivery. Test a real signup and check inbox/spam. When a university/organization blocks SMTP or app passwords, its mail administrator must enable an authorized delivery method; code cannot override that restriction.

Codes are six digits, expire after 10 minutes, are single-use, and allow at most five guesses per issued code. Resends have a 60-second cooldown, an absolute verification-session lifetime of 30 minutes, and per-account/IP budgets. There is no development code displayed in the console, no return-code endpoint, and no production OTP bypass. The only email receiver in `tests/helpers/` is isolated test infrastructure and is not imported by the app.

If SMTP fails after an account row is created, use **Sign in** with the same email/password to request a new code; do not delete the database or keep trying to create duplicate accounts. An unverified mailbox does not imply a verified identity or teacher qualification.

## Mandatory: MongoDB Atlas / replica set

Reservations, enrollment status, all generated classes, and all monthly invoices are committed using a MongoDB transaction. Durable teacher/student mutex documents serialize competing transactions across instances. This is not an in-memory lock.

Use the existing Atlas URI, or a properly configured MongoDB replica set. A standalone MongoDB instance is deliberately rejected for scheduling writes instead of risking half-created invoices/timetables. Local `SOCKET_ADAPTER=memory` does NOT remove the transaction requirement. On Vercel, keep the shared Mongo socket adapter from the preceding release.

No database wipe is needed. New collections and indexes are initialized through Mongoose. A duplicate-index/data error should be investigated from the backend log; do not fix it by dropping existing collections.

## The complete workflow

### Administrator

Sign in with password and OTP. The administrator email must be a mailbox you can receive mail at. If an old administrator was created with an inaccessible/example address, use the existing `npm run admin:create` script to create a separate administrator with a real accessible address; it will not overwrite an existing account. Keep this server-side operation private. In Settings, choose the lesson duration (default 30 minutes), pending hold lifetime (default 24 hours), booking notice, future-start window, early start window and fee grace period. These settings apply to new selections; existing approved UTC timetables and fee snapshots are not silently moved/repriced.

Create/publish courses including duration in calendar months, monthly fee and billing currency. Approve a teacher only after their email has been verified. Review their application independently: the approval badge does not certify self-reported qualifications.

### Teacher

Register with country, city, IANA time zone, languages, gender and optional phone/age. The application additionally accepts biography, experience and expertise. Verify the email, then wait for admin approval. After approval, sign in with OTP.

Open Settings to upload a photo, complete biography/qualifications, select taught courses, and add weekly availability windows. All seven days are supported; multiple windows per day are allowed. Times use the teacher's selected time zone. For availability ending at midnight, use 00:00. Split an overnight window into the two affected weekdays. Empty course selection means all active courses; no availability means there are no new selectable slots.

Profile photos are re-encoded to small JPEGs in the browser and stored in MongoDB, not in a transient Vercel upload directory. A legacy local/remote photo URL may need to be uploaded again; this patch cannot recover an image file that is absent from the supplied project/server.

### Student

Complete country, city, time zone and languages in signup or Settings. Browse every published course and search/filter approved teachers. The teacher directory includes photo, biography, teaching languages, experience, country/city, qualifications and time zone.

Choose a course and teacher, view the teacher's current time beside your current local time, then select one to seven recurring weekly lessons (at most one slot per teacher weekday). The weekly calendar displays your local date/time and the teacher's corresponding weekday/time. Choose a starting week, then review the timetable preview and monthly fee before submitting.

**Available** means the checked recurrence has no existing conflict. **Held** means another pending enrollment is reserving the time. **Booked** means a confirmed lesson occupies the time. Unavailable/held/booked slots cannot be selected; the server also checks them again on submission and approval. Public slot responses do not include another student's name or identifier.

Submitting creates a pending request plus temporary reservations; it creates no fee. A hold lasts until its configured expiry, or the first lesson start, whichever is sooner. Expiry is checked at query time, independently of MongoDB's background TTL cleanup. A pending/expired request can be replaced through **Choose slots / request again**. The old request is replaced only if the new reservation transaction succeeds.

### Approval -> automatic timetable and fees

Admin approval checks the exact saved slots and actor availability again. One transaction generates all course lessons, confirms their reservations, creates one dated invoice per course month, and establishes the student-teacher chat connection. Repeated/concurrent approval is designed not to duplicate those records.

The same lessons appear in both participants' Classes & timetable pages, rendered in each participant's own time zone. Admin and student see the invoices. Each invoice is the course's fixed monthly fee, in its chosen currency; there is no exchange-rate conversion or automatic bank charge. Student payment references require administrator verification before `paid` status.

Billing periods are anchored to the selected first lesson's calendar date, not repeated 30-day increments. A January 31 start, for example, anchors subsequent periods to February 28/29 and March 31. A course fee is a flat monthly course price, not a per-slot or per-minute charge.

### Classes

Teachers can create additional lessons for their assigned approved/active enrollments; administrators can create them for any approved enrollment. The form explicitly uses the signed-in creator's saved time zone, not the device's accidental time zone. Duration comes from the admin setting. Overlaps with any existing teacher OR student lesson/hold are rejected.

Both participants see created lessons. Within the configured early-start window, the teacher selects **Start & join class**. The student then selects **Join class**. Built-in video still needs explicit browser camera/microphone permission. An optional HTTPS external meeting link is supported; the join endpoint checks role, enrollment, class status and scheduled window before returning it. Editing a topic/link does not move the reserved time. To move one lesson, cancel it and create a replacement, then review fees separately.

Only the enrolled teacher/student are permitted into the built-in media room. Plain HTTP on a phone's Wi-Fi IP is not enough for browser camera access; use HTTPS. Cross-network media may need TURN. Vercel deployment, websocket duration/reconnect behaviour and two-device media must be tested on the actual hosting/network setup. No uninterrupted-call guarantee is implied.

## Time zones and daylight-saving rules

The source of a weekly recurrence is the teacher's IANA zone and local weekday/time. Each occurrence is converted separately to UTC and stored. Student display converts each exact UTC instant into the student's saved IANA zone. Do not use a fixed “USA offset”: different regions and dates can have different offsets.

When either region changes clocks, the corresponding local time can change. The UI displays both zones. If a requested teacher-local lesson time does not exist or occurs twice during a clock change, or a lesson crosses the clock jump, that occurrence is explicitly skipped and listed in the review and enrollment record. It is not silently shifted or assigned an arbitrary offset; arrange a replacement lesson with the teacher. The monthly fee is not automatically prorated for such exceptions.

Teachers cannot change their schedule time zone while open enrollments exist. Students can update their display zone without moving booked UTC classes. Availability changes do not cancel or move existing confirmed lessons.

## Existing data: do not guess or erase schedules

Run this read-only report before enabling bookings on an existing database:

```bat
npm run schedule:audit
```

It reports older pending requests without selected slots, older active enrollments without the new unambiguous schedule format, teachers needing verification/availability, and classes missing enrollment or UTC references. It prints IDs and counts, not passwords or private mail credentials, and makes no changes.

- Older **pending** requests: the student opens Enrollments -> **Choose slots / request again**. Admin approves the replacement request.
- Older **approved/active/paused** enrollments: keep their existing dated classes and payment history. Admin reviews the old plan with both parties. Before admitting new recurring bookings involving an ambiguous older active plan, the API conservatively returns “timetable needs review” rather than advertising unknown future times as free. Complete/cancel the old enrollment only after reviewing remaining lessons and billing, then send an explicitly scheduled replacement request. Do NOT approve a duplicate full-fee replacement without reviewing what the student already paid.
- Old classes with missing UTC times or enrollment links require a specific data correction based on the actual intended lesson. No automatic script fabricates that missing information.
- Existing users need their next password+OTP sign-in. Existing teachers appear publicly only after email verification and admin approval. Old private message keys/content are unchanged.

Cancellation releases this enrollment's future reservations and cancels its future scheduled/ongoing/paused classes. Future unsubmitted automatic invoices are cancelled; paid/submitted/history records are not deleted or treated as refunds. Pausing retains reservations and pauses future classes; it does not automatically refund/prorate invoices. Completing an enrollment closes future lessons and releases reservations but leaves its ledger for admin reconciliation. These are deliberate accounting rules, not payment processing.

## GitHub / Vercel

Apply and commit the two patch folders to their respective existing repositories. No new `frontend` or `backend` wrapper folder should appear inside either repository. Keep the two existing Vercel projects and their root directories. This patch does not overwrite your customized `vercel.json` or backend destination URLs.

Backend production variables still need the correct Atlas URI, original secrets, exact production frontend origin/public URL and SMTP delivery settings. Keep `NODE_ENV=production`, HTTPS cookies and the previously configured shared socket adapter. Do not put backend secrets in `VITE_*` variables.

Run locally before pushing:

```bat
:: Backend terminal
npm run email:check
npm run schedule:audit
npm test
npm run dev

:: Frontend terminal
npm run build
npm run dev
```

`npm run build` on the backend still refreshes real library data as in the previous release; this patch does not replace Quran/Hadith sources or add fabricated scripture.

## Optional real integration suite

The unit suite requires only Node and does not connect to your real database. The optional integration suite requires installed runtime dependencies, an exclusive **separate** Atlas/replica-set test database, a local API process, and the supplied loopback SMTP collector. It is not a test against a real Gmail inbox.

```bat
npm run setup:test
```

Edit `.env.testing`: database name must end in `_test`, `NODE_ENV=test`, port 5001, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=2526`, and NO SMTP/EMAIL credentials. The setup script creates fresh test-only secrets. Keep them separate from production. The test collector is started and stopped by the test runner. If `.env.testing` already exists from an older version, update these fields manually.

```bat
:: Terminal 1
npm run dev:test
:: Terminal 2
npm run test:integration
```

The suite exercises actual HTTP/password/OTP verification via SMTP, role checks, simultaneous student requests, idempotent concurrent approval, real Mongo transactions, timetable visibility, manual class creation/join authorization, fee creation/cancellation and encrypted chat. It uses unique fixture accounts and cleans up their records. Do not run it against a shared/staging/live academy database. A few fixture timestamps are deliberately advanced in the dedicated test DB to avoid sleeping through a cooldown; this does not create a production authentication bypass.

## Verification status

See `BOOKING_TEST_REPORT.md`. The offline packaging environment ran dependency-free tests and syntax/import checks. It could NOT install runtime dependencies, connect to Atlas, deliver real email, build with installed Vite/React, deploy to Vercel, or exercise two-device camera calls. The real integration suite is supplied but not claimed as passed. Verify those steps on your own installation before admitting real students.

## Implementation references

- MongoDB transactions: https://www.mongodb.com/docs/manual/core/transactions/
- Transaction deployment requirements: https://www.mongodb.com/docs/manual/core/transactions-production-consideration/
- OWASP OTP hygiene: https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html
- IANA display conversion: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat
- SMTP transport: https://nodemailer.com/smtp
