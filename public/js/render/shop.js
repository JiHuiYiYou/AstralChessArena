/**
 * render/shop.js —— 商店面板。
 */

import { formatNum } from '../battle/vfx.js';

const RARITY_LABEL = { common: '普通', rare: '稀有', epic: '史诗' };

const RARITY_COLOR = {
  common: 'var(--text-secondary)',
  rare: 'var(--accent-blue)',
  epic: 'var(--accent-purple)',
};

function rarityColor(r) {
  return RARITY_COLOR[r] ?? 'var(--text-secondary)';
}

/**
 * @param {HTMLElement} container
 * @param {object} data { slots, gold, refreshCost, freeRefreshLeft }
 * @param {object} handlers { onBuy(slotIndex), onRefresh(), onSell(heroId) }
 */
export function renderShop(container, data, handlers = {}) {
  const slots = data.slots ?? [];
  const slotHtml = slots.map((s) => {
    if (s.sold) {
      return '<div class="shop-slot empty"><div class="shop-slot-glyph">—</div><div class="shop-slot-name">已售出</div></div>';
    }
    const star = s.star > 1 ? `<div class="shop-slot-star">${'★'.repeat(s.star)}</div>` : '';
    const price = `<div class="shop-slot-price">💰 ${s.price}</div>`;
    if (s.kind === 'card') {
      return `<div class="shop-slot" data-slot="${s.slotIndex}">
        <div class="shop-slot-glyph">🃏</div>
        <div class="shop-slot-name">随机卡牌</div>
        ${price}
      </div>`;
    }
    if (s.kind === 'equipment') {
      return `<div class="shop-slot" data-slot="${s.slotIndex}">
        <div class="shop-slot-glyph">⚙</div>
        <div class="shop-slot-name">${escapeHtml(s.name ?? '装备')}</div>
        <div class="shop-slot-star" style="color:${rarityColor(s.rarity)}">${RARITY_LABEL[s.rarity] ?? s.rarity}</div>
        ${price}
      </div>`;
    }
    return `<div class="shop-slot" data-slot="${s.slotIndex}">
      <div class="shop-slot-glyph">${escapeHtml(s.glyph ?? '?')}</div>
      <div class="shop-slot-name">${escapeHtml(s.name ?? '')}</div>
      ${star}
      ${price}
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">星域商店</span>
        <span class="panel-sub">💰 ${formatNum(data.gold ?? 0)}</span>
      </div>
      <div class="panel-body">
        <div class="shop-row">${slotHtml}</div>
        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
          <button class="btn btn-blue btn-sm" data-act="refresh">
            ⟳ 刷新（${data.refreshCost === 0 ? '免费' : `💰 ${data.refreshCost}`}）
          </button>
          <span class="muted" style="align-self:center;font-size:12px">本回合免费刷新还剩 ${data.freeRefreshLeft ?? 0} 次</span>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="panel-head"><span class="panel-title">背包 · 卡牌</span></div>
      <div class="panel-body" id="card-bag">
        ${renderCardBag(data.cards ?? [])}
      </div>
    </div>
  `;

  container.querySelectorAll('.shop-slot[data-slot]').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.slot);
      const slot = slots.find((s) => s.slotIndex === idx);
      if (!slot || slot.sold) return;
      handlers.onBuy?.(idx);
    });
  });

  container.querySelector('[data-act="refresh"]')?.addEventListener('click', () => handlers.onRefresh?.());

  container.querySelectorAll('[data-card-use]').forEach((el) => {
    el.addEventListener('click', () => handlers.onUseCard?.(Number(el.dataset.cardUse)));
  });
}

/** 卡牌背包 */
export function renderCardBag(cards) {
  const usable = cards.filter((c) => !c.isUsed);
  if (usable.length === 0) {
    return '<div class="empty-state">暂无可用卡牌，去商店碰碰运气</div>';
  }
  return `<div class="hero-tags">${usable.map((c) => `
    <span class="tag" data-card-use="${c.id}" style="cursor:pointer" title="点击后选择棋子附魔">
      ${escapeHtml(c.statName)} ${c.operation === 'mul' ? '×' : '+'}${Number(c.value).toFixed(2)}
      <em style="opacity:.6;font-style:normal">${RARITY_LABEL[c.rarity] ?? c.rarity}</em>
    </span>`).join('')}</div>`;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;',
  })[c]);
}
