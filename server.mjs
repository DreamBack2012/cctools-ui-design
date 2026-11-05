import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.md': 'text/plain' };
const server = http.createServer(async (request, response) => {
    try {
        const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
        const relative = file.slice(root.length);
        if (!file.startsWith(root) || relative.split(sep).some(part => part.startsWith('.')) || !['/index.html', '/src/', '/docs/', '/third_party/sheetjs/'].some(prefix => path === '/' || path.startsWith(prefix))) {
            response.writeHead(404).end('Not found');
            return;
        }
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
        response.end(body);
    } catch {
        response.writeHead(404).end('Not found');
    }
});
server.listen(port, host, () => console.log(`CCTools prototype: http://${host}:${port}`));
