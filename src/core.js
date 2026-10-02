import { randomBytes, createHash, createHmac, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';
export class AppError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const fail = (status, message) => { throw new AppError(status, message); };
export const token = () => randomBytes(32).toString('hex');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const sign = (value, secret) => createHmac('sha256', secret).update(value).digest('hex');
export function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function text(value, name, min = 1, max = 200) {
  if (typeof value !== 'string') fail(400, `${name} must be text.`);
  const v = value.trim();
  if (v.length < min || v.length > max) fail(400, `${name} must be ${min}–${max} characters.`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(v)) fail(400, `${name} contains unsupported characters.`);
  return v;
}
export function integer(value, name, min, max) {
  if(!['string','number'].includes(typeof value)||String(value).trim()==='')fail(400,`${name} must be a number.`);
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(400, `${name} must be between ${min} and ${max}.`);
  return n;
}
export function money(value) {
  if(!['string','number'].includes(typeof value)||String(value).trim()==='')fail(400,'Enter a valid non-negative amount.');
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 10000000) fail(400, 'Enter a valid non-negative amount.');
  return Math.round(n * 100) / 100;
}
export function email(value) {
  const v = text(value, 'Email', 5, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) fail(400, 'Enter a valid email address.');
  return v;
}
export function password(value) {
  if (typeof value !== 'string' || value.length < 10 || Buffer.byteLength(value) > 72) fail(400, 'Use a password of at least 10 characters and at most 72 UTF-8 bytes.');
  return value;
}
export function id(value) {
  if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) fail(400, 'Invalid record ID.');
  return value;
}
export const same = (a,b) => String(a?._id || a) === String(b?._id || b);
export function choice(value, allowed, name='Value') {
  if (!allowed.includes(value)) fail(400, `${name} is not supported.`);
  return value;
}
export function date(value) { const d = new Date(value); if (!value || !Number.isFinite(d.getTime())) fail(400, 'Enter a valid date/time.'); return d; }
export function safeUrl(value) {
  if (!value) return '';
  let u; try { u = new URL(value); } catch { fail(400, 'Use a complete HTTPS URL.'); }
  if (u.protocol !== 'https:' || u.username || u.password) fail(400, 'Only HTTPS links are allowed.');
  return u.href;
}
export function normalize(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u0300-\u036f]/g, '')
    .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ک/g,'ك').replace(/ی/g,'ي').toLowerCase().trim();
}
export function pageParams(query, fallback = 20) {
  return {page: integer(query.page ?? 1, 'Page', 1, 100000), limit: integer(query.limit ?? fallback, 'Page size', 1, 100)};
}
export function paginate(items, query, fallback = 20) {
  const {page, limit} = pageParams(query, fallback);
  return {items: items.slice((page-1)*limit, page*limit), total: items.length, page, pages: Math.max(1, Math.ceil(items.length / limit))};
}
export function encrypt(value, hexKey) {
  const key = Buffer.from(hexKey, 'hex'); if (key.length !== 32) throw new Error('CHAT_KEY must contain 64 hex characters.');
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(String(value), 'utf8'), c.final()]);
  return `enc:v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${body.toString('base64')}`;
}
export function decrypt(value, hexKey) {
  if (!String(value).startsWith('enc:v1:')) return String(value || ''); // Legacy records; migrate with messages:encrypt.
  const parts = value.split(':'), d = createDecipheriv('aes-256-gcm', Buffer.from(hexKey,'hex'), Buffer.from(parts[2],'base64'));
  d.setAuthTag(Buffer.from(parts[3],'base64'));
  return Buffer.concat([d.update(Buffer.from(parts[4],'base64')), d.final()]).toString('utf8');
}
export function csvCell(value) {
  let s = String(value ?? ''); if (/^[\s\uFEFF]*[=+@\-]|^[\t\r\n]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"','""')}"`;
}
