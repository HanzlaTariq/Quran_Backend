# Embedded classroom implementation notes

## Runtime and ownership

Frontend entry: `src/main.jsx` -> `src/App.jsx`. Backend local entry: `src/server.js`; Vercel: `api/index.js`; root `index.js` forwards to the active server, not legacy routes. Existing unused legacy files remain but must not be separately mounted.

Active classroom routes require `student` or `ulma` (the existing internal teacher role name). Each lesson lookup also applies the current user's enrolled profile scope. Admin is rejected before broad admin scope can expose teaching data. Teacher-only mutation checks are enforced on the server, not inferred from client flags.

## API contract

All paths below are relative to `/api`. Session cookies and existing CSRF protection apply. Responses are private/no-store.

| Method/path | Caller | Purpose |
|---|---|---|
| GET /classes | Participants | Scoped timetable, safe action flags |
| POST /classes | Teacher | Schedule lesson; backend room identifier |
| GET /classes/:id | Assigned participants | Details/status/shared focus, no provider token or room URL |
| POST /classes/:id/start | Assigned teacher | Time/enrollment checks, provision private room, live state |
| POST /classes/:id/join | Assigned participants | Check eligibility; issue short-lived, room-scoped token |
| POST /classes/:id/end | Assigned teacher | Stop new joins then request provider closure |
| POST /classes/:id/close-video | Assigned teacher | Retry terminal/expired room cleanup |
| PATCH /classes/:id/resource | Assigned teacher | Validated Quran/Hadith/notes plus versioned shared notes |
| PATCH /classes/:id | Assigned teacher | Edit permitted class metadata; legacy status requests delegate to same lifecycle |
| POST /attendance | Assigned teacher | Upsert explicit attendance for classId |
| POST /assignments | Assigned teacher | Create assignment for active enrollment, optional classId |

Student can read scoped assignment/attendance records and use existing assignment submission behavior. Admin aggregate reports deliberately omit individual attendance/class rows. Admin account/enrollment suspension may terminate media access as a security side effect; it is not a normal teaching action.

## Lifecycle and concurrency

Room name uses the lesson ObjectId; security does not rely on hiding that name. A scheduled lesson has no valid app join response. Start is allowed from the configured early-start point until scheduled end, only with active/approved enrollment. A 90-second class-start lease and existing booking actor transactions serialize competing starts/state changes. Provider room provisioning runs outside the DB transaction; the transaction rechecks eligibility before committing ongoing state. A partially provisioned private room has no newly released token; deterministic retry or provider expiry bounds leftover resources.

Join checks ownership, role, class status, active enrollment, window, successful room setup and active/verified participant accounts (including teacher approval). It rechecks after provider token creation. Server-generated tokens use class-scoped room name, caller identity, teacher owner flag and scheduled expiration. Tokens are returned only by the join response, retained in component memory and passed to the iframe, not stored in MongoDB/localStorage. They remain inspectable bearer credentials in an authorized browser.

End commits the terminal app state first, then expires/ejects/deletes the provider room. Failed cleanup sets closePending and is retryable. This is not a distributed atomic transaction: provider failure can delay removal of an already-connected participant even though new app joins are blocked. Scheduled room/token ejection policies remain configured. `scripts/cleanup-classrooms.js` is a trusted periodic-job entry point, not a scheduled job installed by this release.

## Resources and persistence

Quran resource: kind, surah, ayah, translation. Hadith resource: kind, collection, language, exact edition number. Notes resource: kind only, plus separately stored sharedNotes (12,000-character maximum). Server validates the actual selected verse/Hadith in the installed library when sharing. No raw HTML or arbitrary embedded external-resource URLs are accepted.

Teacher previews until Share with student. Optimistic resourceVersion prevents silent overwrites from multiple teacher tabs. Student follows shared focus by default or chooses independent local browsing. Teacher updates do not overwrite independent browsing; Follow teacher restores current shared focus. Resource changes never key/remount the provider iframe.

Class details poll every 3 seconds; dashboard/timetable every 5 seconds. Private classes:changed events accelerate refresh where available. Missing network verification closes an open video panel after a client timeout, but provider-side expiration—not the browser—is the enforceable media time limit. A provider prejoin load is not treated as proof of attendance.

Attendance adds a classId unique partial index and keeps legacy records without a reliable class link. The migration must replace the old unique enrollment/date index. Assignments retain existing submission/grading behavior with added enrollment and class linking.

## Scope

One-to-one, two participant maximum; teacher screen-sharing permission, private embedded prebuilt UI, installed library and teacher notes. No group roster, provider-signed attendance webhooks, automatic recordings/transcriptions, breakouts, custom whiteboard or arbitrary document upload in this release. Booking, SMTP OTP, encrypted messages and fee workflows outside the requested changes remain the original project's responsibility and need regression acceptance testing.
