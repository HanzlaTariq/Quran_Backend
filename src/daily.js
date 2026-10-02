/** Server-only Daily REST client. API keys and provider error bodies never reach the browser. */
import {AppError, fail} from './core.js';
import {dailyRoomPayload,dailyTokenPayload,roomNameFor,validateDailyRoom} from './classroom-core.js';
const BASE='https://api.daily.co/v1';
export const dailyReady=()=>!!process.env.DAILY_API_KEY?.trim();
export function dailyClient({apiKey=process.env.DAILY_API_KEY,fetchImpl=globalThis.fetch}={}) {
  async function request(path,{method='GET',body,allowMissing=false}={}) {
    if (!apiKey?.trim()) fail(503,'Live video is not configured. Ask the academy administrator to set DAILY_API_KEY on the backend.');
    let response;
    try {
      response=await fetchImpl(BASE+path,{method,headers:{Authorization:`Bearer ${apiKey.trim()}`,Accept:'application/json','Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(12000)});
    } catch { fail(502,'Daily could not be reached. No new classroom access was granted; please retry.'); }
    if (allowMissing && response.status===404) return null;
    let data=null;try {data=await response.json();} catch {}
    if (!response.ok) {
      const message=response.status===401||response.status===403?'Daily rejected the server credentials. The administrator must check the Daily API key.':response.status===429?'The video service is busy. Please wait a moment and retry.':'Daily could not complete the classroom request. Please retry or contact the academy.';
      const error=new AppError(response.status===429?503:502,message);
      error.providerStatus=response.status;throw error;
    }
    return data;
  }
  async function ensureRoom(lesson) {
    const payload=dailyRoomPayload(lesson),path=`/rooms/${encodeURIComponent(payload.name)}`;
    let room=await request(path,{allowMissing:true});
    if (!room) {
      try { room=await request('/rooms',{method:'POST',body:payload}); }
      catch(error) {
        // A prior timed-out POST may already have created the same deterministic room.
        room=await request(path,{allowMissing:true}).catch(()=>null);
        if (!room) throw error;
      }
    }
    validateDailyRoom(room,payload.name);
    // Enforce our policy even if a room survived a partially failed earlier start.
    room=await request(path,{method:'POST',body:{privacy:'private',properties:payload.properties}});
    return {name:payload.name,url:validateDailyRoom(room,payload.name),expiresAt:new Date(lesson.utcEnd)};
  }
  async function token(lesson,user) {
    const body=dailyTokenPayload(lesson,user),data=await request('/meeting-tokens',{method:'POST',body});
    if (typeof data?.token!=='string' || data.token.length<20) fail(502,'Daily did not return a meeting token.');
    return {token:data.token,expiresAt:new Date(body.properties.exp*1000)};
  }
  async function closeRoom(lesson,userIds=[]) {
    const path=`/rooms/${encodeURIComponent(roomNameFor(lesson))}`;
    // Expire at provider level, eject current participants, then remove the room.
    // Do not rely only on deleting a room to terminate existing media sessions.
    let expiry=false,ejected=false,missing=false;
    try { const room=await request(path,{method:'POST',body:{privacy:'private',properties:{exp:Math.floor(Date.now()/1000)+1,eject_at_room_exp:true}},allowMissing:true});expiry=!!room;missing=room===null; } catch {}
    if (!missing && userIds.length) {
      try { await request(`${path}/eject`,{method:'POST',body:{user_ids:[...new Set(userIds.map(String))],ban:true},allowMissing:true});ejected=true; } catch {}
    }
    if (!expiry && !ejected && !missing) fail(502,'The class is closed in the academy, but Daily closure needs a retry. Use Retry video cleanup; the scheduled room expiry remains in place.');
    await request(path,{method:'DELETE',allowMissing:true});
    return {closed:true};
  }
  return {request,ensureRoom,token,closeRoom};
}
