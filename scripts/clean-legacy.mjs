/** Optional cleanup of untouched legacy files. Default is DRY RUN.
 * Only files matching the exact uploaded baseline SHA-256 are deleted.
 * User changes, unknown files, symlinks, .git and private .env files are preserved.
 */
import {readFile,lstat,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,relative,sep,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
if(args.some(x=>x!=='--apply'))throw new Error('Use no arguments for a dry run, or --apply to remove matching legacy files.');
const apply=args.includes('--apply');
const manifest=JSON.parse(await readFile(resolve(root,'PATCH_MANIFEST.json'),'utf8'));
let matching=0,preserved=0,missing=0;
for(const item of manifest.obsolete||[]) {
  const rel=item.path;
  if(typeof rel!=='string'||!rel||rel.includes('\\')||rel.split('/').some(p=>p==='..'||p==='.git'||p.startsWith('.env')))
    throw new Error('Unsafe manifest entry. No further changes made.');
  const full=resolve(root,rel),inside=relative(root,full);
  if(inside.startsWith('..'+sep)||inside==='..'||full===resolve(root))throw new Error('Path outside repository.');
  let safe=true;
  for(let parent=dirname(full);parent!==resolve(root);parent=dirname(parent)) {
    try{if((await lstat(parent)).isSymbolicLink()){safe=false;break;}}catch{safe=false;break;}
  }
  let stat;try{stat=await lstat(full);}catch(e){if(e.code==='ENOENT'){missing++;continue;}throw e;}
  if(!safe||!stat.isFile()||stat.isSymbolicLink()){preserved++;console.log(`KEEP (not a regular local file) ${rel}`);continue;}
  const digest=createHash('sha256').update(await readFile(full)).digest('hex');
  if(digest!==item.sha256){preserved++;console.log(`KEEP (edited since uploaded ZIP) ${rel}`);continue;}
  matching++;if(apply)await unlink(full);console.log(`${apply?'REMOVED':'WOULD REMOVE'} ${rel}`);
}
console.log(`\n${apply?'Cleanup complete':'DRY RUN — nothing deleted'}: ${matching} baseline matches, ${preserved} preserved, ${missing} already absent.`);
if(!apply)console.log('Review this list, back up/commit your work, then run npm run update:clean to apply.');
console.log('This release includes a matching lockfile. Use npm ci; review START_HERE_CLASSROOM.md before changes.');
