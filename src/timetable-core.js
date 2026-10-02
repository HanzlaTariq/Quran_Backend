/** Calendar calculations use IANA zones, never a fixed country offset or server-local time.
 * A recurring lesson is anchored to the teacher's wall clock. Each occurrence has its own
 * UTC instant. Nonexistent/ambiguous DST wall times are skipped and explicitly reported.
 * This module has no dependencies and is tested with node:test.
 */
import {fail, integer, text, choice} from './core.js';
export const DAY_NAMES = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
export const MINUTE = 60000, DAY = 86400000;
export const BOOKING_DEFAULTS = Object.freeze({slotMinutes:30,holdHours:24,bookingLeadHours:2,bookingWindowDays:60,joinEarlyMinutes:10,feeGraceDays:5});
const formatters = new Map(), offsetCache = new Map(), validatedZones = new Set();
export function timeZone(value) {
  const zone = text(value, 'Time zone', 1, 80);
  if(validatedZones.has(zone))return zone;
  // Reject fixed-offset strings; a region-based IANA zone keeps future DST meaningful.
  if (zone !== 'UTC' && !zone.includes('/')) fail(400, 'Choose an IANA time zone such as Asia/Karachi or America/New_York.');
  try { new Intl.DateTimeFormat('en', {timeZone:zone}).format(0); } catch { fail(400, 'This time zone is not recognized.'); }
  validatedZones.add(zone);return zone;
}
function formatter(zone) {
  if (!formatters.has(zone)) {
    timeZone(zone);
    if(formatters.size>600)formatters.clear();
    formatters.set(zone, new Intl.DateTimeFormat('en-CA', {timeZone:zone,calendar:'iso8601',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
  }
  return formatters.get(zone);
}
export function zonedParts(instant, zone) {
  const d = new Date(instant); if(!Number.isFinite(d.getTime()))fail(400,'Invalid time.');
  const p={}; for(const v of formatter(zone).formatToParts(d))if(v.type!=='literal')p[v.type]=v.value;
  return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`,year:+p.year,month:+p.month,day:+p.day,hour:+p.hour,minute:+p.minute,second:+p.second};
}
export function calendarDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail(400,'Use a date in YYYY-MM-DD format.');
  const [y,m,d]=value.split('-').map(Number), t=new Date(Date.UTC(y,m-1,d));
  if(y<2000||y>2200||t.toISOString().slice(0,10)!==value)fail(400,'Choose a valid calendar date between 2000 and 2200.');
  return value;
}
export const addDays = (value, days) => new Date(Date.parse(`${calendarDate(value)}T00:00:00Z`)+integer(days,'Days',-40000,40000)*DAY).toISOString().slice(0,10);
export function addMonths(value, months) {
  const [y,m,d]=calendarDate(value).split('-').map(Number);integer(months,'Months',0,120);
  const target=new Date(Date.UTC(y,m-1+months,1)), last=new Date(Date.UTC(target.getUTCFullYear(),target.getUTCMonth()+1,0)).getUTCDate();
  target.setUTCDate(Math.min(d,last)); return target.toISOString().slice(0,10);
}
export const weekday = day => (new Date(`${calendarDate(day)}T00:00:00Z`).getUTCDay()+6)%7;
export function minutes(value, end=false) {
  if(end && (value==='24:00'||value==='00:00'))return 1440;
  if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))fail(400,'Use 24-hour times, for example 18:30.');
  return +value.slice(0,2)*60 + +value.slice(3);
}
export const clock = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
function offsetAt(instant,zone) {
  const p=zonedParts(instant,zone);
  return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-Math.floor(instant/1000)*1000;
}
/** All exact instants matching the local time. Zero = DST gap; two = repeated hour. */
export function possibleInstants(day, localTime, zone) {
  calendarDate(day); const m=minutes(localTime);timeZone(zone);
  const wall=Date.parse(`${day}T00:00:00Z`)+m*MINUTE,key=`${zone}:${day}`;
  let offsets=offsetCache.get(key);
  if(!offsets){
    offsets=new Set();const noon=Date.parse(`${day}T12:00:00Z`);
    for(let h=-48;h<=48;h+=6)offsets.add(offsetAt(noon+h*60*MINUTE,zone));
    if(offsetCache.size>12000)offsetCache.clear();offsetCache.set(key,offsets);
  }
  const candidates=[];
  for(const offset of offsets){const t=wall-offset,p=zonedParts(t,zone);if(p.date===day&&p.time===localTime&&p.second===0)candidates.push(t);}
  return [...new Set(candidates)].sort((a,b)=>a-b);
}
export function localInstant(day, localTime, zone) {
  const possible=possibleInstants(day,localTime,zone);
  if(!possible.length)fail(400,'This local time does not exist because the clocks change. Choose another time.');
  if(possible.length!==1)fail(400,'This local time occurs twice because the clocks change. Choose a time outside the repeated hour.');
  return new Date(possible[0]);
}
export function normalizeAvailability(value) {
  if(!Array.isArray(value)||value.length>28)fail(400,'Use at most 28 availability windows.');
  const result=value.map(s=>{
    if(!s||typeof s!=='object')fail(400,'Invalid availability window.');
    const day=choice(s.day,DAY_NAMES,'Day'),start=minutes(s.startTime),end=minutes(s.endTime,true);
    if(end<=start)fail(400,'Availability must end after it starts. Split overnight availability across two days.');
    return {day,startTime:clock(start),endTime:clock(end),isActive:s.isActive!==false};
  }).sort((a,b)=>DAY_NAMES.indexOf(a.day)-DAY_NAMES.indexOf(b.day)||minutes(a.startTime)-minutes(b.startTime));
  for(let i=0;i<result.length;i++)for(let j=i+1;j<result.length;j++)if(result[i].isActive&&result[j].isActive&&result[i].day===result[j].day&&minutes(result[j].startTime)<minutes(result[i].endTime,true))fail(400,'Availability windows on the same day must not overlap.');
  return result;
}
export function withinAvailability(availability, day, localTime, duration) {
  const start=minutes(localTime),end=start+duration;
  return availability.some(s=>s.isActive!==false&&s.day===DAY_NAMES[weekday(day)]&&start>=minutes(s.startTime)&&end<=minutes(s.endTime,true)&&(start-minutes(s.startTime))%duration===0);
}
export function slotOccurrence(day, localTime, duration, zone) {
  const starts=possibleInstants(day,localTime,zone);
  if(starts.length!==1)return {skipped:{date:day,time:localTime,reason:starts.length?'Repeated local time (DST)':'Nonexistent local time (DST)'}};
  const start=starts[0],end=start+duration*MINUTE,endWall=minutes(localTime)+duration;
  if(endWall>1440)fail(400,'A weekly slot cannot cross midnight.');
  const expectedDate=endWall===1440?addDays(day,1):day,expectedTime=endWall===1440?'00:00':clock(endWall);
  const p=zonedParts(end,zone);
  if(p.date!==expectedDate||p.time!==expectedTime||possibleInstants(expectedDate,expectedTime,zone).length!==1)return {skipped:{date:day,time:localTime,reason:'Lesson crosses a clock change (DST)'}};
  return {utcStart:new Date(start),utcEnd:new Date(end),teacherDate:day,day:DAY_NAMES[weekday(day)],startTime:localTime};
}
export function buildOccurrences({firstDate,untilDate,timeZone:zone,slots,slotMinutes}) {
  calendarDate(firstDate);calendarDate(untilDate);timeZone(zone);integer(slotMinutes,'Slot duration',5,120);
  if(untilDate<=firstDate||Date.parse(untilDate)-Date.parse(firstDate)>3670*DAY)fail(400,'Invalid course schedule period.');
  if(!Array.isArray(slots)||!slots.length||slots.length>7)fail(400,'Choose between one and seven weekly lessons, at most one per teacher weekday.');
  const seen=new Set();for(const s of slots){choice(s.day,DAY_NAMES,'Day');minutes(s.startTime);if(seen.has(s.day))fail(400,'Choose only one weekly slot on each teacher weekday.');seen.add(s.day);}
  const items=[],skipped=[];
  for(let d=firstDate;d<untilDate;d=addDays(d,1)){
    for(const s of slots.filter(v=>v.day===DAY_NAMES[weekday(d)])){
      const item=slotOccurrence(d,s.startTime,slotMinutes,zone);if(item.skipped)skipped.push(item.skipped);else items.push(item);
    }
  }
  if(items.length>4000)fail(400,'The schedule is too large. Shorten the course duration.');
  return {items,skipped};
}
export const overlaps = (a,b) => +new Date(a.utcStart)<+new Date(b.utcEnd)&&+new Date(a.utcEnd)>+new Date(b.utcStart);
export function firstConflict(items,busy) {
  // Busy intervals sorted once; no student identities are returned to public callers.
  const sorted=[...busy].sort((a,b)=>+new Date(a.utcStart)-+new Date(b.utcStart));
  for(const item of items)for(const b of sorted){if(+new Date(b.utcStart)>=+new Date(item.utcEnd))break;if(overlaps(item,b))return {item,busy:b};}
  return null;
}
export function bookingSettings(config={}) {
  const source=config.booking||config, out={...BOOKING_DEFAULTS};
  for(const key of Object.keys(out))if(source[key]!==undefined)out[key]=Number(source[key]);
  choice(out.slotMinutes,[15,20,30,45,60,90,120],'Lesson duration');
  integer(out.holdHours,'Pending hold hours',1,168);integer(out.bookingLeadHours,'Minimum notice hours',0,168);
  integer(out.bookingWindowDays,'Advance booking window',7,180);integer(out.joinEarlyMinutes,'Early classroom entry',0,30);integer(out.feeGraceDays,'Fee grace days',0,30);
  return out;
}
export function invoicePlan(schedule,duration) {
  const n=integer(duration,'Course duration',1,120),out=[];
  for(let i=0;i<n;i++){
    const start=addMonths(schedule.firstDate,i),end=addMonths(schedule.firstDate,i+1);
    // Noon avoids ordinary midnight DST transitions; exact conversion is still checked.
    out.push({billingPeriod:start,billingStart:localInstant(start,'12:00',schedule.timeZone),billingEnd:localInstant(end,'12:00',schedule.timeZone),dueDate:localInstant(start,'12:00',schedule.timeZone)});
  }
  return out;
}

/** Start of a viewer calendar day, including regions that move clocks at midnight.
 * This is for date-range filtering, not selecting a lesson's ambiguous time. */
export function dayBoundary(day,zone){for(let m=0;m<1440;m+=15){const p=possibleInstants(day,clock(m),zone);if(p.length)return new Date(p[0]);}fail(400,'This calendar date was skipped in the selected time zone. Choose another date.');}
