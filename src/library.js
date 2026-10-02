import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {resolve,sep} from 'node:path';
import { fail, integer, normalize, paginate, choice, text } from './core.js';
const dir = process.env.LIBRARY_DATA_DIR ? resolve(process.env.LIBRARY_DATA_DIR)+sep : fileURLToPath(new URL('../data/', import.meta.url));
const cache = new Map();
const books = [
  {id:'bukhari', name:'Sahih al-Bukhari', arabic:'صحيح البخاري', languages:['eng','ara','urd'], description:'The collection of Imam al-Bukhari.'},
  {id:'muslim', name:'Sahih Muslim', arabic:'صحيح مسلم', languages:['eng','ara','urd'], description:'The collection of Imam Muslim.'},
  {id:'nawawi', name:'Forty Hadith of an-Nawawi', arabic:'الأربعون النووية', languages:['eng','ara'], description:'A foundational collection compiled by Imam an-Nawawi.'}
];
async function load(name) {
  const file = `${dir}${name}.json`;
  let info; try {info = await stat(file);} catch {fail(503, 'Library data is not installed yet. Run npm run data:sync in the backend, then refresh.');}
  const old = cache.get(name); if (old?.mtime === info.mtimeMs) return old.value;
  const value = JSON.parse(await readFile(file,'utf8'));
  cache.set(name,{mtime:info.mtimeMs,value}); return value;
}
export async function libraryStatus() {
  let manifest = null; try {manifest = await load('manifest');} catch {}
  return {ready:!!manifest, manifest, books, sources:{quran:'https://alquran.cloud/api',hadith:'https://github.com/fawazahmed0/hadith-api'}};
}
export async function surahs() { const q = await load('quran'); return q.surahs.map(({ayahs,...rest})=>({...rest,numberOfAyahs:ayahs.length})); }
export async function surah(number) { const n=integer(number,'Surah',1,114); const q=await load('quran'); return q.surahs[n-1]; }
export async function searchQuran(query) {
  const keyword=normalize(text(query.q,'Search',2,100)); const q = await load('quran'), hits=[];
  for(const s of q.surahs) for(const a of s.ayahs) {
    if ([a.text,a.en,a.ur].some(v=>normalize(v).includes(keyword)) || `${s.number}:${a.numberInSurah}`===keyword) hits.push({...a,surah:s.number,surahName:s.englishName});
  }
  return paginate(hits,query,12);
}
export async function hadithBooks() {
  return Promise.all(books.map(async b=>{
    try {const d=await load(`eng-${b.id}`);return {...b,available:true,total:d.hadiths.filter(h=>h.text?.trim()).length};}
    catch {return {...b,available:false,total:null};}
  }));
}
export async function hadiths(query) {
  const book=choice(query.book || 'bukhari',books.map(b=>b.id),'Collection'), def=books.find(b=>b.id===book);
  const lang=choice(query.lang || 'eng',def.languages,'Language');
  const d=await load(`${lang}-${book}`); const q=query.q?normalize(text(query.q,'Search',1,100)):'';
  let items=d.hadiths.filter(h=>h.text?.trim());
  if(query.section) items=items.filter(h=>String(h.reference?.book)===String(query.section));
  if(q) items=items.filter(h=>/^\d+(?:\.\d+)?$/.test(q)?String(h.hadithnumber)===q:normalize(h.text).includes(q));
  return {...paginate(items,query,10), book:def,lang,sections:d.metadata.sections,source:`https://github.com/fawazahmed0/hadith-api/blob/1/editions/${lang}-${book}.json`};
}
export async function daily() {
  const q=await load('quran'); const day=Math.floor(Date.now()/86400000);
  const all=q.surahs.flatMap(s=>s.ayahs.map(a=>({...a,surah:s.number,surahName:s.englishName})));
  return all[day % all.length];
}
