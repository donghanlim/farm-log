import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public-demo');
const base = await realpath(root);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml; charset=utf-8'};
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (!relative || relative.includes('..') || relative.includes('\\') || relative.includes('\0')) throw Object.assign(new Error('bad path'),{status:400});
    let file = path.join(base, relative);
    try { if (!(await stat(file)).isFile()) throw new Error('not file'); } catch { file = path.join(base, 'index.html'); }
    file = await realpath(file);
    if (!file.startsWith(base + path.sep)) throw Object.assign(new Error('forbidden'),{status:403});
    const bytes = await readFile(file);
    res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(bytes);
  } catch (error) { res.writeHead(error.status || 404); res.end('Not found'); }
});
server.listen(0,'127.0.0.1',() => console.log(`Public demo preview: http://127.0.0.1:${server.address().port}/`));
const close = () => server.close();
process.once('SIGINT',close); process.once('SIGTERM',close);
