import {fail,text,choice,integer} from './core.js';
import {timeZone} from './timetable-core.js';
export function languages(value,required=true){
  const a=typeof value==='string'?value.split(','):value;
  if(!Array.isArray(a)||a.length>12)fail(400,'Enter up to 12 languages.');
  const result=[...new Set(a.filter(v=>typeof v!=='string'||v.trim()).map(v=>text(v,'Language',1,40).toLowerCase()))];
  if(required&&!result.length)fail(400,'Choose at least one language.');return result;
}
export function profileFields(body,{required=false}={}){
  const out={};
  const rules={name:['Full name',2,80],phone:['Phone',0,30],country:['Country',required?2:0,80],city:['City / location',0,100]};
  for(const [key,args] of Object.entries(rules))if(body[key]!==undefined||required)out[key]=text(body[key]??'',...args);
  if(body.timezone!==undefined||required)out.timezone=timeZone(body.timezone);
  if(body.languages!==undefined||required)out.languages=languages(body.languages);
  if(body.gender!==undefined||required)out.gender=choice(body.gender||'unspecified',['male','female','unspecified'],'Gender');
  if(body.age!==undefined)out.age=body.age===''||body.age===null?null:integer(body.age,'Age',3,120);
  return out;
}
/** Only small JPEG raster avatars are accepted. The browser re-encodes PNG/WebP/JPEG
 * uploads to JPEG, dropping original metadata. SVG/HTML and external fetching are not supported.
 */
export function avatarBytes(value){
  if(typeof value!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))fail(400,'Upload a JPG, PNG or WebP photo using the photo picker.');
  const bytes=Buffer.from(value.slice('data:image/jpeg;base64,'.length),'base64');
  if(bytes.length>200*1024||bytes.length<10)fail(400,'The processed photo must be smaller than 200 KB.');
  if(bytes.readUInt16BE(0)!==0xffd8||bytes.readUInt16BE(bytes.length-2)!==0xffd9)fail(400,'Invalid JPEG photo.');
  let pos=2,dimensions=null;
  while(pos+4<=bytes.length){
    if(bytes[pos++]!==0xff)break;let marker=bytes[pos++];while(marker===0xff&&pos<bytes.length)marker=bytes[pos++];
    if(marker===0xda||marker===0xd9)break;
    if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    if(pos+2>bytes.length)break;const length=bytes.readUInt16BE(pos);if(length<2||pos+length>bytes.length)break;
    if([0xc0,0xc1,0xc2].includes(marker)&&length>=8)dimensions={height:bytes.readUInt16BE(pos+3),width:bytes.readUInt16BE(pos+5)};
    pos+=length;
  }
  if(!dimensions||dimensions.width<1||dimensions.height<1||dimensions.width>768||dimensions.height>768)fail(400,'Use a photo no larger than 768 × 768 after processing.');
  return bytes;
}
