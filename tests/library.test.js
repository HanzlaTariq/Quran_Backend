import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Temporary, explicitly non-religious fixtures. Never write test text to backend/data.
test('library contracts using isolated temporary non-religious fixture files',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'noor-library-test-'));const old=process.env.LIBRARY_DATA_DIR;process.env.LIBRARY_DATA_DIR=dir;
 const lib=await import(`../src/library.js?test=${Date.now()}`);
 try{
  await t.test('missing data returns actionable service-unavailable error',async()=>{await assert.rejects(lib.surah(1),e=>e.status===503&&e.message.includes('data:sync'));});
  const surahs=Array.from({length:114},(_,i)=>({number:i+1,englishName:`TEST SURAH ${i+1}`,name:'TEST METADATA',ayahs:[{number:i+1,numberInSurah:1,text:i===0?'تَجْرِبَة':'TEST CONTENT, NOT SCRIPTURE',en:i===0?'Unique testkeyword — not a translation.':'Test text only.',ur:'Only a fixture.'}]}));
  await writeFile(join(dir,'quran.json'),JSON.stringify({surahs}));
  const edition={metadata:{sections:{'1':'TEST CHAPTER'}},hadiths:[{hadithnumber:1,text:'TEST MESSAGE WITH 12 INSIDE; NOT A HADITH',reference:{book:1,hadith:1},grades:[]},{hadithnumber:12,text:'Different nonreligious test text',reference:{book:1,hadith:2},grades:[]},{hadithnumber:99,text:'',reference:{book:2,hadith:1}}]};
  await writeFile(join(dir,'eng-bukhari.json'),JSON.stringify(edition));
  await writeFile(join(dir,'manifest.json'),JSON.stringify({fixture:true}));
  await t.test('surah index excludes verse content and supplies actual lengths',async()=>{const s=await lib.surahs();assert.equal(s.length,114);assert.equal(s[0].numberOfAyahs,1);assert.equal(s[0].ayahs,undefined);});
  await t.test('surah number boundaries are enforced',async()=>{assert.equal((await lib.surah(114)).number,114);await assert.rejects(lib.surah(115),e=>e.status===400);});
  await t.test('Quran reference lookup returns the selected reference',async()=>{const d=await lib.searchQuran({q:'2:1'});assert.equal(d.total,1);assert.equal(d.items[0].surah,2);});
  await t.test('Quran translation search matches downloaded fields',async()=>{const d=await lib.searchQuran({q:'testkeyword'});assert.equal(d.total,1);assert.equal(d.items[0].surah,1);});
  await t.test('Quran Arabic search ignores diacritics',async()=>{const d=await lib.searchQuran({q:'تجربة'});assert.equal(d.total,1);});
  await t.test('Hadith book availability reflects actual files',async()=>{const d=await lib.hadithBooks();assert.equal(d[0].total,2);assert.equal(d[0].available,true);assert.equal(d[1].available,false);assert.equal(d[1].total,null);});
  await t.test('Hadith number lookup is exact rather than a substring match',async()=>{const d=await lib.hadiths({book:'bukhari',q:'12'});assert.equal(d.total,1);assert.equal(d.items[0].hadithnumber,12);});
  await t.test('Hadith text search excludes empty entries',async()=>{const d=await lib.hadiths({book:'bukhari',q:'different'});assert.equal(d.total,1);assert.equal(d.items[0].hadithnumber,12);});
  await t.test('Hadith chapters are filtered against edition reference numbers',async()=>{const d=await lib.hadiths({book:'bukhari',section:'2'});assert.equal(d.total,0);assert.equal(d.items.length,0);});
  await t.test('unsupported collection and language cannot become filesystem paths',async()=>{await assert.rejects(lib.hadiths({book:'../../secret'}),e=>e.status===400);await assert.rejects(lib.hadiths({book:'nawawi',lang:'urd'}),e=>e.status===400);});
  await t.test('daily selection is deterministic for the same UTC day',async()=>{assert.deepEqual(await lib.daily(),await lib.daily());});
  await t.test('manifest/source status is available without fabricated content',async()=>{const s=await lib.libraryStatus();assert.equal(s.ready,true);assert.equal(s.manifest.fixture,true);assert.match(s.sources.quran,/alquran\.cloud/);});
 } finally {await rm(dir,{recursive:true,force:true});if(old===undefined)delete process.env.LIBRARY_DATA_DIR;else process.env.LIBRARY_DATA_DIR=old;}
});
