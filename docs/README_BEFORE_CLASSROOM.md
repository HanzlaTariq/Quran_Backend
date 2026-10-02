# Historical README — superseded by START_HERE_CLASSROOM.md

# Noor Academy — backend patch

Start with [UPDATE_GUIDE.md](UPDATE_GUIDE.md), then [migration guidance](docs/MIGRATION.md).

Merge these changed/new files into the root of your existing backend repository. Vercel uses `api/index.js`; local development uses `src/server.js`. Do not deploy the old API alongside these routes.

```sh
npm install
npm run setup
# Edit private .env, then:
npm run data:sync
npm run admin:create
npm run dev
```

On Vercel, set the documented environment variables in project Settings, use MongoDB Atlas/a replica set and enable Fluid Compute. The build syncs the Quran/Hadith library. Read the guide's connection-duration and testing limitations before a public rollout.

Offline checks: `npm test`. Optional real database integration is documented in `docs/TESTING.md`. No live deployment is claimed by this patch.
