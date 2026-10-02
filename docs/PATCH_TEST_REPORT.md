# Patch verification — 2026-10-02

## What this archive is

A file-content delta against the two original ZIPs supplied in this conversation, plus new deployment configuration and repository-local guides. It is not a GitHub-current diff and not a standalone full-project archive. Apply it by merging each folder's contents into its existing repository root. Unchanged model files are deliberately omitted.

## Executed checks

- Node offline suites: **53 passed, 0 failed, 1 skipped** (54 tests including nested cases). The skipped case is the explicitly opt-in real database/HTTP integration suite. Output: `unit-test-output.txt`.
- The 8 additional storage tests exercise the shared rate-limit store through a controlled fake collection, including duplicate-upsert retry, hashed bucket isolation and fail-closed errors. They do **not** prove live MongoDB/Atlas behavior.
- TypeScript parser syntax checks: **46 JavaScript/JSX/MJS files**, including **9 JSX files**, parsed without syntax errors. Relative top-level import/export targets resolve in the merged source. This is a syntax/import-path check, not an installed React/Vite build or dependency compatibility test.
- All included JSON configurations parse successfully. Both package configurations select Node 22.x.
- Both patches were overlaid on copies of the user's original ZIP trees. Expected active source files matched the resulting tree byte-for-byte.
- Optional legacy cleanup dry run left all files unchanged. Apply mode removed only SHA-256-matching obsolete baseline files. Private `.env`, `.git` contents, unknown custom files and an edited legacy file were preserved in the test copies.
- Payload comparison confirms no unchanged original source files are repackaged. Each `PATCH_MANIFEST.json` includes the change inventory, baseline archive checksum and optional obsolete-file list.
- Archive structure has exactly two top-level directories: `frontend` and `backend`. No screenshots, node_modules, dist, original ZIPs, private keys, production data or font files are included.

## Not executed here

The environment could not resolve registry.npmjs.org, and has no running MongoDB, Atlas credentials or Vercel project access. Consequently no npm dependency install, real production Vite build, fresh lockfile generation, online Quran/Hadith sync, live MongoDB integration, actual Vercel deployment/proxy-cookie flow, SMTP delivery, cross-instance adapter delivery or two-device camera call was verified. Tests do not establish production readiness.

## Vercel-specific implementation changes

- Explicit HTTP-server export from `api/index.js`; no local listen/process shutdown registration in Vercel.
- Frontend same-origin REST/Socket.IO proxy rewrites and SPA fallback, plus response security headers.
- Build-time Quran/Hadith sync and function data-file inclusion. Deployment intentionally fails if provider data cannot be downloaded/validated.
- WebSocket-only Socket.IO with a MongoDB adapter for Vercel/replica-set deployments. Raw session credentials are not put in shared socket metadata. Chat-refresh events contain conversation IDs rather than decrypted message bodies.
- Mongo-backed shared HTTP rate counters replace per-process memory buckets; live database validation remains necessary.
- Frontend error for accidental HTML API responses; automatic chat HTTP polling remains available.

## Important live-call limitation

Included Vercel function maximum duration is 300 seconds. A WebSocket can close at that limit or on redeploy. The socket client reconnects, but the current classroom UX requires explicit rejoin. This patch does not promise uninterrupted long video lessons. Test this behavior before use, and use the supported external HTTPS meeting-link workflow for lessons that require different hosting characteristics.

Official reference pages checked 2026-10-02:
https://vercel.com/docs/functions/websockets
https://vercel.com/docs/functions/configuring-functions/duration
https://vercel.com/docs/routing/rewrites
https://vercel.com/docs/project-configuration/vercel-json
https://socket.io/docs/v4/mongo-adapter/
