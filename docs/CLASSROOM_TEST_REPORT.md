# Classroom release verification — 2.2.0

## Executed in this environment

| Check | Actual result | What this establishes |
|---|---|---|
| Backend `npm test` | **138 passed; 0 failed; 0 skipped** | Existing pure tests plus classroom policy and mocked Daily REST behavior |
| JavaScript/JSX syntax parsing | **158 files, 0 parse diagnostics** | Frontend `src`, backend `src` and backend `models` parse; not type checking or dependency resolution |
| Additional Node syntax checks | Passed | Optional integration test, migration/cleanup and modified server/router code parse |
| Offline browser DOM scenarios | **14 passed; no uncaught JS errors** | Components react to mocked API state; no real media/network validation |

Original baseline unit run: 97 passed. This release adds 41 cases (including parameterized subtests) for the classroom policy and Daily REST adapter. Full final TAP output is in `classroom-validation/unit-test-results.txt` in the backend package.

The UI test used local Chromium on an `about:blank` document, an already-installed React 19.1.1 runtime, and TypeScript-transpiled application modules. The shipped package itself pins the existing React 19.2.4-compatible dependency range. A fake history adapter, fake Socket.IO client, intercepted fetch implementation and fake Daily iframe content were used. Browser navigation restrictions prevented an ordinary localhost test. No browser security policies were changed. This is a DOM/component test, **not a successful Vite build or end-to-end deployment**.

The small Quran/Hadith fixtures in the UI checks were only test data. They are not installed as the application's production religious-text library. Screenshots label the media panel as a UI test. `ui-results.json` lists the 14 checks. No React runtime/font files from the environment are shipped.

## UI checks that passed

1. Scheduled student classroom does not show Start or Join.
2. Teacher Start unlocks student Join through polling, without manual refresh.
3. Both participant roles render an embedded video panel in the classroom route.
4. Sharing an ayah updates student focus without replacing either iframe DOM node.
5. Independent student browsing survives teacher reference updates; Follow teacher restores shared focus.
6. Teacher notes synchronize; student notes are read-only.
7. Attendance form sends the exact class ID and explicit teacher-selected status.
8. Assignment form sends enrollment and class IDs.
9. End Class removes both iframe panels and student Join in the mocked lifecycle.
10. Admin has an operational dashboard, no teaching sidebar links and no direct class-page access.
11. Schedule form collects class name/date/time and has no external meeting URL field.
12. 390px mobile layout has no horizontal overflow.
13. `?join=1` opens embedded prejoin after eligible mocked API state.
14. No uncaught browser JavaScript errors during these interactions.

## Not executed — mandatory staging checks remain

No dependency installation, production Vite build, MongoDB/SMTP integration run, migration against a real database, real Daily room/token/eject request, WebRTC camera/microphone exchange, load test, production-host CSP/Permissions-Policy test, multi-instance Socket.IO test or actual deployment was performed here. The container had no usable external package-network access, no MongoDB server, and no Daily credentials. HTTP mock assertions are not proof that a provider account currently accepts each payload.

`tests/integration.test.js` was updated for the new roles and start/join contract, but was **not run against a database**. Its default path requires the Daily key to be empty and verifies failure-closed setup behavior. A separately opt-in Daily mode exercises provider HTTP room/token/closure operations with a dedicated account, not actual media streams. Follow START_HERE_CLASSROOM.md on an isolated `_test` database.

Before launch, run `npm ci`, the frontend build, real database integration and two-device media acceptance checks. Include teacher disconnect/reconnect, end/cleanup failure, pause/cancel enrollment, disabled participant, expired class, wrong student/admin direct access, concurrent teacher tabs, multiple classes on one date, unavailable library and browser permission denial. Review rate limits under realistic concurrent users/shared network addresses; this release is not a capacity certification or comprehensive audit of the original application.
