# Backend update — existing GitHub repository

Yeh PATCH hai. Baseline: aap ka uploaded `Quran_Backend-main.zip`.
GitHub ki current branch is task mein read/push nahi hui. Pehle source code aur database ka backup lein. Existing database par switch se pehle `docs/MIGRATION.md` padhein aur database copy par workflows test karein.

## 1. Files merge karein

ZIP ke `backend` ke **andar wali files** existing backend repo ke root mein copy/merge karein. Same-name files replace karein; extra `backend` subfolder na banayein. Naya `index.js` old entry replace karta hai aur old unauthenticated routes import nahi karta. Vercel entry `api/index.js` hai.

Purane unknown `api/*`, custom `vercel.json`, ya third-party integrations jo baseline ZIP mein nahi the, manually review karein. This is an API/UI v2 upgrade, not a backward-compatible styling patch. Dono matching repos together switch karein.

## 2. Secrets aur MongoDB

Vercel backend project ke Environment Variables mein production values add karein, source code mein nahi:

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Apni MongoDB Atlas URI, **database name included** |
| `ALLOWED_ORIGINS` | Frontend ka exact origin, e.g. `https://YOUR-FRONTEND.vercel.app` |
| `PUBLIC_URL` | Wohi frontend production origin; password-reset links ke liye |
| `SESSION_SECRET` | Private 64-character hexadecimal value |
| `CHAT_KEY` | Different private 64-character hexadecimal value; existing encrypted messages ho to purani key preserve karein |
| `TRUST_PROXY` | `1` for the documented Vercel proxy setup; custom proxies re-check karein |
| `SOCKET_ADAPTER` | `mongo` |
| `SESSION_HOURS` | `12` |

`ALLOWED_ORIGINS` mein multiple trusted origins comma-separated de sakte hain. `*`, trailing slash ya arbitrary preview origins add na karein. Browser same-origin proxy use karta hai; cookies `HttpOnly`, production `Secure`, `SameSite=Lax`, host-only rehti hain. `.vercel.app` parent domain par cookie share karne ki zaroorat nahi.

Keys **sirf pehli martaba**, apne PC par private terminal mein generate karein:

```sh
node -e "const c=require('node:crypto');console.log('SESSION_SECRET='+c.randomBytes(32).toString('hex'));console.log('CHAT_KEY='+c.randomBytes(32).toString('hex'))"
```

In values ko GitHub, frontend `VITE_*` variables, screenshots, ya chat mein share na karein. `CHAT_KEY` badalne se old encrypted messages unreadable ho sakte hain.

MongoDB Atlas/database user ko application database read/write, TTL index creation aur Change Streams access chahiye. Atlas network policy ko apne hosting/network arrangement ke mutabiq allow karein; default advice ke taur par database ko har IP ke liye expose na karein. Production code expects an Atlas/replica-set deployment for realtime; standalone MongoDB is supported only for local memory-adapter mode.

Old `MONGO_URI`, `JWT_SECRET`, etc. apne aap map nahi hote. New required names above use karein. Never use `localhost` as the Vercel database address.

## 3. Vercel backend project

| Setting | Value |
| --- | --- |
| Git repository | Existing backend repo |
| Root Directory | Repo root `.` |
| Framework Preset | **Other** (explicit `api/index.js` Node server function) |
| Node.js | 22.x |
| Install Command | `npm install --package-lock=false` |
| Build Command | `npm run build` |
| Output Directory | Leave unset; **do not set `dist`** |
| Fluid Compute | Enabled for native WebSockets |

`vercel.json` already declares the function, API rewrite and library `data/**` inclusion. The API does not run `listen()` inside a Vercel Function; it exports the HTTP server.

Build runs `scripts/sync-data.js`: it downloads and validates the configured Quran/Hadith editions, then bundles those generated files. No invented religious text is included. If a data provider cannot be reached or validation fails, deployment build fails visibly — check build logs and retry, do not skip the data step. Audio still streams from the provider. A serverless function must not try to populate its deployed data directory at request time.

The old lockfile may describe the old dependency set. Included install command deliberately ignores it. For a committed fresh lockfile, run `npm install` locally and commit the regenerated `package-lock.json`. Do not use `npm ci` until the lock matches.

Deploy backend first after setting env values; then set its production origin in the frontend `vercel.json` and deploy frontend. For public use, check that Vercel Deployment Protection is not intercepting the public API/proxy. Do not paste bypass secrets in client code.

## 4. Local setup / first admin

In backend repo terminal:

```sh
npm run update:check
# Optional, after reviewing the list and backing up:
npm run update:clean
npm install
npm run setup
# Edit local .env; existing file is preserved by setup.
npm run data:sync
npm run admin:create
npm run dev
```

Use `npm run admin:create` once for an empty database. Do not try to turn a student into admin by changing frontend fields. Existing accounts/schema compatibility must be tested on a copied database first. Reuse/preserve existing v2 session/chat keys when applicable.

Local frontend uses port 5173 and backend port 5000. Local standalone MongoDB uses `SOCKET_ADAPTER=memory`; Vercel requires shared Mongo adapter.

## 5. Optional email and calling

Reset-email delivery needs `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM`. These are provider credentials, not included in this patch. No email is sent until configured. Cross-network camera calls may need `TURN_URL`, `TURN_USERNAME` and `TURN_PASSWORD`; STUN alone is not a guarantee.

Vercel currently documents native WebSockets in public beta with Fluid Compute. This patch uses WebSocket-only Socket.IO and its MongoDB adapter to communicate between instances. Chat message bodies remain encrypted in the persistent `Message`/conversation records; the shared adapter receives only chat-refresh IDs, not decrypted chat text. Adapter coordination/room metadata are not end-to-end encrypted.

**Live-call duration limitation:** `maxDuration` in this patch is **300 seconds**. Vercel closes a WebSocket when its function reaches the duration limit, and deployments can also interrupt it. The client reconnects; a classroom call currently requires explicit rejoin. This is not an uninterrupted 30/60-minute video-call guarantee. Messages remain in the database and have HTTP refresh fallback. The UI also supports an approved external HTTPS meeting link.

Shared MongoDB request counters replace process-local HTTP rate limits in this patch. User roles and session access are still checked on requests; production security needs more than these safeguards (backup/restore, monitoring, abuse controls and deployment validation).

## 6. Verify before public rollout

Check backend `/api/health`, then frontend `/api/health`, then sign-in and authenticated role workflows. Test registration, teacher approval, enrollment, invoice verification, Quran/Hadith search, bookmarks, private chat and read receipts. Confirm unrelated users get denied. Test frontend route refreshes and mobile layouts. Use two devices to test message delivery and camera permissions. Observe a connection duration expiry and confirm reconnect/rejoin behavior.

`npm test` runs the offline unit suites and skips the opt-in integration case. `docs/PATCH_TEST_REPORT.md` separates performed checks from unperformed live checks.

## 7. Git push

```sh
git status
git add .
git diff --cached --stat
# Ensure .env/private keys are not staged.
git commit -m "Apply Noor backend and Vercel deployment patch"
git push
```

Use your existing branch; no forced push or repo recreation is needed. If a private env file was already tracked, .gitignore alone does not untrack it: remove it from tracking and rotate any exposed credentials after reviewing deployment impact.

Official references checked 2026-10-02:
- https://vercel.com/docs/functions/websockets
- https://vercel.com/docs/functions/configuring-functions/duration
- https://vercel.com/docs/project-configuration/vercel-json
- https://vercel.com/docs/routing/rewrites
- https://socket.io/docs/v4/mongo-adapter/
- https://vercel.com/kb/guide/can-i-set-a-cookie-from-my-vercel-project-subdomain-to-vercel-app
