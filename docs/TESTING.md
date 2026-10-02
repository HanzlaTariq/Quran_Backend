> For this two-repository patch, read ../UPDATE_GUIDE.md first. Sibling frontend/paths in this historical note refer to the other repository.

# Verification on your computer

## 1. Offline unit suites

From `backend`:

```sh
npm test
```

The core and library suites use Node's test runner. They do not need a MongoDB server or downloaded scripture. Library tests create and delete an isolated temporary fixture directory; the fixture text is explicitly non-religious testing text and never populates `backend/data`.

The delivery result was **45 passed, 0 failed, 1 skipped**. The skip is the opt-in real-server integration test, not a passed database test. See `TEST_REPORT.md` and `unit-test-output.txt`.

## 2. Real database/API integration suite

Install backend dependencies and use a dedicated non-production database. The test runner requires the database name to end with `_test` and a localhost test server. It creates its own uniquely named test accounts and records, then cleans up its records; do not run against a live academy database.

First terminal, from `backend`:

```sh
npm run setup:test
```

Review `.env.testing`. Defaults use port 5001 and `mongodb://127.0.0.1:27017/noor_academy_test`. Generated keys are separate from production. Then:

```sh
npm run dev:test
```

Second terminal, also from `backend`:

```sh
npm run test:integration
```

Keep MongoDB and the test server running while the suite executes. Do not expose this test server publicly. The suite exercises real HTTP responses and Mongo records for login/CSRF, restricted registration, teacher approval, enrollment fee/duplicate checks, owned messaging and encryption, scheduling/attendance, assignments, invoice approval, cancellation and session revocation. It does not launch a WebRTC call or deliver SMTP mail.

**This real-server suite was supplied but not executed in the delivery environment.** A failed test is a release blocker to investigate, not something to suppress by changing expected results.

## 3. Install, build and dependency verification

```sh
cd frontend
npm install
npm run build
npm audit
cd ../backend
npm install
npm test
npm audit
```

Review security reports rather than blindly applying breaking upgrades. Retain the newly generated package-lock files and repeat the build/tests with the resolved versions. Source syntax/transpilation checks from delivery are not substitutes for this installed Vite build.

## 4. Real user acceptance pass

Use separate browser profiles for admin, an approved teacher, student A and unrelated student B. Create actual test courses and enrollments. Check the entire enrollment -> scheduling -> joining -> attendance -> assignment -> invoice -> admin payment verification flow. Confirm that B cannot read A's records by editing URLs or API IDs. Try a pending teacher and an inactive account. Confirm incorrect passwords and disallowed state transitions show useful errors.

Check authenticated messaging in both browser profiles: new message arrival, unread/read receipts, load older history, intentional network interruption/retry, sender removal, typing indication and enrollment cancellation. Confirm there is no access by an arbitrary conversation ID. Inspect the database copy to confirm new stored message text is encrypted, then verify backups and legacy migration separately.

Run `npm run data:sync`, then inspect all 114 surah entries, multiple Arabic verses and both translations against the cited provider. Test `2:255`, an Arabic phrase, an Urdu phrase, a nonexistent reference, pagination, bookmark persistence, last-read saving, audio failures and continuous playback. For each configured Hadith edition, check exact-number, text and chapter search, source labels and unavailable-language behavior. Source comparison needs actual downloaded data; the unit fixture suite cannot prove content accuracy.

Test password reset with your real SMTP sandbox/account: unknown email response, one-time valid token, expired/reused token, and revocation of old sessions. Do not send test reset links to people who did not request them.

For classroom calls, use two physical devices/browsers on different networks and HTTPS with TURN configured. Verify camera/microphone permission denial, join order, mute/camera toggles, peer disconnect/rejoin, session expiration and leave cleanup. STUN-only local success is not evidence that all networks work.

## 5. Responsive/accessibility pass

Check 320/390px phones, 768px tablet, 1024px laptop and 1440/1920px desktop, in both portrait and landscape where relevant. Check Chrome, Firefox and Safari/iOS, touch controls, 200% zoom, keyboard tab order, visible focus, modal Escape/focus return, readable Arabic, long real names and messages, empty/error/loading states, dark mode, print reports and reduced motion. Scroll each page vertically; do not merely check the initial viewport.

The delivery's 252 width/page checks used an isolated Chromium rendering harness with a Preact compatibility layer, API fixtures and system fonts. They are useful layout checks, not coverage of every device, React production runtime, screen reader or live API.
