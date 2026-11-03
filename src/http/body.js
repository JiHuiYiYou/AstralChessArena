/**
 * http/body.js —— 请求体解析与统一响应。
 */

const MAX_BODY_BYTES = 1024 * 1024; // 1MB，足够放下一份完整存档

/** 读取并解析 JSON 请求体 */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      resolve({});
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('请求体过大'), { code: 'PAYLOAD_TOO_LARGE' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(Object.assign(new Error('请求体不是合法 JSON'), { code: 'BAD_JSON' }));
      }
    });
    req.on('error', reject);
  });
}

/** 统一成功响应 */
export function sendJson(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(text),
    'Cache-Control': 'no-store',
  });
  res.end(text);
}

/** 统一错误响应 */
export function sendError(res, err) {
  const code = err?.code ?? 'INTERNAL';
  const message = err?.message ?? '服务器内部错误';
  const status = {
    NOT_FOUND: 404,
    BAD_REQUEST: 400,
    BAD_JSON: 400,
    NO_GOLD: 402,
    AT_CAP: 409,
    TOO_MANY: 409,
    EMPTY_BOARD: 409,
    ROSTER_FULL: 409,
    PAYLOAD_TOO_LARGE: 413,
    INTERNAL: 500,
  }[code] ?? 500;
  sendJson(res, status, { ok: false, error: { code, message } });
}
