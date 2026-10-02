import {readFile,writeFile,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
const env=new URL('../.env',import.meta.url);
try {await access(env);console.log('.env already exists; preserved without changes.');}
catch {let template=await readFile(new URL('../.env.example',import.meta.url),'utf8');template=template.replaceAll('REPLACE_WITH_64_HEX_CHARACTERS',()=>randomBytes(32).toString('hex'));await writeFile(env,template,{mode:0o600});console.log('Created .env with private session/encryption keys. Keep this file backed up and never commit it.');}
console.log('Next: configure MONGODB_URI, SMTP_* and DAILY_API_KEY. Read START_HERE_CLASSROOM.md before migrating an existing database.');
