# Noor Academy — Advanced Embedded Classroom
## Start here | Version 2.2.0 | 2 October 2026

Ye guide is release ki current instructions hain. Dono updated projects saath use karein. Purane `UPDATE_GUIDE.md`, booking documents aur legacy video notes mein class roles/external meeting instructions is release se pehle ki ho sakti hain.

**Delivery status:** source code update kiya gaya hai. 138 unit tests, 158-file syntax check aur 14 mocked browser UI checks pass hue. Real MongoDB/SMTP/Daily integration, asli two-device video/audio aur production build is environment mein run nahi hue. Deployment se pehle neeche diya gaya staging test complete karein.

## 1. Aap ki requested changes

| Kaam | Teacher | Student | Admin |
|---|---|---|---|
| Named class schedule karna | Apni active enrollment ke liye | Nahi | Nahi |
| Start / End Class | Assigned teacher | Nahi | Nahi |
| Class details aur video join | Apni class | Apni class; teacher ke Start ke baad | Nahi |
| Quran/Hadith independently parhna | Haan | Haan | General library, teaching room nahi |
| Shared ayah / Hadith / lesson notes set karna | Haan | Follow ya independent browse | Nahi |
| Assignment banana aur grade karna | Haan | Apna assignment submit karna | Nahi |
| Attendance mark karna | Haan, exact class ke liye | Apni attendance dekhna | Nahi |
| Accounts, teacher approval, courses, enrollment approvals, fees, settings | Limited own profile | Limited own profile | Platform management |

Admin restrictions sirf buttons hide nahi kartin: API par bhi teaching routes reject hote hain. Admin reports aggregate operational counts tak limited hain; class room links, assignment content aur individual attendance detail nahi milti.

Existing enrollment/recurring timetable workflow preserve kiya gaya hai: enrollment approval ab bhi platform process ka hissa hai aur configured recurring slots automatically generate ho sakte hain. Ye admin ka manual class-teaching control nahi hai. Extra named lessons teacher schedule karta hai; admin manually Start/Join/End ya assignments/attendance nahi karta.

## 2. Exact class flow

Teacher > My timetable > Schedule a class > active enrollment + class name + date/time + optional notes.

Backend class record ke saath deterministic room identifier banata hai, masalan `quran-class-0123456789abcdef01234567`. Manually Daily room create karna zaroori nahi. Actual private Daily room **Start Class** par provision hota hai, scheduling par nahi.

Student ko scheduled class ka naam, teacher, time aur Class details milti hain. **Join Class scheduled state mein render nahi hota.** Teacher apne permitted start window mein Start Class press karta hai. Backend ownership, enrollment, time aur room setup check karke status ongoing karta hai. Phir student ka Join Class unlock hota hai. Classroom status har 3 seconds; timetable/dashboard har 5 seconds refresh hota hai. Available Socket.IO event update ko jaldi trigger karta hai; polling fallback hai.

Video isi website ke classroom page ke iframe mein khulti hai. Daily prejoin panel mein camera/microphone permission aur join complete karna hota hai. Class Start ka matlab server ne lesson live kiya; is se teacher ki actual media presence prove nahi hoti.

End Class database mein new joins band karta hai aur Daily se existing participants ko eject/room expire/delete karne ki request karta hai. Provider failure par warning aur Retry video cleanup hai. Already-connected video ki termination provider ki response par depend karti hai; scheduled expiry bhi configured hai. Sirf Leave video apne device ka panel band karta hai, lesson end nahi karta.

## 3. Pehle backup — existing system update kar rahe hain

Purane frontend/backend folders, database aur private `.env` ki backup lein. Working branch/commit save karein. Maintenance window mein **tamam old API instances stop** karein. Apni saved credentials/private data ko ZIP se overwrite na karein.

**Existing `CHAT_KEY` change na karein:** ye stored messages decrypt karne ke liye chahiye. Existing session secret, database connection aur SMTP settings preserve karein. ZIP mein real secrets nahi hain.

Dono folders ek parent folder mein extract karein:

```text
Quran-Academy/
  Quran_Backend-main/
  Quran_Frontend-main/
```

Existing project update karte waqt changed code merge/review karein; apne custom changes ki diff check karein. `PATCH_MANIFEST.json` uploaded ZIP se file comparison deta hai, live deployed repository se nahi. Old unused source folders compatibility/history ke liye rakhe gaye hain; runtime entry `src/server.js` aur frontend `src/main.jsx` hain. Legacy routes ko alag mount/run na karein.

## 4. Backend setup — Windows terminal / VS Code

Package engines Node **22.x** use karte hain. Terminal mein versions verify karein:

```bash
node -v
npm -v
cd Quran_Backend-main
npm ci
npm run setup
```

`npm run setup` sirf NEW `.env` banata aur random session/chat keys generate karta hai. Existing `.env` preserve hoti hai. Ab `.env` mein ye settings configure karein:

```dotenv
NODE_ENV=development
PORT=5000
MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING
PUBLIC_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173
TRUST_PROXY=0
DAILY_API_KEY=YOUR_PRIVATE_DAILY_SERVER_API_KEY
SMTP_HOST=YOUR_SMTP_HOST
SMTP_PORT=587
SMTP_USER=YOUR_SMTP_USER
SMTP_PASS=YOUR_SMTP_PASSWORD
SMTP_FROM="Your Academy <your-sender@example.com>"
```

`SESSION_SECRET` aur `CHAT_KEY` ki setup-generated values file mein rehne dein. Placeholder values ko actual settings se replace karein; `.env` public GitHub, frontend ya chat mein paste na karein.

MongoDB Atlas ya configured replica set chahiye, kyun ke booking lifecycle MongoDB transactions use karta hai. Sirf plain standalone MongoDB start karna transaction requirement fulfill nahi karta. Remote database ke correct network-access rules aur least-privilege database user use karein.

Existing authentication email OTP use karti hai. SMTP ke baghair registration/login verification complete nahi hogi; is release mein fake OTP ya authentication bypass nahi lagaya gaya.

### Daily account / API key

Daily developer dashboard mein apna account/domain configure karein aur server API key obtain karein. Us key ko **sirf backend `DAILY_API_KEY`** mein rakhein. Frontend mein `VITE_DAILY_API_KEY` ya koi long-lived secret nahi rakhna. Room create/token permissions aur account usage/billing status dashboard mein verify karein; this package free usage ka koi promise nahi karta.

Key missing ho to scheduling/library chal sakti hai, lekin Start Class descriptive configuration error dega aur student join unlock nahi hoga. Key save karne ke baad backend restart/redeploy karein.

### Database migration — existing database ke liye zaroori

Backup aur stopped API confirm karein. Pehle dry run:

```bash
npm run classroom:migrate
```

Plan review karne ke baad:

```bash
npm run classroom:migrate -- --apply
```

Is se room IDs backfill, per-class attendance index create aur incompatible old enrollment/day unique attendance index replace hota hai. Same din do classes ki attendance ab alag save ho sakti hai. Sirf unambiguous direct legacy attendance links migrate hoti hain; uncertain records ko guess ya delete nahi kiya jata. Script multiple DB operations karti hai, poori migration single atomic transaction nahi: error par backup/plan review karein, conflict resolve karein, phir rerun karein.

Agar old `ongoing` lessons legacy video use karte thay aur unhein scheduled reset karna hai, pehle flag ke saath dry run dekhein:

```bash
npm run classroom:migrate -- --reset-legacy-live
npm run classroom:migrate -- --apply --reset-legacy-live
```

Expired lesson restart nahi hogi; teacher new class schedule kare. Migration attendance/completion invent nahi karti. Existing users, fees aur messages retain hote hain. New empty database mein bhi dry run/apply use kiya ja sakta hai.

### Quran/Hadith data aur admin

```bash
npm run data:sync
npm run email:check
```

Data sync ko internet chahiye. Arabic Quran, English/Urdu translations aur installed Hadith editions download hoti hain. Package fake full Quran/Hadith dataset include nahi karta. Library unavailable ho to reading panel actionable error dikhata hai; video flow separate hai. Selected ayah ki audio external recitation host se stream hoti hai, offline guarantee nahi.

Fresh database ke liye hi, existing admin dobara create na karein:

```bash
npm run admin:create
```

Prompt mein apna admin name/email/password enter karein. Phir API start karein:

```bash
npm run dev
```

## 5. Frontend setup — second terminal

```bash
cd Quran_Frontend-main
npm ci
npm run dev
```

Browser mein `http://localhost:5173` kholein. Vite API/Socket requests local port 5000 par proxy karta hai. `localhost` aur `127.0.0.1` ko login ke darmiyan randomly mix na karein; origins/cookies ki settings consistent rakhein.

Teacher aur student ko separate browser profiles/devices mein login karayein. Same browser profile ke multiple tabs usually same login session share karte hain.

Phone se camera test ke liye staging HTTPS URL use karein. Sirf LAN IP par plain HTTP kholne ko production camera/microphone test na samjhein. Two-device headphones use karein taake feedback/echo kam ho.

## 6. Pehli class ka practical test

Admin teacher approve kare; student enrollment approve/active ho. Teacher aur student apne accounts mein verified hon. Teacher My timetable mein aisi class schedule kare jo current start window mein ho. Default configuration 10 minutes early start allow karti hai; end ke baad joining band hai. Duration existing academy booking setting se aati hai.

Student ke classroom page par Scheduled / Waiting for your teacher dekhein; Join button absent hona chahiye. Direct Join API bhi reject honi chahiye. Teacher Start kare, phir student Join unlock verify kare. Dono Daily prejoin complete karein, mic/camera enable karein, awaaz aur video dono directions mein test karein.

Teacher right panel se Surah/Ayah select karke Share with student press kare. Student Following teacher mein same reference dekhe. Student Hadith tab khol kar independent browse kare; teacher ki next update us independent browsing ko forcefully replace na kare. Follow teacher se shared reference wapas aaye. Notes teacher write/share kare; student read-only dekhe. Video panel resource switch par reload nahi hona chahiye.

Teacher actual attendance mark kare aur class assignment create kare. Student apni attendance/assignment dekhe aur existing assignment submission form use kare. End Class ke baad new joins reject, call disconnect aur lesson records retained verify karein. Unrelated student aur admin ke direct classroom URLs/API requests bhi test karein.

## 7. Classroom maintenance

Pending closures/expired rooms ka preview:

```bash
npm run classroom:cleanup
```

Approved cleanup:

```bash
npm run classroom:cleanup -- --apply
```

Server/task scheduler mein is command ko periodic interval par configure karein aur non-zero exit/failure logs monitor karein. Is package ne aapke hosting account par koi cron/job create nahi ki. Teacher ke Retry video cleanup button se bhi pending closure retry ho sakti hai. Job database/provider access wala trusted backend job hona chahiye, public unauthenticated endpoint nahi.

## 8. Deployment

Frontend `npm run build` se `dist` generate karein. Backend same-parent frontend `dist` serve kar sakta hai; alternate path ke liye backend `FRONTEND_DIST` set karein. Standalone API aur frontend ko deploy karna ho to same-origin `/api` and `/socket.io` proxy preserve karein.

Vercel configuration files included hain. Frontend `vercel.json` mein existing backend destinations preserve ki gayi hain: apne deployed backend URL se **API aur Socket.IO dono** destinations match karein. Backend environment dashboard mein secrets set karein. `PUBLIC_URL` aur `ALLOWED_ORIGINS` exact HTTPS frontend origin par set karein, `NODE_ENV=production` aur `TRUST_PROXY` apni real proxy topology ke mutabiq configure karein. Preview domains ko explicit approve karein; blanket origin wildcard na lagayein.

Backend deploy `npm run build` library sync karta hai. Us build environment ko source hosts tak internet access chahiye. Server/Vercel bundle mein downloaded `data` available honi chahiye. `LIBRARY_DATA_DIR` custom mount use kar rahe hon to synced data us location tak deploy/copy karein; sync script default backend `data/` mein likhti hai.

App CSP/iframe permissions Daily frames ko allow karti hain. Reverse proxy/hosting panel ka extra `Permissions-Policy: camera=()` ya restrictive frame policy video break kar sakta hai. Headers ko staging par inspect karein; zarurat par allowed Daily wildcard ko apne exact Daily subdomain tak tighten karein. Cross-origin iframe/mic/camera ka asli test required hai; mocked UI checks in headers ko validate nahi karte.

Socket.IO ki hosted transport/platform setup existing deployment ke mutabiq validate karein. Classroom status/reference polling fallback rakhta hai, lekin existing Messages/live notification transport ko alag test karna hoga. Video media Daily handle karta hai; Node API par raw media relay implement nahi hua.

## 9. Tests aur remaining acceptance work

```bash
# Backend pure unit tests: no external credentials required
npm test

# Frontend actual production build: run after npm ci
npm run build
```

Backend optional HTTP/MongoDB/SMTP integration:

```bash
npm run setup:test
# Edit .env.testing for a dedicated MongoDB database whose name ends in _test.
# Keep DAILY_API_KEY blank and RUN_DAILY_INTEGRATION=0 for the default suite.
npm run dev:test
# In another backend terminal:
npm run test:integration
```

Integration runner starts its local test SMTP capture; normal production OTP implementation is not bypassed. Never aim this suite at real academy data. `RUN_DAILY_INTEGRATION=1` is an explicit opt-in for creating/deleting real private Daily test rooms with a dedicated test key set in both test server/process. This can consume provider quota. Even that HTTP test does NOT transmit real video/audio; two-device media testing remains necessary.

Read `docs/CLASSROOM_TEST_REPORT.md` for exactly what was and was not executed.

## 10. Important boundaries

This is a **one-teacher / one-student** classroom implementation, matching the existing enrollment model. It is not a group-class/breakout-room system. Teacher/student cannot upload arbitrary books/PDFs into the side panel in this release: it supports installed Quran/Hadith editions and teacher notes. General screen sharing is available through the teacher's video provider controls where supported, but that is not a stored-document library.

Attendance is teacher-marked, not provider-verified join-duration tracking. Recording/transcription automation, payment gateway integration, a collaborative whiteboard, native mobile apps and media webhooks are not added. Existing payments remain the original workflow. Existing chat/user/calendar/bookings code is retained, not a claim that every old feature was re-audited.

Website embedding does not mean self-hosted media: Daily processes the video/audio connection. Publish an appropriate academy privacy notice and guardian/learner consent process before offering classes to children. Meeting tokens are short-lived bearer credentials; an authorized browser can inspect them. Do not describe them as impossible to copy. Avoid logging full iframe URLs, API response tokens, `.env` or private message contents.

## 11. Troubleshooting

| Problem | Check |
|---|---|
| Start says video not configured | Backend DAILY_API_KEY and restart/redeploy |
| Daily rejected credentials | Key/domain/account access; never paste key into frontend |
| Student Join missing | Teacher has not started; enrollment/account inactive; class outside time; refresh/network error |
| Start fails but room exists in Daily | Refresh and retry; deterministic ID can recover a partially completed provider request |
| Quran/Hadith missing | Run backend data:sync; verify deployed data files/mount |
| OTP email missing | SMTP configuration, sender authorization and email:check |
| Same-day second attendance fails | Stop API, back up DB and apply classroom migration |
| Transaction error | MongoDB replica set/Atlas and correct connection URI |
| Blank/blocked camera frame | HTTPS, device permissions, iframe/CSP/Permissions-Policy headers, network access |
| End shows cleanup warning | Retry video cleanup or run trusted cleanup job; inspect server/provider logs |
| Session or CSRF errors | Correct frontend origin, proxy paths, cookies and existing session secret |

## 12. Primary provider references used for this design

Daily Prebuilt: https://docs.daily.co/docs/prebuilt
Daily private rooms: https://docs.daily.co/reference/rest-api/rooms/create-room
Daily scoped meeting tokens: https://docs.daily.co/reference/rest-api/meeting-tokens/create-meeting-token
Daily room participant ejection: https://docs.daily.co/reference/rest-api/rooms/session/eject
100ms Prebuilt alternative: https://www.100ms.live/docs/prebuilt/v2/prebuilt/quickstart
Agora SDK alternative: https://docs.agora.io/en/realtime-media/rtc/get-started-sdk

Daily is selected as a fit for this existing project and embedded prebuilt UI, not claimed to be universally superior or cheapest. Documentation reviewed on 2 October 2026; verify provider account configuration and platform behavior during deployment.
