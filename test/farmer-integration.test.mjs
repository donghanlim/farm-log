import {tmpdir} from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import path from 'node:path';
import {createFarmerServer} from '../src/app-server.mjs';
import {emptyDraft} from '../src/app/store.mjs';
const tmp=process.env.FARMLOG_TEST_DIR || tmpdir();
test('conversation retains original selected date when later correcting relative work date',async t=>{
  const anchors=[];
  const ai={capabilitiesAI:async()=>({available:true,model:'test'}),extractDraft:async o=>{anchors.push(o.workedAt);return {draft:{...emptyDraft('2026-09-06'),parcel_id:'house-3',crop:'토마토',work_type:'관수',details:o.text},engine:'ollama:test',warnings:[]};}};
  const media={mediaCapabilities:async()=>({ocr:{available:false},stt:{available:false}})};
  const dataDir=await mkdtemp(path.join(tmp,'farmer-anchor-'));
  const server=await createFarmerServer({dataDir,ai,media});await new Promise(r=>server.listen(0,r));
  t.after(()=>new Promise((r,j)=>server.close(e=>e?j(e):r())));
  const base='http://127.0.0.1:'+server.address().port;
  const post=async(p,b)=>{const r=await fetch(base+p,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(b)});assert.equal(r.status,200);return r.json();};
  const s=await post('/api/app/sessions',{text:'어제 3번 하우스 토마토 물 줬어',attachmentIds:[],workedAt:'2026-09-07'});
  await post('/api/app/sessions/'+s.id+'/messages',{text:'아니 오늘 작업한 거야'});
  assert.deepEqual(anchors,['2026-09-07','2026-09-07']);
  const restored=await (await fetch(base+'/api/app/sessions/'+s.id)).json();assert.equal(restored.workedAt,'2026-09-07');
});

// Parent-observed browser input: a duration can occur between '물' and '줬어'.
test('natural watering phrase preserves duration and asks only for missing crop',async()=>{
  const {normalizeDraft}=await import('../src/app/ai.mjs');
  const profile={parcels:[{id:'upper-field',name:'윗밭',aliases:[],crop:'고추'}]};
  const d=normalizeDraft({work_type:'관수'},{text:'어제 윗밭에 물을 30분 줬어.',profile,workedAt:'2026-09-07'});
  assert.equal(d.work_type,'관수');assert.equal(d.duration_minutes,30);assert.equal(d.crop,null);assert.equal(d.worked_at,'2026-09-06');
});

test('latest date correction and independent field additions survive together',async()=>{
 const {normalizeDraft}=await import('../src/app/ai.mjs');
 const profile={parcels:[{id:'house-3',name:'3번 하우스',aliases:[],crop:'토마토'}]};
 const old={...emptyDraft('2026-09-06'),parcel_id:'house-3',crop:'토마토',work_type:'관수',duration_minutes:30,details:'어제 3번 하우스 토마토에 물 30분 줬어.'};
 const d=normalizeDraft({}, {text:old.details+'\n어제가 아니라 오늘이야. 수확도 5kg 했고 물 준 시간은 30분 말고 20분이야.',profile,workedAt:'2026-09-07',previousDraft:old});
 assert.equal(d.worked_at,'2026-09-07');assert.equal(d.duration_minutes,20);assert.equal(d.harvest_amount,5);assert.equal(d.work_type,'관수·수확');
 const spaced=normalizeDraft({}, {text:'3번하우스 토마토 물줬어',profile,workedAt:'2026-09-07'});assert.equal(spaced.parcel_id,'house-3');
});
test('browser transcript candidates stay auditable but cannot override user-corrected text',async t=>{
 let supplied='';const ai={capabilitiesAI:async()=>({available:true}),extractDraft:async o=>{supplied=o.text;return {draft:{...emptyDraft(o.workedAt),parcel_id:'house-3',crop:'토마토',work_type:'관수',duration_minutes:20,details:o.text},engine:'ollama:test',warnings:[]};}};
 const media={mediaCapabilities:async()=>({ocr:{available:false},stt:{available:false}}),processMedia:async o=>({...o,processing:'unavailable',detail:'native STT unavailable'})};
 const dataDir=await mkdtemp(path.join(tmp,'farmer-transcript-'));const server=await createFarmerServer({dataDir,ai,media});await new Promise(r=>server.listen(0,r));t.after(()=>new Promise((r,j)=>server.close(e=>e?j(e):r())));const base='http://127.0.0.1:'+server.address().port;
 const post=async(p,b)=>{const r=await fetch(base+'/api/app/'+p,{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify(b)});assert.equal(r.status,200);return r.json();};
 const {media:item}=await post('media',{kind:'audio',mime:'audio/wav',base64:Buffer.from('RIFF0000WAVEdata').toString('base64'),transcriptCandidate:'물 30분 줬어',transcriptEngine:'whisper-tiny-q8-wasm-local'});
 assert.equal(item.transcript,null);assert.equal(item.transcriptCandidate,'물 30분 줬어');
 const s=await post('sessions',{text:'3번 하우스 토마토 물 20분 줬어',workedAt:'2026-09-07',attachmentIds:[item.id]});assert.equal(s.draft.duration_minutes,20);assert.ok(!supplied.includes('30분'));
 const head=await fetch(base+'/speech-local.js',{method:'HEAD'});assert.equal(head.status,200);assert.ok(head.headers.get('content-security-policy').includes("'wasm-unsafe-eval'"));
 assert.equal((await fetch(base+'/speech-assets/downloads/source.tgz')).status,404);
});

test('harvest quantities do not consume fertilizer quantities; latest time unit wins',async()=>{
 const {normalizeDraft}=await import('../src/app/ai.mjs');
 const profile={parcels:[{id:'upper-field',name:'윗밭',aliases:[],crop:'고추'}]};
 const draft=text=>normalizeDraft({}, {text,profile,workedAt:'2026-09-07'});
 assert.equal(draft('윗밭 고추 5kg 수확하고 비료 20kg 뿌렸어').harvest_amount,5);
 assert.equal(draft('윗밭 고추 수확했고 비료 20kg 뿌렸어').harvest_amount,null);
 assert.equal(draft('수확량 5kg 말고 6kg이야').harvest_amount,6);
 assert.equal(draft('2시간 말고 20분이야').duration_minutes,20);
 assert.equal(draft('물을 준 시간은 20분이야').work_type,'관수');
});
