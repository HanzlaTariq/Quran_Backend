# Noor 2.1 — pehle yeh parhein

Yeh sirf **new/updated files** ka patch hai, complete project nahi.

1. Dono repositories aur MongoDB ka backup lein. Dono servers stop karein.
2. ZIP ke `backend` ke **andar wali files** existing backend repo root mein copy/merge karein. `frontend` ki files frontend repo root mein. Extra nested folder na banayein aur purana `src` poora delete na karein.
3. Apni `.env`, existing `SESSION_SECRET`, `CHAT_KEY`, Atlas URI, library `data` aur customized `vercel.json` bilkul rehne dein. Nayi example `.env` ko apni actual settings par blindly copy na karein.
4. Backend SMTP configure karein: **OTP ab signup aur har login par mandatory hai**, admin ke liye bhi. Purane `EMAIL_*` names bhi supported hain; nonempty `SMTP_*` names ko preference milti hai. Exposed/purana app password revoke karke naya private password lagayein.

```bat
:: Backend terminal
cd /d F:\Quran\Quran_Backend
npm run email:check
npm run schedule:audit
npm test
npm run dev

:: Alag frontend terminal
cd /d F:\Quran\Quran_Frontend
npm run dev
```

`email:check` SMTP connection/authentication check karta hai; actual OTP ki inbox delivery alag test karein. `schedule:audit` read-only hai: purani classes/fees delete ya automatically rewrite nahi karta. Booking ke liye Atlas/replica-set chahiye.

## Dashboard par yeh order follow karein

**Admin:** OTP login → courses publish → Settings mein 30-minute ya apni required duration set → verified teacher approve.

**Teacher:** email verify → admin approval → OTP login → Settings mein country, time zone, languages, photo, courses aur weekly free hours save.

**Student:** OTP login → course/teacher select → apne local time mein weekly slots choose → preview → submit.

**Admin:** enrollment approve → automatic dated classes + monthly invoices. Student aur teacher Classes page par apne time zone mein same timetable dekhte hain.

Teacher scheduled window mein **Start & join class** kare; enrolled student **Join class** kare. Camera/mic, HTTPS, TURN/network aur actual Vercel testing ab bhi zaroori hai.

## Purana data

Purani ambiguous enrollment ko bina review ke naya time nahi diya gaya. Admin `schedule:audit` report dekh kar old enrollment/classes/payments review kare, phir zarurat par explicitly rebook kare. Pehle se paid course ko bina reconciliation dobara full-fee approve na karein. Purani teacher photo ka actual file server par missing ho to dobara upload karna hoga.

## Detail aur verification

- `docs/BOOKING_UPDATE.md` — full setup, workflow, SMTP, DST/billing rules, deployment and isolated integration testing.
- `docs/BOOKING_TEST_REPORT.md` — executed checks and what remains unverified.

**97 unit tests pass hain; real Atlas integration, real inbox delivery, installed frontend build, Vercel aur two-device call yahan verify nahi hue.** Frontend repo mein `npm run build` aur full three-role acceptance flow apne setup par check karke push karein.
