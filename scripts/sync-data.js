/** Downloads exact provider text; never generates religious content. */
import {mkdir, writeFile, rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('../data/',import.meta.url)); await mkdir(dir,{recursive:true});
const manifest={downloadedAt:new Date().toISOString(),files:[]};
async function fetchJSON(url) {
  let last;
  for(let attempt=0;attempt<3;attempt++) {
    try {const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return await r.json();}
    catch(e){last=e;await new Promise(r=>setTimeout(r,1000*(attempt+1)));}
  }
  throw new Error(`Unable to download ${url}: ${last.message}`);
}
async function save(name,value,sources) {
  const body=JSON.stringify(value);await writeFile(`${dir}${name}.json.tmp`,body);await rename(`${dir}${name}.json.tmp`,`${dir}${name}.json`);
  manifest.files.push({file:`${name}.json`,sources,sha256:createHash('sha256').update(body).digest('hex')});
  console.log(`Saved ${name}`);
}
try {
  const editions=['quran-uthmani','en.sahih','ur.jalandhry'];const q=[];const urls=[];
  for(const ed of editions){const u=`https://api.alquran.cloud/v1/quran/${ed}`;console.log(`Downloading ${ed}…`);const d=await fetchJSON(u);if(d.code!==200 || d.data?.surahs?.length!==114)throw new Error(`Invalid Quran edition: ${ed}`);q.push(d.data);urls.push(u);}
  let total=0;
  const surahs=q[0].surahs.map((s,i)=>({...s,ayahs:s.ayahs.map((a,j)=>{
    const en=q[1].surahs[i].ayahs[j],ur=q[2].surahs[i].ayahs[j];
    if(a.number!==en?.number || a.number!==ur?.number || a.numberInSurah!==en?.numberInSurah)throw new Error('Translation alignment validation failed.');
    total++;
    return {...a,en:en.text,ur:ur.text,audio:`https://cdn.islamic.network/quran/audio/128/ar.alafasy/${a.number}.mp3`};
  })}));
  if(total!==6236)throw new Error(`Unexpected verse count: ${total}`);
  await save('quran',{editions:q.map(x=>x.edition),surahs},urls);
  for(const book of ['bukhari','muslim','nawawi'])for(const lang of (book==='nawawi'?['ara','eng']:['ara','eng','urd'])){
    const name=`${lang}-${book}`;const url=`https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${name}.min.json`;
    console.log(`Downloading ${name}…`);let d;let source=url;
    try {d=await fetchJSON(url);}catch {source=`https://raw.githubusercontent.com/fawazahmed0/hadith-api/1/editions/${name}.min.json`;d=await fetchJSON(source);}
    if(!Array.isArray(d.hadiths)||!d.hadiths.length||!d.metadata?.name)throw new Error(`Invalid Hadith edition: ${name}`);
    await save(name,d,[source]);
  }
  await writeFile(`${dir}manifest.json.tmp`,JSON.stringify(manifest,null,2));await rename(`${dir}manifest.json.tmp`,`${dir}manifest.json`);
  console.log('Library ready. 114 surahs and 8 Hadith editions installed. Audio still requires internet.');
}catch(e){console.error(e.message);console.error('No text was invented. Check internet connectivity and run data:sync again. Completed downloads remain cached.');process.exitCode=1;}
