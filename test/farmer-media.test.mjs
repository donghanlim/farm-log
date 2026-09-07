import {tmpdir} from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,access} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {mediaCapabilities,processMedia} from '../src/app/media.mjs';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9xkAAAAASUVORK5CYII=','base64');
const storageDir=await mkdtemp(path.join(process.env.FARMLOG_TEST_DIR || tmpdir(),'farmer-media-tests-'));
const photo=(overrides={})=>processMedia({kind:'photo',mime:'image/png',buffer:png,storageDir,...overrides});
test('capabilities report booleans and nonempty truthful details',async()=>{
 const caps=await mediaCapabilities();
 for(const key of ['ocr','stt']){assert.equal(typeof caps[key].available,'boolean');assert.ok(caps[key].detail.length>0);}
 caps.ocr.available='mutated';assert.equal(typeof (await mediaCapabilities()).ocr.available,'boolean');
});
test('reject kind, empty buffer, unsupported bytes',async()=>{
 await assert.rejects(photo({kind:'video'}));await assert.rejects(photo({buffer:Buffer.alloc(0)}));await assert.rejects(photo({buffer:Buffer.from('<svg onload="evil"/>')}));
});
test('strict photo 8MB and audio 16MB limits',async()=>{
 await assert.rejects(photo({buffer:Buffer.alloc(8*1024*1024+1)}),/크기/);
 await assert.rejects(photo({kind:'audio',mime:'audio/wav',buffer:Buffer.alloc(16*1024*1024+1)}),/크기/);
});
test('MIME mismatch and injection rejected before execution',async()=>{
 await assert.rejects(photo({mime:'image/jpeg'}),/MIME/);
 await assert.rejects(photo({mime:'image/png;'+ 'x'.repeat(129)}));
 await assert.rejects(photo({mime:'image/png\n$(touch injected)'}));
 await assert.rejects(photo({storageDir:'relative'}));
});
test('photos return canonical MIME and original buffer, retained work file',async()=>{
 const r=await photo({mime:'IMAGE/PNG'});
 assert.equal(r.mime,'image/png');assert.deepEqual(r.buffer,png);assert.equal(r.transcript,null);
 assert.ok(['ready','failed','unavailable'].includes(r.processing));assert.ok(r.detail);
 const dirs=await readdir(storageDir);assert.ok(dirs.some(x=>x.startsWith('media-work-')));
});
test('audio magic remains local and preserved even without runtime',async()=>{
 const wav=Buffer.alloc(44);wav.write('RIFF');wav.writeUInt32LE(36,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);
 const r=await processMedia({kind:'audio',mime:'audio/x-wav',buffer:wav,storageDir});
 assert.equal(r.mime,'audio/wav');assert.deepEqual(r.buffer,wav);assert.equal(r.ocrText,null);assert.ok(['failed','unavailable'].includes(r.processing));
});
test('live public government image, when supplied', {skip:!process.env.FARMLOG_OCR_TEST_IMAGE},async()=>{
 const buffer=await readFile(process.env.FARMLOG_OCR_TEST_IMAGE);const r=await photo({buffer});
 assert.deepEqual(r.buffer,buffer);
 if((await mediaCapabilities()).ocr.available){
  assert.equal(r.processing,'ready');
  for(const word of ['영농일지','작업단계','농약','수확']) assert.ok(r.ocrText.includes(word), `missing recognized anchor: ${word}`);
  assert.match(r.detail,/WASM/);
 }else assert.equal(r.processing,'unavailable');
});

const ocrTools=fileURLToPath(new URL('../.local-data/farmer-app-tools/ocr/',import.meta.url));
const hasWasm=await access(path.join(ocrTools,'offline-worker.cjs')).then(()=>true,()=>false);
test('missing local traineddata fails without downloader or model auto-fetch', {skip:!hasWasm},async()=>{
 const missing=await mkdtemp(path.join(storageDir,'missing-models-'));
 const code=`const t=require(process.argv[1]);t.createWorker('kor+eng',1,{workerPath:process.argv[2],langPath:process.argv[3],gzip:true,cacheMethod:'none',errorHandler:e=>{console.log(String(e));process.exit(0);}}).then(async w=>{await w.terminate();process.exit(2);}).catch(e=>{console.log(String(e));process.exit(0);});`;
 const {stdout}=await promisify(execFile)(process.execPath,['-e',code,path.join(ocrTools,'node_modules/tesseract.js'),path.join(ocrTools,'offline-worker.cjs'),missing],{timeout:30000,killSignal:'SIGKILL',maxBuffer:1048576});
 assert.match(stdout,/ENOENT/);assert.deepEqual(await readdir(missing),[]);
});
test('runtime HTTP download is actively denied by offline worker', {skip:!hasWasm},async()=>{
 const code=`const t=require(process.argv[1]);t.createWorker('kor',1,{workerPath:process.argv[2],langPath:'https://127.0.0.1:1/never-contact',gzip:true,cacheMethod:'none',errorHandler:e=>{console.log(String(e));process.exit(0);}}).then(async w=>{await w.terminate();process.exit(2);}).catch(e=>{console.log(String(e));process.exit(0);});`;
 const {stdout}=await promisify(execFile)(process.execPath,['-e',code,path.join(ocrTools,'node_modules/tesseract.js'),path.join(ocrTools,'offline-worker.cjs')],{timeout:30000,killSignal:'SIGKILL',maxBuffer:1048576});
 assert.match(stdout,/OCR_RUNTIME_NETWORK_DISABLED/);
});
