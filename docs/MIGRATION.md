> For this two-repository patch, read ../UPDATE_GUIDE.md first. Sibling frontend/paths in this historical note refer to the other repository.

# Migration from the supplied Quran projects

## Do not replace files on a live service without a backup

This is a coordinated v2 replacement, not an in-place CSS patch. Preserve both original ZIPs, your private old configuration and a tested MongoDB backup. First run v2 against a **copy** of the database or an empty development database. Do not expose the old unauthenticated chat routes alongside the new API.

1. Extract v2 to a new folder. Install both packages and create the new `.env` with `npm run setup`.
2. Configure a copied/test MongoDB database and the exact browser origins. Keep generated keys private.
3. Synchronize the Quran/Hadith library and sign in with an existing compatible account, or create a new admin in an empty database.
4. Review user roles, teacher approval flags, courses, enrollment references and invoice records in the copied database.
5. Test all role workflows using `TESTING.md`. Only switch the deployed frontend and backend together after validation and a fresh backup.

## What is retained

The main Mongoose model names are retained: `User`, `Student`, `Ulma`, `Course`, `Enrollment`, `Class`, `Assignment`, `Attendance`, `Fee`, `Conversation`, and `Message`. With the same database/collection configuration, these refer to the same conventional collections. Existing compatible bcrypt password hashes are used by the new login path; existing passwords are not deliberately rehashed on unrelated profile saves.

Student and teacher profile records continue to reference `User`. Classes/enrollments use profile IDs. Conversations/messages use account IDs. Do not swap these identifiers when importing records manually.

New fields generally have defaults. Nevertheless, old documents with missing required references, malformed dates, duplicate identities or obsolete enum values need individual review. This delivery does not contain a universal data-cleaning migration or a guarantee that every historic document is compatible.

New collections hold opaque sessions, reset tokens, owned notices, audit events and academy configuration. Old browser tokens do not become valid v2 sessions: users must sign in again. Signing out or changing a password revokes the relevant new session records.

## Configuration and reading preferences

The new settings and bookmarks are stored in the v2 configuration/user fields. Old `AdminSetting`, `QuranSettings`, unrelated progress collections, locally stored legacy bookmarks and custom notification documents are not automatically imported. Re-enter the academy name, contact email, announcement and payment instructions in admin Settings; review teacher availability and learner settings.

The original progress/subscription fields are not presented as evidence of actual achievement. v2 summaries use saved class, attendance, assignment, fee and reading records. Payments/reports use the `Fee` workflow; arbitrary records in an old `Payment` collection are not imported as verified invoices. The current invoice UI and new course fees use **PKR**.

## Legacy messages

New messages and conversation previews are encrypted with AES-256-GCM using `CHAT_KEY`. The reader temporarily supports legacy plaintext for compatibility. To encrypt that legacy content, back up the database and key, test on the database copy, then run:

```sh
cd backend
npm run messages:encrypt
```

The migration does not delete the conversation history. Preserve the same `CHAT_KEY` permanently or perform an explicit, tested decrypt-and-re-encrypt key rotation. Regenerating this key will make previously encrypted text unreadable. At-rest encryption does not turn chat into end-to-end encryption: an authorized server can decrypt it. A removed message is a tombstone, not a guarantee that backups contain no old copy.

## URLs and workflows

Common old student/teacher/admin dashboard, timetable, enrollment, settings, chat and Quran routes are mapped to the new canonical pages. Historic unrelated links are not a promise of API compatibility. The old API routes, client-side role selection and socket identity behavior have been replaced; third-party integrations using old endpoints must be updated.

Student registration is always a student account unless the user explicitly submits a teacher application. Public registration cannot create an admin. Teacher applications need admin approval. The legacy `isVerified` field must not be interpreted as verified email ownership: this version has no email verification/MFA flow.

## Scope changes to review

The delivered workflow focuses on individual learners and one-to-one classes. It does not include a family/group call, a recurring-class generator, a bank/card payment gateway, hosted file uploads, a Quran tafsir reader, a standalone quiz engine, or automatic migration of old placeholder reports/earnings pages. Assignment tests can be created as an assignment type; they are not automatically graded quizzes.

Curriculum, certifications and some legacy schema fields are retained for compatibility but do not all have management screens. Teacher weekly availability is a preference template, not a repeating calendar scheduler. Discuss these explicit boundaries before treating the replacement as a full production migration.
