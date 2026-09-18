import {tmpdir} from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createFarmerServer} from '../src/app-server.mjs';
import {emptyDraft} from '../src/app/store.mjs';

const tmp=process.env.FARMLOG_TEST_DIR || tmpdir();
const full=()=>({...emptyDraft('2026-09-18'),parcel_id:'house-3',crop:'토마토',work_type:'관수',details:'30분 물 주기',duration_minutes:30});
const close=server=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
async function fixture(t,dataDir){
 dataDir??=await mkdtemp(path.join(tmp,'workspace-server-'));
 const calls={ai:0,capabilities:0,media:0};
 const unexpected=key=>async()=>{calls[key]++;throw new Error('Unexpected helper call: '+key);};
 const server=await createFarmerServer({dataDir,ai:{extractDraft:unexpected('ai'),capabilitiesAI:unexpected('capabilities')},media:{mediaCapabilities:unexpected('media'),processMedia:unexpected('media')}});
 await new Promise(resolve=>server.listen(0,resolve));
 t.after(()=>close(server));
 const base='http://127.0.0.1:'+server.address().port;
 const request=async(route,body,headers={})=>{const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{Origin:base,...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};};
 const ok=async(route,body)=>{const response=await request(route,body);assert.equal(response.status,200,JSON.stringify(response.body));return response.body;};
 const manual=()=>ok('/api/app/manual-sessions',{draft:full(),sourceText:'  3번 하우스 토마토에 물 30분 줬어요.\n  '});
 const confirm=(id,key=id)=>ok(`/api/app/sessions/${id}/confirm`,{reviewed:true,idempotencyKey:key});
 const entry=async()=>{const session=await manual();return (await confirm(session.id)).entry;};
 return {server,base,dataDir,calls,request,ok,manual,confirm,entry};
}

test('manual → confirm → workspace → review → correction pending; journal/restart/export remain consistent without AI',async t=>{
 const f=await fixture(t);
 const blank=await f.ok('/api/app/workspace');assert.deepEqual(Object.keys(blank).sort(),['entries','pending','profile','reviews','summary']);assert.deepEqual(blank.summary,{total:0,pending:0,checked:0,needs_changes:0});
 const session=await f.manual();assert.equal(session.engine,'manual');assert.equal(session.ready,true);assert.equal(session.question,null);assert.equal(session.clarificationCount,0);assert.deepEqual(session.attachments,[]);assert.deepEqual(session.warnings,[]);assert.deepEqual(session.draft,full());assert.equal(session.workedAt,'2026-09-18');
 let workspace=await f.ok('/api/app/workspace');assert.deepEqual(workspace.pending,[{id:session.id,updated_at:session.updated_at,preview:session.messages[0].text}]);assert.equal(workspace.entries.length,0);
 const {entry}=await f.confirm(session.id);assert.equal(entry.source_text,session.messages[0].text);assert.equal(entry.engine,'manual');assert.equal((await f.confirm(session.id)).duplicate,true);
 workspace=await f.ok('/api/app/workspace');assert.deepEqual(workspace.summary,{total:1,pending:1,checked:0,needs_changes:0});assert.deepEqual(workspace.pending,[]);assert.deepEqual(workspace.reviews,{});
 const {review}=await f.ok(`/api/app/entries/${entry.id}/review`,{status:'checked',note:'기록 내용을 확인했어요.',expectedReviewId:null});assert.deepEqual(Object.keys(review).sort(),['created_at','entry_id','id','note','status']);assert.equal(review.entry_id,entry.id);
 workspace=await f.ok('/api/app/workspace');assert.deepEqual(workspace.summary,{total:1,pending:0,checked:1,needs_changes:0});assert.deepEqual(workspace.reviews[entry.id],review);assert.deepEqual(workspace.entries[0],entry);assert.equal(workspace.entries[0].regulatory_status,'not_checked');
 const correction=await f.ok(`/api/app/entries/${entry.id}/correct`,{});assert.equal(correction.supersedes,entry.id);
 // Merely opening a correction does not replace the current entry or its review.
 assert.equal((await f.ok('/api/app/workspace')).summary.checked,1);
 await f.ok(`/api/app/sessions/${correction.id}/draft`,{draft:{...full(),duration_minutes:20,details:'20분으로 정정'}});
 const corrected=(await f.confirm(correction.id)).entry;workspace=await f.ok('/api/app/workspace');assert.deepEqual(workspace.summary,{total:1,pending:1,checked:0,needs_changes:0});assert.deepEqual(workspace.entries,[corrected]);assert.deepEqual(workspace.reviews[entry.id],review);assert.equal(workspace.reviews[corrected.id],undefined);
 assert.equal((await f.request(`/api/app/entries/${entry.id}/review`,{status:'checked',note:'',expectedReviewId:review.id})).status,409);
 assert.deepEqual((await f.ok('/api/app/entries')).entries,workspace.entries);
 const exported=await f.ok('/api/app/export',{from:'2026-09-01',to:'2026-09-30',reviewed:true});assert.deepEqual(exported.entries,workspace.entries);assert.deepEqual(exported.event_ids,[corrected.id]);
 const journalBefore=await readFile(path.join(f.dataDir,'journal.jsonl'),'utf8');const events=journalBefore.trim().split('\n').map(JSON.parse);const reviewEvents=events.filter(e=>e.change.review);assert.equal(reviewEvents.length,1);assert.deepEqual(Object.keys(reviewEvents[0].change),['review']);assert.deepEqual(reviewEvents[0].change.review,review);
 assert.deepEqual(f.calls,{ai:0,capabilities:0,media:0});await close(f.server);
 const restarted=await fixture(t,f.dataDir);assert.deepEqual(await restarted.ok('/api/app/workspace'),workspace);assert.deepEqual(await restarted.ok(`/api/app/sessions/${session.id}`),{...session,confirmedEntryId:entry.id,updated_at:(await restarted.ok(`/api/app/sessions/${session.id}`)).updated_at});assert.equal((await restarted.confirm(session.id)).duplicate,true);assert.equal(await readFile(path.join(f.dataDir,'journal.jsonl'),'utf8'),journalBefore);assert.deepEqual(restarted.calls,{ai:0,capabilities:0,media:0});
});

test('optimistic review updates are serialized; stale/null expectations conflict without journal writes',async t=>{
 const f=await fixture(t);const entry=await f.entry();const route=`/api/app/entries/${entry.id}/review`;
 const results=await Promise.all([1,2].map(n=>f.request(route,{status:'checked',note:String(n),expectedReviewId:null})));assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);const first=results.find(r=>r.status===200).body.review;
 const {review:second}=await f.ok(route,{status:'needs_changes',note:'작업 시간을 다시 확인해 주세요.',expectedReviewId:first.id});assert.notEqual(second.id,first.id);
 const before=await readFile(path.join(f.dataDir,'journal.jsonl'),'utf8');for(const expectedReviewId of [null,first.id,'not-the-latest'])assert.equal((await f.request(route,{status:'checked',note:'',expectedReviewId})).status,409);assert.equal(await readFile(path.join(f.dataDir,'journal.jsonl'),'utf8'),before);
 const workspace=await f.ok('/api/app/workspace');assert.deepEqual(workspace.summary,{total:1,pending:0,checked:0,needs_changes:1});assert.deepEqual(workspace.reviews[entry.id],second);assert.equal(before.trim().split('\n').map(JSON.parse).filter(e=>e.change.review).length,2);
 await close(f.server);const restored=await fixture(t,f.dataDir);assert.deepEqual(await restored.ok('/api/app/workspace'),workspace);
});

test('review rejects invalid status, missing/blank change note, oversized note, missing expectation and unknown fields',async t=>{
 const f=await fixture(t);const entry=await f.entry();const route=`/api/app/entries/${entry.id}/review`;const good={status:'checked',note:'',expectedReviewId:null};
 const bad=[{...good,status:'pending'},{...good,status:'approved'},{status:'needs_changes',expectedReviewId:null},{...good,status:'needs_changes',note:' \n '},{...good,note:'x'.repeat(1001)},{...good,note:null},{status:'checked',note:''},{...good,expectedReviewId:3},{...good,regulatory_status:'approved'}];
 for(const body of bad)assert.equal((await f.request(route,body)).status,400,JSON.stringify(body));assert.equal((await f.request('/api/app/entries/not-an-entry/review',good)).status,404);
 assert.deepEqual((await f.ok('/api/app/workspace')).summary,{total:1,pending:1,checked:0,needs_changes:0});const result=await f.ok(route,{...good,status:'needs_changes',note:'검'.repeat(1000)});assert.equal(result.review.note.length,1000);
 const checked=await f.ok(route,{status:'checked',expectedReviewId:result.review.id});assert.equal(checked.review.note,'');assert.equal((await f.ok('/api/app/workspace')).entries[0].regulatory_status,'not_checked');
});

test('manual full-schema validation preserves nonempty raw source and permits incomplete pending drafts',async t=>{
 const f=await fixture(t);const valid={draft:full(),sourceText:'원문'};const partial={...full()};delete partial.weather;
 for(const body of [{...valid,sourceText:''},{...valid,sourceText:' \n '},{...valid,sourceText:'x'.repeat(100001)},{draft:full()},{...valid,draft:partial},{...valid,draft:{...full(),parcel_id:'unknown'}},{...valid,draft:{...full(),worker_count:'2'}},{...valid,draft:{...full(),harvest_amount:2}},{...valid,engine:'ollama:test'}])assert.equal((await f.request('/api/app/manual-sessions',body)).status,400);
 const session=await f.ok('/api/app/manual-sessions',{draft:emptyDraft(),sourceText:'아직 작업 정보를 보완해야 해요.'});assert.equal(session.ready,false);assert.equal(session.workedAt,null);assert.equal(session.question,null);assert.equal((await f.request(`/api/app/sessions/${session.id}/confirm`,{reviewed:true,idempotencyKey:'incomplete'})).status,400);assert.equal((await f.ok('/api/app/workspace')).pending.length,1);
 await f.ok(`/api/app/sessions/${session.id}/draft`,{draft:full()});await f.confirm(session.id);assert.deepEqual(f.calls,{ai:0,capabilities:0,media:0});
});

test('workspace summary counts only current entries, independent of work-date ordering',async t=>{
 const f=await fixture(t);const a=await f.entry(),b=await f.entry(),c=await f.entry();
 await f.ok(`/api/app/entries/${a.id}/review`,{status:'checked',note:'',expectedReviewId:null});await f.ok(`/api/app/entries/${b.id}/review`,{status:'needs_changes',note:'내용 확인',expectedReviewId:null});let w=await f.ok('/api/app/workspace');assert.deepEqual(w.summary,{total:3,pending:1,checked:1,needs_changes:1});
 const s=await f.ok(`/api/app/entries/${b.id}/correct`,{});await f.ok(`/api/app/sessions/${s.id}/draft`,{draft:{...full(),worked_at:'2026-09-01'}});await f.confirm(s.id);w=await f.ok('/api/app/workspace');assert.deepEqual(w.summary,{total:3,pending:2,checked:1,needs_changes:0});assert.equal(w.reviews[b.id].status,'needs_changes');assert.ok(w.entries.some(e=>e.id===c.id));
});

test('workspace/manual/review preserve exact Origin, Host, security headers, loopback and writer locks',async t=>{
 const f=await fixture(t);await assert.rejects(createFarmerServer({dataDir:f.dataDir,ai:{},media:{}}),{code:'EWRITERLOCK'});assert.throws(()=>f.server.listen(8880,'0.0.0.0'));assert.throws(()=>f.server.listen(9999));const entry=await f.entry();
 for(const [route,body] of [['/api/app/workspace',undefined],['/api/app/manual-sessions',{draft:full(),sourceText:'입력'}],[`/api/app/entries/${entry.id}/review`,{status:'checked',note:'',expectedReviewId:null}]]){
  for(const Origin of ['https://evil.example','http://localhost:'+f.server.address().port,'null'])assert.equal((await f.request(route,body,{Origin})).status,403);
  assert.equal((await f.request(route,body,{'Sec-Fetch-Site':'same-site'})).status,403);
  if(body!==undefined)assert.equal((await fetch(f.base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,403);
 }
 const wrongHost=await new Promise((resolve,reject)=>{http.get(f.base+'/api/app/workspace',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);}).on('error',reject);});assert.equal(wrongHost,403);
 const response=await fetch(f.base+'/api/app/workspace');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('cross-origin-resource-policy'),'same-origin');assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));assert.equal(response.headers.get('access-control-allow-origin'),null);
 await close(f.server);assert.ok((await readdir(f.dataDir)).some(name=>name.startsWith('.writer.lock.released-')));
});

test('static workspace routes stay explicitly allowlisted and legacy root bytes remain unchanged',async t=>{
 const f=await fixture(t);const legacy=await fetch(f.base+'/');assert.equal(legacy.status,200);assert.equal(await legacy.text(),await readFile(new URL('../src/farmer/index.html',import.meta.url),'utf8'));
 const routes={'/mvp':'index.html','/mvp/':'index.html','/admin':'index.html','/admin/':'index.html','/workspace/app.js':'app.js','/workspace/styles.css':'styles.css','/workspace/shared.js':'shared.js','/workspace/farmer.js':'farmer.js','/workspace/admin.js':'admin.js'};
 for(const [route,name] of Object.entries(routes)){
  let expected;try{expected=await readFile(new URL('../src/workspace/'+name,import.meta.url),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  const response=await fetch(f.base+route);assert.equal(response.status,expected===undefined?404:200,route);if(expected!==undefined){assert.equal(await response.text(),expected);assert.ok(response.headers.get('content-type').startsWith(name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'));}
 }
 for(const route of ['/workspace/index.html','/workspace/','/workspace/unknown.js','/workspace/../app-server.mjs','/workspace/%2e%2e%2fapp-server.mjs','/admin/unknown','/mvp/app.js','/src/app/store.mjs','/.local-data/farmer-app/journal.jsonl','/__proto__','/constructor'])assert.ok([400,404].includes((await fetch(f.base+route)).status),route);
});

test('manual requestKey retries return one persisted session, including after edits, confirmation and restart',async t=>{
 const f=await fixture(t);
 const route='/api/app/manual-sessions';
 const body={requestKey:'manual-retry_01',draft:full(),sourceText:'  3번 하우스 원문\n '};
 // Simulate a response being lost: resend the exact creation body rather than creating a new key.
 const first=await f.ok(route,body);
 const creationJournal=await readFile(path.join(f.dataDir,'journal.jsonl'),'utf8');
 const results=await Promise.all([f.ok(route,body),f.ok(route,body),f.ok(route,body)]);
 for(const session of results)assert.deepEqual(session,first);
 assert.deepEqual(await f.ok(route,{...body,draft:Object.fromEntries(Object.entries(body.draft).reverse())}),first);
 assert.equal(await readFile(path.join(f.dataDir,'journal.jsonl'),'utf8'),creationJournal);
 const creationEvents=creationJournal.trim().split('\n').map(JSON.parse);
 assert.equal(creationEvents.length,1);
 assert.deepEqual(Object.keys(creationEvents[0].change).sort(),['manualRequest','session']);
 assert.equal(creationEvents[0].change.manualRequest.key,body.requestKey);
 assert.equal(creationEvents[0].change.manualRequest.sessionId,first.id);
 assert.match(creationEvents[0].change.manualRequest.digest,/^[a-f0-9]{64}$/);
 assert.equal((await f.ok('/api/app/workspace')).pending.length,1);
 for(const changed of [{...body,sourceText:'다른 원문'},{...body,draft:{...body.draft,details:'변경된 세부내용'}}])assert.equal((await f.request(route,changed)).status,409);
 assert.equal(await readFile(path.join(f.dataDir,'journal.jsonl'),'utf8'),creationJournal);
 const edited=await f.ok(`/api/app/sessions/${first.id}/draft`,{draft:{...full(),worked_at:'2026-09-17'}});
 assert.equal(edited.workedAt,'2026-09-17');
 assert.deepEqual(await f.ok(route,body),edited);
 const confirmed=(await f.confirm(first.id)).entry;
 const current=await f.ok(`/api/app/sessions/${first.id}`);
 assert.equal(current.confirmedEntryId,confirmed.id);
 // Original request replay must not fail if its original parcel was removed from the profile later.
 await f.ok('/api/app/profile',{farm_name:'시험 농장',parcels:[]});
 const beforeRetry=await readFile(path.join(f.dataDir,'journal.jsonl'),'utf8');
 assert.deepEqual(await f.ok(route,body),current);
 assert.equal(await readFile(path.join(f.dataDir,'journal.jsonl'),'utf8'),beforeRetry);
 await close(f.server);
 const restored=await fixture(t,f.dataDir);
 assert.deepEqual(await restored.ok(route,body),current);
 assert.equal((await restored.request(route,{...body,sourceText:'재시작 후 다른 원문'})).status,409);
 const afterRetry=await readFile(path.join(f.dataDir,'journal.jsonl'),'utf8');
 assert.equal(afterRetry,beforeRetry);
 assert.equal(afterRetry.trim().split('\n').map(JSON.parse).filter(event=>event.change.manualRequest).length,1);
 const workspace=await restored.ok('/api/app/workspace');
 assert.deepEqual(workspace.pending,[]);
 assert.equal(workspace.entries.length,1);
 assert.deepEqual(f.calls,{ai:0,capabilities:0,media:0});
 assert.deepEqual(restored.calls,{ai:0,capabilities:0,media:0});
});

test('manual requestKey validates boundaries and safely supports reserved object keys; no-key requests remain independent',async t=>{
 const f=await fixture(t),route='/api/app/manual-sessions';
 const body={draft:full(),sourceText:'원문'};
 for(const requestKey of ['',null,1,{},[],true,'x'.repeat(129),'a b','a.b','한글','abc\n']){
  assert.equal((await f.request(route,{...body,requestKey})).status,400,JSON.stringify(requestKey));
 }
 assert.equal((await f.ok('/api/app/workspace')).pending.length,0);
 for(const requestKey of ['a','x'.repeat(128),'__proto__','constructor','toString']){
  const first=await f.ok(route,{...body,requestKey});
  assert.deepEqual(await f.ok(route,{...body,requestKey}),first);
 }
 const first=await f.ok(route,body),second=await f.ok(route,body);
 assert.notEqual(first.id,second.id);
 const events=(await readFile(path.join(f.dataDir,'journal.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
 assert.equal(events.length,7);assert.equal(events.filter(event=>event.change.manualRequest).length,5);
 await close(f.server);
 const restored=await fixture(t,f.dataDir);
 const before=await readFile(path.join(f.dataDir,'journal.jsonl'),'utf8');
 for(const requestKey of ['__proto__','constructor','toString']){
  const session=await restored.ok(route,{...body,requestKey});
  const record=events.find(event=>event.change.manualRequest?.key===requestKey);
  assert.equal(session.id,record.change.session.id);
 }
 assert.equal(await readFile(path.join(f.dataDir,'journal.jsonl'),'utf8'),before);
});

test('draft update synchronizes workedAt with nullable draft date and persists correction dates',async t=>{
 const f=await fixture(t);const session=await f.manual();
 const cleared=await f.ok(`/api/app/sessions/${session.id}/draft`,{draft:{...full(),worked_at:null}});
 assert.equal(cleared.workedAt,null);assert.equal(cleared.ready,false);
 const changed=await f.ok(`/api/app/sessions/${session.id}/draft`,{draft:{...full(),worked_at:'2026-09-16'}});
 assert.equal(changed.workedAt,'2026-09-16');assert.equal(changed.ready,true);
 const entry=(await f.confirm(session.id)).entry;
 const correction=await f.ok(`/api/app/entries/${entry.id}/correct`,{});
 assert.equal(correction.workedAt,'2026-09-16');
 const corrected=await f.ok(`/api/app/sessions/${correction.id}/draft`,{draft:{...full(),worked_at:'2026-09-15'}});
 assert.equal(corrected.workedAt,'2026-09-15');
 await close(f.server);const restored=await fixture(t,f.dataDir);
 assert.deepEqual(await restored.ok(`/api/app/sessions/${correction.id}`),corrected);
});

test('entry detail reviewHistory exposes every decision across the correction chain in journal order',async t=>{
 const f=await fixture(t);
 const original=await f.entry();
 assert.deepEqual((await f.ok(`/api/app/entries/${original.id}`)).reviewHistory,[]);
 const first=(await f.ok(`/api/app/entries/${original.id}/review`,{status:'needs_changes',note:'작업일 확인',expectedReviewId:null})).review;
 const second=(await f.ok(`/api/app/entries/${original.id}/review`,{status:'checked',note:'원문 확인',expectedReviewId:first.id})).review;
 const unrelated=await f.entry();
 await f.ok(`/api/app/entries/${unrelated.id}/review`,{status:'checked',expectedReviewId:null});
 const correction=await f.ok(`/api/app/entries/${original.id}/correct`,{});
 const next=(await f.confirm(correction.id)).entry;
 const third=(await f.ok(`/api/app/entries/${next.id}/review`,{status:'needs_changes',note:'작업 시간 확인',expectedReviewId:null})).review;
 const correction2=await f.ok(`/api/app/entries/${next.id}/correct`,{});
 const latest=(await f.confirm(correction2.id)).entry;
 const expected=[first,second,third];
 for(const id of [original.id,next.id,latest.id]){
  const detail=await f.ok(`/api/app/entries/${id}`);
  assert.equal(detail.entry.id,id);
  assert.deepEqual(detail.history.map(entry=>entry.id),[original.id,next.id,latest.id]);
  assert.deepEqual(detail.reviewHistory,expected);
  assert.deepEqual(detail.reviewHistory.map(review=>review.entry_id),[original.id,original.id,next.id]);
 }
 assert.equal((await f.ok('/api/app/workspace')).reviews[latest.id],undefined);
 await close(f.server);const restored=await fixture(t,f.dataDir);
 assert.deepEqual((await restored.ok(`/api/app/entries/${latest.id}`)).reviewHistory,expected);
});
