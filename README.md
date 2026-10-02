# Noor Academy — backend — Embedded Classroom v2.2.0

Read **[START_HERE_CLASSROOM.md](START_HERE_CLASSROOM.md)** first. It contains local setup, private Daily API configuration, database migration, deployment and an acceptance-test checklist. This is a complete updated copy of the uploaded source tree, not a built deployment.

Teacher/student own scheduling, private embedded live lessons, assignments and attendance. Admin remains an operational role. Quran/Hadith/notes sit beside Daily Prebuilt; student Join unlocks only after the assigned teacher starts.

**Verification:** 138 backend unit tests passed; 158 JS/JSX files parsed without syntax errors; 14 offline DOM interaction checks passed with API/media/history/socket test doubles. No real Daily call, MongoDB integration, dependency install or production build was executed here. See [test report](docs/CLASSROOM_TEST_REPORT.md).

Use the matching updated frontend and backend together. Existing `.env`, database records and encryption keys must be backed up/preserved. Apply the documented migration with API instances stopped before upgrading an existing database.

`PATCH_MANIFEST.json` compares this release with the uploaded ZIP. Legacy guides retained elsewhere are historical when they conflict with the current classroom guide. Never run old API routes alongside the new server entry point.
