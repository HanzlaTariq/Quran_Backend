/** Pure classroom policy and provider payloads; no database or network access. */
import {createHash} from 'node:crypto';
import {fail, integer, choice, text} from './core.js';

export const DEFAULT_RESOURCE = Object.freeze({kind:'quran',surah:1,ayah:1,translation:'en'});
export function roomNameFor(lesson) {
  const value = lesson.roomId || `quran-class-${String(lesson._id)}`;
  if (!/^quran-class-[a-f0-9]{24}$/i.test(value)) fail(500,'Invalid classroom room ID.');
  return value;
}
export function classroomActions(lesson, user, config, now = Date.now()) {
  const start = +new Date(lesson.utcStart), end = +new Date(lesson.utcEnd);
  const opens = start - config.joinEarlyMinutes * 60000;
  const within = now >= opens && now < end;
  const active = ['active','approved'].includes(lesson.enrollment?.status || lesson.enrollmentStatus || '');
  const teachingRole = user.role === 'ulma';
  const ready = !!lesson.liveRoom?.readyAt && !!lesson.startedAt;
  // Room URLs, old external meeting links and operation locks never appear in list/detail responses.
  const {liveRoom, operationLock, meetingLink, recordingUrl, ...safe} = lesson;
  return {
    ...safe, roomId:roomNameFor(lesson), provider:'daily',
    teachingResource:lesson.teachingResource || {...DEFAULT_RESOURCE},
    resourceVersion:lesson.resourceVersion || 0,
    sharedNotes:lesson.sharedNotes || '',
    canStart:teachingRole && active && lesson.status === 'scheduled' && within,
    canJoin:['student','ulma'].includes(user.role) && active && lesson.status === 'ongoing' && ready && within,
    canEdit:teachingRole && now<end && ['scheduled','ongoing','paused'].includes(lesson.status),
    isExpired:now >= end,
    joinOpensAt:new Date(opens),
    closePending:!!liveRoom?.closePending,
  };
}
export function assertParticipantRole(user) {
  if (!['student','ulma'].includes(user?.role)) fail(403,'Classrooms, assignments and attendance belong to teachers and students.');
}
export function assertTeacherRole(user) {
  if (user?.role !== 'ulma') fail(403,'Only the assigned teacher can perform this teaching action.');
}
export function validateResource(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400,'Choose a learning resource.');
  const kind = choice(input.kind,['quran','hadith','notes'],'Resource');
  if (kind === 'notes') return {kind};
  if (kind === 'quran') return {
    kind, surah:integer(input.surah,'Surah',1,114), ayah:integer(input.ayah,'Ayah',1,286),
    translation:choice(input.translation || 'en',['none','en','ur','both'],'Translation'),
  };
  const book = choice(input.book,['bukhari','muslim','nawawi'],'Hadith collection');
  const lang = choice(input.lang || 'eng',book === 'nawawi'?['eng','ara']:['eng','ara','urd'],'Hadith language');
  const hadithNumber = text(String(input.hadithNumber ?? ''),'Hadith number',1,12);
  if (!/^\d+(?:\.\d+)?$/.test(hadithNumber)) fail(400,'Enter a Hadith number, for example 1 or 1.1.');
  return {kind,book,lang,hadithNumber};
}
export function dailyRoomPayload(lesson, now=Date.now()) {
  const end = Math.floor(+new Date(lesson.utcEnd)/1000);
  if (end <= Math.floor(now/1000)) fail(409,'This lesson time has ended.');
  return {name:roomNameFor(lesson), privacy:'private', properties:{
    exp:end, eject_at_room_exp:true, max_participants:2,
    enable_knocking:false, enforce_unique_user_ids:true,
    enable_prejoin_ui:true, enable_chat:true, enable_screenshare:true,
    enable_people_ui:true, enable_network_ui:true,
    start_video_off:true, start_audio_off:true,
  }};
}
export function dailyTokenPayload(lesson,user,now=Date.now()) {
  assertParticipantRole(user);
  const exp = Math.floor(+new Date(lesson.utcEnd)/1000);
  if (exp <= Math.floor(now/1000)) fail(409,'This lesson time has ended.');
  return {properties:{
    room_name:roomNameFor(lesson), user_id:String(user._id),
    user_name:text(user.name,'Display name',1,100), is_owner:user.role === 'ulma',
    nbf:Math.floor(now/1000)-30, exp, eject_at_token_exp:true,
    enable_prejoin_ui:true, enable_screenshare:user.role === 'ulma',
    enable_recording_ui:false, start_cloud_recording:false,
    auto_start_transcription:false, start_video_off:true, start_audio_off:true,
  }};
}
export function validateDailyRoom(room, expectedName) {
  let url;
  try { url = new URL(room.url); } catch { fail(502,'Daily returned an invalid room URL.'); }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.daily\.co$/i.test(url.hostname) || url.port || url.username || url.password || url.search || url.hash || url.pathname !== `/${expectedName}` || room.name !== expectedName || room.privacy !== 'private') {
    fail(502,'Daily did not return the expected private classroom.');
  }
  return url.href;
}
// A stable request fingerprint is useful in diagnostics without logging credentials.
export const classFingerprint = id => createHash('sha256').update(String(id)).digest('hex').slice(0,12);
