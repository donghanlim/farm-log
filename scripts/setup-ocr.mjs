// Mac/Node setup only. Public packages and OCR data download once; no user media is read.
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.join(root,'.local-data/farmer-app-tools/ocr');
console.log('Downloading public free npm dependencies and Korean/English OCR models only. No private user data is read or transmitted. Runtime downloads are disabled.');
await mkdir(dir,{recursive:true,mode:0o700});
if(!process.argv.includes('--installed')) {
 await promisify(execFile)('npm',['install','--prefix',dir,'--cache',path.join(dir,'npm-cache'),'--ignore-scripts','--no-audit','--no-fund','--save-exact','tesseract.js@7.0.0','@tesseract.js-data/kor@1.0.0','@tesseract.js-data/eng@1.0.0'],{timeout:180000,maxBuffer:2097152});
}
await mkdir(path.join(dir,'models'),{recursive:true,mode:0o700});
const lock=JSON.parse(await readFile(path.join(dir,'package-lock.json'),'utf8'));
const models=[];
for(const lang of ['kor','eng']){
 const relative=`node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`;
 const dest=path.join(dir,'models',`${lang}.traineddata.gz`);
 await copyFile(path.join(dir,relative),dest);
 const data=await readFile(dest);const pkg=lock.packages[`node_modules/@tesseract.js-data/${lang}`];
 models.push({language:lang,version:pkg.version,source:pkg.resolved,packageIntegrity:pkg.integrity,member:relative,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
}
// Tesseract worker sees this before loading its adapter. No HTTP downloader exists at runtime.
await writeFile(path.join(dir,'offline-worker.cjs'),`'use strict';\nconst deny=()=>{throw new Error('OCR_RUNTIME_NETWORK_DISABLED');};\nglobalThis.fetch=async()=>deny();\nfor(const name of ['node:http','node:https']){const m=require(name);m.request=deny;m.get=deny;}\nconst net=require('node:net');net.connect=deny;net.createConnection=deny;net.Socket.prototype.connect=deny;\nrequire('./node_modules/tesseract.js/src/worker-script/node/index.js');\n`,{mode:0o600});
const metadata={installedAt:new Date().toISOString(),engine:'tesseract.js',version:lock.packages['node_modules/tesseract.js'].version,coreVersion:lock.packages['node_modules/tesseract.js-core'].version,coreSource:lock.packages['node_modules/tesseract.js-core'].resolved,coreIntegrity:lock.packages['node_modules/tesseract.js-core'].integrity,engineSource:lock.packages['node_modules/tesseract.js'].resolved,engineIntegrity:lock.packages['node_modules/tesseract.js'].integrity,models,runtimeNetwork:false,nativeExecutables:false,npmLifecycleScripts:false};
await writeFile(path.join(dir,'setup-metadata.json'),JSON.stringify(metadata,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(metadata,null,2));
