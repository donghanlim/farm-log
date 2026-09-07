// Local development supervisor. Polls a few source files, no recursive fs.watch.
// Restarts its own child via IPC so the writer lock is closed normally.
import {fork} from 'node:child_process';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=['src/app-server.mjs','src/app/store.mjs','src/app/template.mjs','src/app/ai.mjs','src/app/media.mjs'];
const signature=async()=>JSON.stringify(await Promise.all(files.map(async f=>{try{return (await stat(path.join(root,f))).mtimeMs;}catch{return null;}})));
let last=await signature(),child,restarting=false,closing=false;
function start(){child=fork(path.join(root,'src/app-server.mjs'),[],{cwd:root,stdio:['ignore','inherit','inherit','ipc']});child.on('error',e=>console.error('Development child error:',e.message));child.on('exit',code=>{child=null;if(restarting&&!closing){restarting=false;start();}else if(!closing)console.error('App exited; edit a source file to retry. Exit code:',code);});}
start();
const timer=setInterval(async()=>{if(restarting||closing)return;const next=await signature();if(next===last)return;last=next;if(child?.connected){restarting=true;child.send({type:'farm-log-dev-reload'});}else start();},1500);
function stop(){closing=true;clearInterval(timer);if(child?.connected)child.send({type:'farm-log-dev-reload'});}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
