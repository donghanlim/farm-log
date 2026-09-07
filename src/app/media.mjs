import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {access, readFile, writeFile, mkdir, mkdtemp, readdir, stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../', import.meta.url));
const tools = path.join(root, '.local-data/farmer-app-tools');
const moduleFile = fileURLToPath(import.meta.url);
const ocrDir = path.join(tools, 'ocr');
const whisper = path.join(tools, 'venv/bin/mlx_whisper');
const ffmpeg = '/opt/homebrew/bin/ffmpeg';
const modelRoot = path.join(os.homedir(), '.cache/huggingface/hub/models--mlx-community--whisper-large-v3-turbo/snapshots');
const safeEnv = {HOME: os.homedir(), PATH: '/opt/homebrew/bin:/usr/bin:/bin', LANG: 'en_US.UTF-8', HF_HUB_OFFLINE: '1', HF_DATASETS_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', DO_NOT_TRACK: '1', NUMBA_CACHE_DIR: path.join(tools, 'numba-cache')};
const run = (file, args, timeout = 30000) => exec(file, args, {timeout, killSignal: 'SIGKILL', maxBuffer: 2 * 1024 * 1024, env: safeEnv, windowsHide: true});
async function localModel() {
  for (const folder of (await readdir(modelRoot).catch(() => [])).sort()) {
    const dir = path.join(modelRoot, folder);
    try { if ((await stat(path.join(dir, 'weights.safetensors'))).size > 1000000) { await access(path.join(dir, 'config.json')); return dir; } } catch {}
  }
  return null;
}
let cache;
export async function mediaCapabilities() {
  if (cache && Date.now() - cache.time < 30000) return structuredClone(cache.value);
  let ocr = {available: false, detail: '로컬 WASM OCR 또는 한국어·영어 모델 미설치/실행 불가. 원본 사진은 보관해요. node scripts/setup-ocr.mjs로 설치할 수 있어요.'};
  // Native Vision is deliberately not retried. STT is separately investigated, not enabled by this OCR change.
  const stt = {available: false, detail: '로컬 Whisper 실행이 차단되어 음성 인식을 사용할 수 없어요. 원본 음성은 보관해요.'};
  try { const {stdout} = await run(process.execPath, [moduleFile, '--ocr-wasm-capabilities'], 30000); const result = JSON.parse(stdout); if (result.available === true) ocr = {available: true, detail: 'Tesseract.js WASM 한국어·영어 OCR · 기기 내 처리 · runtime 다운로드 없음'}; } catch {}
  cache = {time: Date.now(), value: {ocr, stt}};
  return structuredClone(cache.value);
}
function sniff(buffer, kind) {
  const ascii = (a, b) => buffer.toString('ascii', a, b);
  if (kind === 'photo') {
    if (buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return ['image/png', 'png'];
    if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return ['image/jpeg', 'jpg'];
    if (ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP') return ['image/webp','webp'];
    if (ascii(4,8) === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(ascii(8,12))) return ['image/heic','heic'];
  } else {
    if (ascii(0,4) === 'RIFF' && ascii(8,12) === 'WAVE') return ['audio/wav','wav'];
    if (ascii(0,4) === 'FORM' && ['AIFF','AIFC'].includes(ascii(8,12))) return ['audio/aiff','aiff'];
    if (ascii(0,4) === 'OggS') return ['audio/ogg','ogg'];
    if (buffer.subarray(0,4).equals(Buffer.from([26,69,223,163]))) return ['audio/webm','webm'];
    if (ascii(4,8) === 'ftyp' && /^(M4A |isom|mp42|mp41|qt  )$/.test(ascii(8,12))) return ['audio/mp4','m4a'];
    if (ascii(0,3) === 'ID3' || (buffer[0] === 255 && (buffer[1] & 224) === 224)) return ['audio/mpeg','mp3'];
  }
  throw new Error('지원하지 않거나 손상된 미디어 형식이에요.');
}
export async function processMedia({kind, mime, buffer, storageDir}) {
  if (!['photo','audio'].includes(kind) || !Buffer.isBuffer(buffer) || !buffer.length) throw new Error('사진 또는 음성 파일이 필요해요.');
  if (buffer.length > (kind === 'photo' ? 8 : 16) * 1024 * 1024) throw new Error('파일 크기 제한을 초과했어요.');
  if (typeof mime !== 'string' || mime.length > 128) throw new Error('올바른 MIME 형식이 필요해요.');
  const [canonical, extension] = sniff(buffer, kind);
  const supplied = mime.toLowerCase().split(';')[0].trim();
  const aliases = {'image/jpg':'image/jpeg','image/heif':'image/heic','audio/x-wav':'audio/wav','audio/wave':'audio/wav','audio/x-aiff':'audio/aiff','audio/x-m4a':'audio/mp4'};
  if ((aliases[supplied] || supplied) !== canonical) throw new Error('MIME과 파일 내용이 일치하지 않아요.');
  if (typeof storageDir !== 'string' || !path.isAbsolute(storageDir)) throw new Error('로컬 저장 경로가 필요해요.');
  await mkdir(storageDir, {recursive:true, mode:0o700});
  const scratch = await mkdtemp(path.join(storageDir, 'media-work-'));
  const source = path.join(scratch, `input.${extension}`);
  await writeFile(source, buffer, {mode:0o600, flag:'wx'});
  const result = {mime:canonical, buffer, ocrText:null, transcript:null, processing:'unavailable', detail:''};
  const caps = await mediaCapabilities();
  const cap = kind === 'photo' ? caps.ocr : caps.stt;
  if (!cap.available) return {...result, detail:cap.detail};
  try {
    if (kind === 'photo') {
      const {stdout} = await run(process.execPath, [moduleFile, '--ocr-wasm', source], 60000);
      const parsed = JSON.parse(stdout);
      if (typeof parsed.text !== 'string') throw new Error('invalid OCR output');
      result.ocrText = parsed.text.trim().slice(0, 30000);
      result.processing = result.ocrText ? 'ready' : 'failed';
      result.detail = result.ocrText ? '로컬 WASM OCR 원문이에요. 오인식 가능성이 있어요. 작업 사실로 자동 확정하지 않아요.' : '사진에서 글자를 찾지 못했어요. 원본은 보관했어요.';
    } else {
      const wav = path.join(scratch, 'normalized.wav');
      await run(ffmpeg, ['-nostdin','-v','error','-protocol_whitelist','file,pipe','-i',source,'-vn','-ac','1','-ar','16000','-t','300',wav], 30000);
      const model = await localModel(); if (!model) throw new Error('model unavailable');
      await run(whisper, [wav,'--model',model,'--language','ko','--task','transcribe','--output-format','json','--output-name','transcript','--output-dir',scratch,'--verbose','False'], 180000);
      const parsed = JSON.parse(await readFile(path.join(scratch, 'transcript.json'), 'utf8'));
      if (typeof parsed.text !== 'string') throw new Error('invalid STT output');
      result.transcript = parsed.text.trim().slice(0,30000);
      result.processing = result.transcript ? 'ready' : 'failed';
      result.detail = result.transcript ? '로컬 음성 인식 결과예요. 최대 앞 5분을 처리해요. 확인 후 저장해 주세요.' : '음성을 인식하지 못했어요. 원본은 보관했어요.';
    }
  } catch { result.processing = 'failed'; result.detail = '로컬 처리 실패 또는 시간 초과예요. 원본은 그대로 보관했어요. 직접 내용을 입력할 수 있어요.'; }
  return result;
}

// Isolated Node subprocess owns all WASM worker threads. Parent timeout kills the entire process.
// Only local Buffer inputs are accepted; URL/download APIs are disabled in offline-worker.cjs.
async function wasmOCR(inputPath) {
  const langPath = path.join(ocrDir, 'models');
  for (const lang of ['kor', 'eng']) {
    const info = await stat(path.join(langPath, `${lang}.traineddata.gz`));
    if (!info.isFile() || info.size < 100000) throw new Error('LOCAL_OCR_MODEL_MISSING');
  }
  const workerPath = path.join(ocrDir, 'offline-worker.cjs');
  await access(workerPath);
  const {default: tesseract} = await import(pathToFileURL(path.join(ocrDir, 'node_modules/tesseract.js/src/index.js')).href);
  const worker = await tesseract.createWorker('kor+eng', 1, {
    workerPath, langPath, gzip: true, cacheMethod: 'none',
    logger: () => {}, errorHandler: () => { console.log(JSON.stringify({error:'Local WASM OCR worker failed',code:'OCR_WORKER_FAILED'})); process.exit(1); },
  });
  try {
    if (!inputPath) return {available: true, engine: 'tesseract.js-wasm', languages: ['kor','eng'], runtimeNetwork: false};
    const image = await readFile(inputPath);
    if (image.length > 8 * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE');
    if (image.length >= 24 && image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
      const width=image.readUInt32BE(16), height=image.readUInt32BE(20);
      if (!width || !height || width>20000 || height>20000 || width*height>40000000) throw new Error('IMAGE_DIMENSIONS_TOO_LARGE');
    }
    const {data} = await worker.recognize(image);
    return {text: data.text, confidence: data.confidence, engine: 'tesseract.js-wasm'};
  } finally { await worker.terminate(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === moduleFile && ['--ocr-wasm','--ocr-wasm-capabilities'].includes(process.argv[2])) {
  try {
    const inputPath=process.argv[2]==='--ocr-wasm' ? process.argv[3] : undefined;
    if (process.argv[2]==='--ocr-wasm' && (!inputPath || !path.isAbsolute(inputPath))) throw new Error('LOCAL_PATH_REQUIRED');
    console.log(JSON.stringify(await wasmOCR(inputPath)));
    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({error:'Local WASM OCR failed or local models are missing',code:error?.code || 'OCR_FAILED'}));
    process.exit(1);
  }
}
