import {writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const path=new URL('../.env.testing',import.meta.url);
try{await access(path);console.log('.env.testing already exists; nothing changed. Check docs/BOOKING_UPDATE.md for the required local SMTP test settings.');}
catch{const data=`# Dedicated isolated testing only. NEVER point this at your real academy database.
NODE_ENV=test
PORT=5001
MONGODB_URI=mongodb://127.0.0.1:27017/noor_academy_test?replicaSet=rs0
SESSION_SECRET=${randomBytes(32).toString('hex')}
CHAT_KEY=${randomBytes(32).toString('hex')}
ALLOWED_ORIGINS=http://localhost:5173
PUBLIC_URL=http://localhost:5173
TRUST_PROXY=0
SOCKET_ADAPTER=memory
SMTP_HOST=127.0.0.1
SMTP_PORT=2526
SMTP_USER=
SMTP_PASS=
SMTP_FROM=\"Noor test <noor@example.test>\"
EMAIL_USER=
EMAIL_PASSWORD=
DAILY_API_KEY=
RUN_DAILY_INTEGRATION=0
RUN_INTEGRATION=1
TEST_BASE_URL=http://127.0.0.1:5001
`;
 await writeFile(path,data,{mode:0o600});console.log('Created .env.testing. Set a dedicated Atlas/replica-set URI ending in _test. Do not put real email credentials in this file.');}
