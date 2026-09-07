// Mac: node scripts/setup-browser-speech.mjs
// No npm install, native backend, global configuration, or runtime CDN required.
import { mkdir, readFile, writeFile, stat, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
export const ROOT = fileURLToPath(new URL('../.local-data/farmer-app-tools/browser-speech/', import.meta.url));
export const VERSION = '3.8.1';
export const REVISION = 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7';
export const MODEL = 'onnx-community/whisper-tiny';
export const MODEL_FILES = ['config.json','generation_config.json','preprocessor_config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','onnx/encoder_model_quantized.onnx','onnx/decoder_model_merged_quantized.onnx'];
const LIMIT = 200_000_000;
export async function setup() {
  let downloadedBytes = 0;
  const assets = [];
  await mkdir(path.join(ROOT,'downloads'),{recursive:true});
  async function download(url, relative, expectedHash) {
    const dest = path.join(ROOT, relative);
    await mkdir(path.dirname(dest),{recursive:true});
    let data;
    try { data = await readFile(dest); } catch {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Download ${response.status}: ${url}`);
      const chunks = [];
      for await (const chunk of response.body) {
        downloadedBytes += chunk.length;
        if(downloadedBytes > LIMIT) throw new Error('Download budget exceeded');
        chunks.push(chunk);
      }
      data = Buffer.concat(chunks);
      await writeFile(dest,data);
    }
    const sha256 = createHash('sha256').update(data).digest('hex');
    if(expectedHash && expectedHash !== sha256) throw new Error(`Integrity mismatch: ${relative}`);
    assets.push({path:relative,url,bytes:data.length,sha256});
    return data;
  }
  const metadata = JSON.parse(await download(`https://registry.npmjs.org/@huggingface/transformers/${VERSION}`,'downloads/transformers-metadata.json'));
  const tgz = await download(metadata.dist.tarball,'downloads/transformers.tgz');
  if(`sha512-${createHash('sha512').update(tgz).digest('base64')}` !== metadata.dist.integrity) throw new Error('npm integrity mismatch');
  await mkdir(path.join(ROOT,'vendor'),{recursive:true});
  await mkdir(path.join(ROOT,'wasm'),{recursive:true});
  execFileSync('tar',['-xzf',path.join(ROOT,'downloads/transformers.tgz'),'-C',path.join(ROOT,'vendor'),'--strip-components=2','package/dist/transformers.js','package/dist/ort-wasm-simd-threaded.jsep.mjs','package/dist/ort-wasm-simd-threaded.jsep.wasm']);
  for(const name of ['ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm']) await copyFile(path.join(ROOT,'vendor',name),path.join(ROOT,'wasm',name));
  // transformers.web.js has bare external imports; transformers.js bundles ORT.
  const bundle = await readFile(path.join(ROOT,'vendor/transformers.js'),'utf8');
  if(/^import\s.*from\s+["'][^./]/m.test(bundle)) throw new Error('Unexpected external static import');
  const tree = JSON.parse(await download(`https://huggingface.co/api/models/${MODEL}/tree/${REVISION}/onnx`,'downloads/model-onnx-tree.json'));
  for(const file of MODEL_FILES) {
    const modelInfo = tree.find(x=>x.path === file);
    if(file.endsWith('.onnx') && !modelInfo) throw new Error(`Model metadata missing ${file}`);
    await download(`https://huggingface.co/${MODEL}/resolve/${REVISION}/${file}`,`models/${MODEL}/${file}`,modelInfo?.lfs?.oid);
  }
  const runtime = ['vendor/transformers.js','wasm/ort-wasm-simd-threaded.jsep.mjs','wasm/ort-wasm-simd-threaded.jsep.wasm',...MODEL_FILES.map(f=>`models/${MODEL}/${f}`)];
  const runtimeAssets = await Promise.all(runtime.map(async file=>({path:file,bytes:(await stat(path.join(ROOT,file))).size,sha256:createHash('sha256').update(await readFile(path.join(ROOT,file))).digest('hex')})));
  const manifest = {version:VERSION,model:MODEL,revision:REVISION,downloadedBytesThisRun:downloadedBytes,sourceDownloadBytes:assets.reduce((s,x)=>s+x.bytes,0),runtimeBytes:runtimeAssets.reduce((s,x)=>s+x.bytes,0),assets:runtimeAssets,sources:assets};
  await writeFile(path.join(ROOT,'manifest.json'),JSON.stringify(manifest,null,2));
  console.log(JSON.stringify({ready:true,...manifest,assets:undefined,sources:undefined},null,2));
  return manifest;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await setup();
