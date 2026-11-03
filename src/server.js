/**
 * server.js —— HTTP 服务：API 路由 + 静态资源。
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { PUBLIC_DIR } from './config.js';
import { readJsonBody, sendError, sendJson } from './http/body.js';
import { buildRouter } from './http/routes/index.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * 创建 HTTP 服务。
 * @param {import('./http/router.js').createRouter extends () => any ? any : any} [router]
 */
export function createServer(router = buildRouter()) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    // ---- API ----
    if (pathname.startsWith('/api/')) {
      const match = router.match(req.method, pathname);
      if (!match) {
        sendJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: `没有这个接口：${req.method} ${pathname}` } });
        return;
      }
      try {
        const body = await readJsonBody(req);
        const query = Object.fromEntries(url.searchParams.entries());
        const data = await match.handler({ req, res, params: match.params, query, body });
        sendJson(res, 200, { ok: true, data });
      } catch (err) {
        if (!err?.code) {
          console.error('[api] 未处理的异常：', err);
        }
        sendError(res, err);
      }
      return;
    }

    // ---- 静态资源 ----
    serveStatic(pathname, res);
  });
}

/** 提供 public/ 下的静态文件 */
function serveStatic(pathname, res) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  // 防目录穿越
  const target = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!target.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      // 单页应用：未知路径回落到 index.html
      const fallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(fallback, (e2, buf) => {
        if (e2) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(buf);
      });
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(target).pipe(res);
  });
}
