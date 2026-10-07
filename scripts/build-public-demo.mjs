import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public-demo');
await mkdir(output, { recursive: true });
const workspaceFiles = ['app.js','shared.js','farmer.js','admin.js','styles.css'];
const publicFiles = ['index.html','privacy.html','runtime.js','demo-api.js','manifest.webmanifest','service-worker.js','icon.svg'];
for (const file of workspaceFiles) await copyFile(path.join(root, 'src/workspace', file), path.join(output, file));
for (const file of publicFiles) await copyFile(path.join(root, 'src/public-demo', file), path.join(output, file));
await copyFile(path.join(root, 'src/public-demo/index.html'), path.join(output, '404.html'));
await writeFile(path.join(output, '.nojekyll'), '');
const required = [...workspaceFiles, ...publicFiles, '404.html', '.nojekyll'];
for (const file of required) await readFile(path.join(output, file));
console.log(`Built ${required.length} static files in ${output}`);
