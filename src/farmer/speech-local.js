// Browser-only Whisper tiny multilingual q8. Inputs never leave this origin.
export const SPEECH_ENGINE = 'whisper-tiny-q8-wasm-local';
const ASSETS = '/speech-assets/';
const MODEL = 'onnx-community/whisper-tiny';
const MAX_MS = 180_000;
const FILES = ['vendor/transformers.js','wasm/ort-wasm-simd-threaded.jsep.mjs','wasm/ort-wasm-simd-threaded.jsep.wasm',...['config.json','generation_config.json','preprocessor_config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','onnx/encoder_model_quantized.onnx','onnx/decoder_model_merged_quantized.onnx'].map(f=>`models/${MODEL}/${f}`)];
let active = null;
// Digital-silence/invalid-sample guard only. This is NOT speech/VAD detection.
export function inspectSpeechPCM(pcm) {
  if(!(pcm instanceof Float32Array) || !pcm.length) throw new Error('음성 샘플이 비어 있어요. 다시 녹음해 주세요.');
  let peak = 0, sumSquares = 0;
  for(const value of pcm) {
    if(!Number.isFinite(value)) throw new Error('음성 샘플이 손상되었어요. 다시 녹음해 주세요.');
    peak = Math.max(peak,Math.abs(value)); sumSquares += value*value;
  }
  if(peak === 0) throw new Error('녹음에 소리가 없어요. 마이크를 확인하고 다시 녹음해 주세요.');
  return {peak,rms:Math.sqrt(sumSquares/pcm.length),speechDetected:null};
}
export async function speechAvailability() {
  if(typeof window === 'undefined' || !globalThis.Worker || !globalThis.WebAssembly || !globalThis.AudioContext || !globalThis.OfflineAudioContext) return {available:false,engine:SPEECH_ENGINE,detail:'이 브라우저는 로컬 음성 인식을 지원하지 않아요.'};
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),8000);
  try {
    const results = await Promise.all(FILES.map(async f => (await fetch(ASSETS+f,{method:'HEAD',signal:controller.signal,cache:'no-cache'})).ok));
    return {available:results.every(Boolean),engine:SPEECH_ENGINE,detail:results.every(Boolean)?'로컬 모델 파일 준비됨. 첫 실행에서 WASM을 초기화해요.':'로컬 음성 모델 파일이 없어요. 설정 후 다시 시도해 주세요.',inferenceVerified:false};
  } catch { return {available:false,engine:SPEECH_ENGINE,detail:'로컬 음성 파일을 확인하지 못했어요. 연결 후 다시 시도해 주세요.'}; }
  finally { clearTimeout(timer); }
}
export function cancelLocalSpeech() { active?.cancel(); }
export async function transcribeLocal(blob, onProgress = ()=>{}, {signal} = {}) {
  if(active) throw new Error('음성 인식이 이미 진행 중이에요. 취소 후 다시 시도해 주세요.');
  if(!(blob instanceof Blob) || !blob.size || blob.size > 16*1024*1024) throw new Error('음성 파일은 비어 있지 않은 16MB 이하 파일이어야 해요.');
  if(signal?.aborted) throw new DOMException('음성 인식 취소','AbortError');
  const notify = event => { try { onProgress(event); } catch {} };
  let worker, context, timer, abortListener;
  let cancelled = false;
  const abortError = () => new DOMException('음성 인식이 취소되었어요. 다시 시도할 수 있어요.','AbortError');
  return new Promise((resolve,reject)=>{
    const finish = (error,value) => {
      if(cancelled) return;
      cancelled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort',abortListener);
      worker?.terminate();
      if(context && context.state!=='closed') context.close().catch(()=>{});
      active = null;
      if(error) { notify({status:'failed',detail:error.message,retryable:true}); reject(error); }
      else { notify({status:'complete'}); resolve(value); }
    };
    active = {cancel:()=>finish(abortError())};
    abortListener = ()=>finish(abortError());
    signal?.addEventListener('abort',abortListener,{once:true});
    timer = setTimeout(()=>finish(new Error('음성 인식이 180초를 초과했어요. 짧게 녹음하고 다시 시도해 주세요.')),MAX_MS);
    (async()=>{
      notify({status:'decoding'});
      context = new AudioContext();
      const decoded = await context.decodeAudioData(await blob.arrayBuffer());
      if(cancelled) return;
      if(!Number.isFinite(decoded.duration) || decoded.duration<=0 || decoded.duration>180) throw new Error('음성은 180초 이하로 녹음해 주세요.');
      const offline = new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);
      const source = offline.createBufferSource(); source.buffer = decoded; source.connect(offline.destination); source.start();
      const pcm = (await offline.startRendering()).getChannelData(0).slice();
      const energy = inspectSpeechPCM(pcm);
      notify({status:'audio-checked',...energy});
      await context.close();
      if(cancelled) return;
      notify({status:'loading',detail:'로컬 음성 모델을 준비하고 있어요.'});
      worker = new Worker(new URL('./speech-local.js',import.meta.url),{type:'module'});
      worker.onmessage = ({data}) => {
        if(data.type==='progress') notify(data.progress);
        else if(data.type==='result') finish(null,{text:data.text,engine:SPEECH_ENGINE});
        else if(data.type==='error') finish(new Error(data.error));
      };
      worker.onerror = e => finish(new Error(e.message || '로컬 음성 인식 오류. 다시 시도해 주세요.'));
      worker.postMessage({type:'transcribe',pcm},[pcm.buffer]);
    })().catch(error=>finish(error));
  });
}
// One dedicated worker per request makes cancellation terminate decoder inference.
if(typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input,init) => {
    const url = new URL(typeof input==='string'?input:input.url ?? input,globalThis.location.href);
    if(url.origin!==globalThis.location.origin || !url.pathname.startsWith(ASSETS)) throw new Error('External speech request blocked');
    return originalFetch(input,init);
  };
  globalThis.onmessage = async ({data}) => {
    if(data.type!=='transcribe') return;
    try {
      const {env,pipeline} = await import('/speech-assets/vendor/transformers.js');
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = '/speech-assets/models/';
      env.useBrowserCache = false;
      env.backends.onnx.wasm.wasmPaths = '/speech-assets/wasm/';
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
      const pipe = await pipeline('automatic-speech-recognition',MODEL,{device:'wasm',dtype:'q8',local_files_only:true,progress_callback:progress=>postMessage({type:'progress',progress})});
      postMessage({type:'progress',progress:{status:'transcribing',backend:'wasm',language:'korean'}});
      const result = await pipe(data.pcm,{language:'korean',task:'transcribe',chunk_length_s:30,stride_length_s:5,max_new_tokens:128});
      postMessage({type:'progress',progress:{status:'inference-complete',backend:'wasm',resources:performance.getEntriesByType('resource').map(entry=>entry.name)}});
      postMessage({type:'result',text:result.text.trim()});
      await pipe.dispose();
    } catch(error) { postMessage({type:'error',error:error.message || String(error)}); }
  };
}
