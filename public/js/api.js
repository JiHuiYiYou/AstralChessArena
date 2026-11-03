/**
 * api.js —— 后端接口封装。
 */

/** 接口前缀（各方法里的路径已经带 /api，这里不要再加） */
const BASE = '';

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`服务器返回了非 JSON 内容（HTTP ${res.status}）`);
  }
  if (!json.ok) {
    const err = new Error(json.error?.message ?? '请求失败');
    err.code = json.error?.code ?? 'INTERNAL';
    throw err;
  }
  return json.data;
}

const qs = (obj) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj ?? {})) {
    if (v !== undefined && v !== null) p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  /* 元数据 */
  meta: () => request('GET', '/api/meta'),

  /* 存档 */
  listSaves: () => request('GET', '/api/saves'),
  createSave: (slot) => request('POST', `/api/saves/${slot}`),
  getSave: (slot) => request('GET', `/api/saves/${slot}`),
  saveState: (slot, payload) => request('PUT', `/api/saves/${slot}`, payload),
  deleteSave: (slot) => request('DELETE', `/api/saves/${slot}`),

  /* 阵容与养成 */
  formation: (slot, placements) => request('POST', `/api/saves/${slot}/formation`, { placements }),
  train: (slot, heroId) => request('POST', `/api/saves/${slot}/train`, { heroId }),
  ascend: (slot, heroIdA, heroIdB) => request('POST', `/api/saves/${slot}/ascend`, { heroIdA, heroIdB }),
  breakthrough: (slot, heroId, stat) => request('POST', `/api/saves/${slot}/breakthrough`, { heroId, stat }),
  enchant: (slot, heroId, saveCardId) => request('POST', `/api/saves/${slot}/enchant`, { heroId, saveCardId }),
  equip: (slot, heroId, equipmentCode) => request('POST', `/api/saves/${slot}/equip`, { heroId, equipmentCode }),
  bag: (slot) => request('GET', `/api/saves/${slot}/bag`),
  equipItem: (slot, itemId, heroId) => request('POST', `/api/saves/${slot}/equip-item`, { itemId, heroId }),

  /* 商店 */
  shop: (slot) => request('GET', `/api/saves/${slot}/shop`),
  buy: (slot, slotIndex) => request('POST', `/api/saves/${slot}/shop/buy`, { slotIndex }),
  sell: (slot, heroId) => request('POST', `/api/saves/${slot}/shop/sell`, { heroId }),
  refreshShop: (slot) => request('POST', `/api/saves/${slot}/shop/refresh`),
  startRound: (slot) => request('POST', `/api/saves/${slot}/round`),

  /* 战斗 */
  battle: (slot) => request('POST', `/api/saves/${slot}/battle`),
  setChapter: (slot, chapter) => request('POST', `/api/saves/${slot}/chapter`, { chapter }),
  battles: (slot, limit = 30) => request('GET', `/api/saves/${slot}/battles${qs({ limit })}`),
  battleById: (id) => request('GET', `/api/battles/${id}`),
};
