import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { FastifyReply, FastifyRequest } from 'fastify';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

/**
 * Serves the built frontend (a single-page app) from `dir`: real files as they are, anything else as index.html so client-side routes work.
 * Paths are resolved inside `dir` only. Hashed assets are cached for a year; index.html and the service worker are never cached.
 */
export function staticHandler(dir: string) {
  const root = resolve(dir);
  const index = join(root, 'index.html');
  return async (req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply.code(404).send({ error: 'not_found' });
    if (!existsSync(index)) return reply.code(404).type('text/plain').send('The frontend has not been built. Run "npm run build" in frontend/.');
    const url = decodeURIComponent((req.url.split('?')[0] ?? '/').replace(/\0/g, ''));
    let file = resolve(join(root, normalize(url)));
    if (file !== root && !file.startsWith(root + sep)) return reply.code(403).send({ error: 'forbidden' });
    let isFile = false;
    try {
      isFile = existsSync(file) && statSync(file).isFile();
    } catch {
      isFile = false;
    }
    if (!isFile) {
      // a missing asset is a real 404; anything else is a client-side route
      if (extname(url) && url.startsWith('/assets/')) return reply.code(404).send({ error: 'not_found' });
      file = index;
    }
    const ext = extname(file).toLowerCase();
    const isIndex = file === index;
    const noCache = isIndex || file.endsWith('sw.js');
    reply
      .header('Content-Type', MIME[ext] ?? 'application/octet-stream')
      .header('Cache-Control', noCache ? 'no-cache' : url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
    return reply.send(createReadStream(file));
  };
}
