import http from 'node:http';
import { readFile } from 'node:fs/promises';

const repository = new URL('../', import.meta.url);
const shared = 'forge/design/candidate-sets/web-nanoduck-equal-nodes-20260913/v8/shared/';
const types = { html: 'text/html', css: 'text/css', js: 'text/javascript', json: 'application/json', svg: 'image/svg+xml' };
const port = Number(process.env.PORT || 4328);
function assetFor(pathname) {
  if (pathname === '/comparison/' || pathname === '/comparison/index.html') return `${shared}index.html`;
  if (pathname === '/comparison.css') return `${shared}comparison.css`;
  const candidate = pathname.match(/^\/([abc])\/(v[1-9]\d*)\/(index\.html|styles\.css|app\.js|[a-z0-9-]+\.(?:json|svg))?$/);
  if (candidate) return `forge/design/candidates/${candidate[1]}/${candidate[2]}/${candidate[3] || 'index.html'}`;
  const legacy = pathname.match(/^\/legacy\/(index\.html|styles\.css|app\.js)?$/);
  return legacy ? `prototype/${legacy[1] || 'index.html'}` : null;
}
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if ((pathname === '/' || pathname === '/index.html') && ['GET', 'HEAD'].includes(req.method)) { res.writeHead(302, { Location: '/a/v8/', 'Cache-Control': 'no-store' }); res.end(); return; }
  const path = assetFor(pathname);
  if (!path || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(new URL(path, repository));
    res.writeHead(200, {
      'Content-Type': `${types[path.split('.').pop()]}; charset=utf-8`, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'microphone=(), camera=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'none'; frame-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'none'"
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { res.writeHead(404); res.end('Preview asset unavailable'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Three design options: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
