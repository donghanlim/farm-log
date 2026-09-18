// Isolated demonstration data. Never copies or modifies the original farmer-app journal.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFarmerServer } from '../src/app-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preview = process.argv.includes('--preview');
const port = preview ? 0 : 8881;
const directory = preview ? '.local-data/workspace-preview' : '.local-data/workspace-demo';
const server = await createFarmerServer({ dataDir: path.join(root, directory), port });
const close = () => server.close(error => {
  if (error) { console.error(error.message); process.exitCode = 1; }
});
process.once('SIGINT', close);
process.once('SIGTERM', close);
server.once('error', error => { console.error(error.message); process.exitCode = 1; close(); });
server.listen(port, () => {
  const base = `http://127.0.0.1:${server.address().port}`;
  console.log(`Farmer app: ${base}/mvp`);
  console.log(`Admin:      ${base}/admin`);
  console.log(`Isolated journal: ${directory} (test data only)`);
});
