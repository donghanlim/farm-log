import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { speechAvailability, transcribeLocal, SPEECH_ENGINE, cancelLocalSpeech, inspectSpeechPCM } from '../src/farmer/speech-local.js';
import { ROOT, MODEL_FILES, VERSION, REVISION } from '../scripts/setup-browser-speech.mjs';

test('rejects digital all-zero silence and corrupt PCM without claiming VAD',()=>{
  assert.throws(()=>inspectSpeechPCM(new Float32Array(16000)),/소리가 없어요/);
  assert.throws(()=>inspectSpeechPCM(new Float32Array([NaN])),/손상/);
  assert.throws(()=>inspectSpeechPCM(new Float32Array()),/비어/);
  const sine=Float32Array.from({length:16000},(_,i)=>0.1*Math.sin(i*2*Math.PI*440/16000));
  const energy=inspectSpeechPCM(sine);
  assert.ok(energy.peak>0.09);assert.ok(energy.rms>0.07);
  assert.equal(energy.speechDetected,null);
});

test('non-browser explicitly unavailable, no false inference success', async()=>{
  assert.equal((await speechAvailability()).available,false);
  assert.equal(SPEECH_ENGINE,'whisper-tiny-q8-wasm-local');
  cancelLocalSpeech();
});
test('rejects empty/oversized and already-cancelled audio',async()=>{
  await assert.rejects(transcribeLocal(new Blob()),/16MB/);
  await assert.rejects(transcribeLocal(new Blob([new Uint8Array(16*1024*1024+1)])),/16MB/);
  const control=new AbortController();control.abort();
  await assert.rejects(transcribeLocal(new Blob(['test']),()=>{},{signal:control.signal}),{name:'AbortError'});
});
test('worker forces offline local paths, Korean q8 WASM, hard cancellation',async()=>{
  const source=await readFile(new URL('../src/farmer/speech-local.js',import.meta.url),'utf8');
  for(const required of ["env.allowRemoteModels = false","env.localModelPath = '/speech-assets/models/'","env.backends.onnx.wasm.wasmPaths = '/speech-assets/wasm/'","device:'wasm'","dtype:'q8'","language:'korean'","worker?.terminate()","180_000","url.origin!==globalThis.location.origin"]) assert.ok(source.includes(required),required);
  assert.ok(!source.includes('SpeechRecognition('));
});
test('installed local assets match pinned hashes and fit download budget',async t=>{
  let manifest;try {manifest=JSON.parse(await readFile(`${ROOT}/manifest.json`,'utf8'));} catch {t.skip('Run node scripts/setup-browser-speech.mjs for local assets');return;}
  assert.equal(manifest.version,VERSION);assert.equal(manifest.revision,REVISION);
  assert.ok(manifest.sourceDownloadBytes<200_000_000);assert.ok(manifest.runtimeBytes<100_000_000);
  for(const item of manifest.assets) {
    assert.equal((await stat(`${ROOT}/${item.path}`)).size,item.bytes);
    assert.equal(createHash('sha256').update(await readFile(`${ROOT}/${item.path}`)).digest('hex'),item.sha256);
  }
  assert.equal(MODEL_FILES.filter(x=>x.endsWith('.onnx')).length,2);
  const bundle=await readFile(`${ROOT}/vendor/transformers.js`,'utf8');
  assert.ok(!/^import\s.*from\s+["'][^./]/m.test(bundle));
});
