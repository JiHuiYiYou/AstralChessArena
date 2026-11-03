/**
 * http/router.js —— 极简路由（零依赖）。
 *
 * 支持 `/api/saves/:slot` 这样的路径参数。
 * handler 返回值会被包成 { ok: true, data }；
 * handler 抛出带 code 的 Error 会被包成 { ok: false, error: { code, message } }。
 */

export function createRouter() {
  const routes = [];

  function add(method, pattern, handler) {
    const keys = [];
    const regexSrc = pattern
      .split('/')
      .map((seg) => {
        if (seg.startsWith(':')) {
          keys.push(seg.slice(1));
          return '([^/]+)';
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    routes.push({ method, regex: new RegExp(`^${regexSrc}/?$`), keys, handler });
  }

  return {
    get: (p, h) => add('GET', p, h),
    post: (p, h) => add('POST', p, h),
    put: (p, h) => add('PUT', p, h),
    delete: (p, h) => add('DELETE', p, h),

    /**
     * @returns {{handler:Function, params:object}|null}
     */
    match(method, pathname) {
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.regex.exec(pathname);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        return { handler: r.handler, params };
      }
      return null;
    },

    /** 路由清单（用于启动日志） */
    list() {
      return routes.map((r) => `${r.method} ${r.regex.source}`);
    },
  };
}
