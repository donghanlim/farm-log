import http from 'node:http';
import {mkdir,readFile,open,realpath,rename,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {fixtures,parcels,crops,workTypes,extractFixture,validateFields,makeDraft,buildReport,fail} from './core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const canonical=value=>JSON.stringify(value);
const fieldKeys=['worked_at','parcel_id','crop','work_type','amount','unit'];
function normalize(input) {
 if(!input||typeof input!=='object'||Array.isArray(input)) fail('JSON object required');
 if(Object.keys(input).some(k=>!['fixtureId','fields','reviewed','idempotencyKey','supersedes'].includes(k))) fail('Unknown property: synthetic privacy allowlist only');
 if(input.reviewed!==true) fail('Explicit human review required');
 if(typeof input.idempotencyKey!=='string'||! /^[A-Za-z0-9_-]{1,128}$/.test(input.idempotencyKey)) fail('Invalid idempotencyKey');
 if(!fixtures.some(f=>f.id===input.fixtureId)) fail('Unknown synthetic fixture',404);
 if(input.supersedes!=null&&(typeof input.supersedes!=='string'||! /^[a-zA-Z0-9-]{1,80}$/.test(input.supersedes))) fail('Invalid supersedes');
 return {fixtureId:input.fixtureId,fields:validateFields(input.fields),reviewed:true,idempotencyKey:input.idempotencyKey,supersedes:input.supersedes??null};
}
function payloadOf(record) {return normalize({fixtureId:record.fixtureId,fields:Object.fromEntries(fieldKeys.map(k=>[k,record[k]])),reviewed:record.reviewed,idempotencyKey:record.idempotencyKey,supersedes:record.supersedes});}
// Exclusive filesystem lock, deliberately never reclaimed using PID liveness.
// PID reuse, crashed processes, and ambiguous ownership all require manual review.
async function acquireWriterLock(dataDir) {
 const lockPath=path.join(dataDir,'.writer.lock');
 const token=randomUUID(); const releasedPath=path.join(dataDir,'.writer.lock.released-'+token);
 let fd;
 try {fd=await open(lockPath,'wx',0o600);} catch(error) {
  if(error.code==='EEXIST') {
   const locked=new Error('Writer lock already exists: '+lockPath+'. Refusing startup, even if the recorded PID appears stale. Stop and verify all writers, then manually rename the lock to a unique preserved archive path. Never delete or automatically reclaim it.');
   locked.code='EWRITERLOCK'; throw locked;
  }
  throw error;
 }
 const identity=await fd.stat(); let releasePromise;
 const release=()=>releasePromise??=(async()=>{
  const current=await lstat(lockPath);
  if(current.dev!==identity.dev||current.ino!==identity.ino)throw new Error('Writer lock ownership changed; refusing to move another instance lock. Inspect manually.');
  await rename(lockPath,releasedPath);
 })();
 try {
  await fd.writeFile(JSON.stringify({pid:process.pid,instance_token:token,created_at:new Date().toISOString()})+'\n');
  await fd.sync(); await fd.close();
 } catch(error) {
  await fd.close().catch(()=>{});
  try {await release();}catch(releaseError){throw new AggregateError([error,releaseError],'Lock initialization and preservation failed; inspect manually');}
  throw error;
 }
 return release;
}
export async function createServer({dataDir=path.join(root,'.local-data','verified'),publicDir=path.join(root,'src/public'),evalPath=path.join(root,'evidence/evals.json')}={}) {
 await mkdir(dataDir,{recursive:true,mode:0o700});
 const releaseLock=await acquireWriterLock(dataDir);
 try {
 const ledgerPath=path.join(dataDir,'events.jsonl');
 const records=[]; const byKey=new Map(); const replaced=new Set();
 let text=''; try{text=await readFile(ledgerPath,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
 if(text&&!text.endsWith('\n')) throw new Error('Ledger incomplete trailing line: refusing startup; preserve and inspect manually');
 for(const line of text.split('\n').filter(Boolean)) {
  let record; try{record=JSON.parse(line); const n=payloadOf(record); const expected=makeDraft(n.fixtureId,n.fields,'human_reviewed_synthetic');
   if(Object.keys(record).some(k=>![...Object.keys(expected),'event_id','created_at','supersedes','reviewed','idempotencyKey'].includes(k))||typeof record.event_id!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.event_id)||typeof record.created_at!=='string'||! /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.created_at)||!Number.isFinite(Date.parse(record.created_at))||new Date(record.created_at).toISOString()!==record.created_at||Object.keys(expected).some(k=>canonical(expected[k])!==canonical(record[k]))||byKey.has(record.idempotencyKey)||records.some(r=>r.event_id===record.event_id)||(record.supersedes&&(!records.some(r=>r.event_id===record.supersedes)||replaced.has(record.supersedes)))) throw new Error('Invalid ledger event');
  }catch(e){throw new Error('Ledger integrity check failed: '+e.message);}
  records.push(record);byKey.set(record.idempotencyKey,record);if(record.supersedes)replaced.add(record.supersedes);
 }
 let queue=Promise.resolve(); let poisoned=false;
 async function save(input) {
  const n=normalize(input); const existing=byKey.get(n.idempotencyKey);
  if(existing){if(canonical(payloadOf(existing))!==canonical(n)) fail('Idempotency key already used with different payload',409);return {record:existing,duplicate:true};}
  if(poisoned) fail('Ledger write failed: restart and inspect before writing',503);
  if(n.supersedes&&(!records.some(r=>r.event_id===n.supersedes)||replaced.has(n.supersedes))) fail('Correction must supersede a current event',409);
  const record={...makeDraft(n.fixtureId,n.fields,'human_reviewed_synthetic'),event_id:randomUUID(),created_at:new Date().toISOString(),supersedes:n.supersedes,reviewed:true,idempotencyKey:n.idempotencyKey};
  let fd; try{fd=await open(ledgerPath,'a',0o600);await fd.writeFile(JSON.stringify(record)+'\n');await fd.sync();}catch(e){poisoned=true;throw e;}finally{await fd?.close();}
  records.push(record);byKey.set(n.idempotencyKey,record);if(n.supersedes)replaced.add(n.supersedes);
  return {record,duplicate:false};
 }
 const json=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(obj));};
 async function body(req) {
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type']||'')) fail('JSON content-type required',415);
  if(Number(req.headers['content-length'])>65536){req.resume();fail('Body exceeds 64KB',413);}
  let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>65536)fail('Body exceeds 64KB',413);chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('Invalid JSON');}
 }
 const server=http.createServer(async(req,res)=>{
  try{
   const port=server.address()?.port; const allowed=[`127.0.0.1:${port}`,`localhost:${port}`];
   if(!allowed.includes(req.headers.host)) fail('Local Host required',403);
   if(req.headers.origin&&!allowed.some(h=>req.headers.origin===`http://${h}`)) fail('Local Origin required',403);
   if(req.headers['sec-fetch-site']==='cross-site') fail('Cross-site request rejected',403);
   const decoded=decodeURIComponent((req.url||'/').split('?')[0]);
   if(!decoded.startsWith('/')||decoded.includes('\\')||decoded.includes('\0')||decoded.split('/').some(p=>p==='..'||p==='.')||decoded.startsWith('//')) fail('Invalid path',400);
   async function evaluations(){try{return JSON.parse(await readFile(evalPath,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
   if(req.method==='GET'&&decoded==='/api/bootstrap')return json(res,200,{mode:'synthetic-only',engine:'deterministic-baseline',fixtures,parcels,crops,workTypes,records,evaluations:await evaluations()});
   if(req.method==='GET'&&decoded==='/api/records')return json(res,200,{records});
   if(req.method==='GET'&&decoded==='/api/evals')return json(res,200,await evaluations());
   if(req.method==='POST') {
    const input=await body(req);
    if(!input||typeof input!=='object'||Array.isArray(input))fail('JSON object required');
    if(decoded==='/api/extract') {if(!input||Array.isArray(input)||Object.keys(input).some(k=>k!=='fixtureId'))fail('fixtureId only');return json(res,200,extractFixture(input.fixtureId));}
    if(decoded==='/api/records') {const result=queue.then(()=>save(input));queue=result.catch(()=>{});return json(res,200,await result);}
    if(decoded==='/api/report'){if(!input||input.reviewed!==true||Object.keys(input).some(k=>k!=='reviewed'))fail('Explicit human review required');await queue;return json(res,200,buildReport(records));}
    return json(res,404,{error:'Not found'});
   }
   if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
   if(decoded.startsWith('/api/'))return json(res,404,{error:'Not found'});
   const routes={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/style.css':'style.css'}; const name=routes[decoded]; if(!name)return json(res,404,{error:'Not found'});
   let file;try{const base=await realpath(publicDir);file=await realpath(path.join(base,name));if(!file.startsWith(base+path.sep))fail('Static path outside public root',403);}catch(e){if(e.code==='ENOENT')return json(res,404,{error:'Not found'});throw e;}
   const content=await readFile(file);res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",'Cache-Control':'no-store'});res.end(content);
  }catch(e){if(!res.headersSent)json(res,e.status||((e instanceof URIError)?400:500),{error:e.status||e instanceof URIError?e.message:'Internal error'});else res.end();}
 });
 // close callbacks resolve only after all in-flight writes and lock preservation.
 // A shared promise makes explicit close plus test cleanup safe, even after a new owner starts.
 const nativeClose=server.close.bind(server); let closePromise;
 server.close=(callback)=>{
  if(!closePromise)closePromise=new Promise((resolve,reject)=>{
   nativeClose(error=>{queue.then(()=>releaseLock()).then(()=>{
    if(error&&error.code!=='ERR_SERVER_NOT_RUNNING')reject(error);else resolve();
   },reject);});
  });
  if(typeof callback==='function')closePromise.then(()=>callback(),error=>callback(error));
  else closePromise.catch(error=>{console.error('Writer lock preservation failed:',error.message);});
  return server;
 };
 // Expose only a loopback-bound listen method, including for ephemeral-port tests.
 const nativeListen=server.listen.bind(server); server.listen=(port=8878,...args)=>{if(closePromise)throw new Error('Closed server cannot restart after releasing writer lock');if(typeof port!=='number'||!Number.isInteger(port)||port<0||port>65535)throw new Error('Numeric port required');const callback=args.find(a=>typeof a==='function');if(args.some(a=>typeof a==='string'&&a!=='127.0.0.1'))throw new Error('127.0.0.1 only');return nativeListen(port,'127.0.0.1',callback);};
 return server;
 } catch(error) {
  try {await releaseLock();}catch(releaseError){throw new AggregateError([error,releaseError],'Startup failed and writer lock preservation failed; inspect manually');}
  throw error;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const server=await createServer();
 const shutdown=()=>server.close(error=>{if(error){console.error(error.message);process.exitCode=1;}});
 process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);
 server.once('error',error=>{console.error(error.message);process.exitCode=1;shutdown();});
 try {server.listen(Number(process.env.PORT||8878),()=>console.log(`FarmLog synthetic-only deterministic-baseline http://127.0.0.1:${server.address().port}`));}catch(error){shutdown();throw error;}
}
