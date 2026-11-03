/**
 * render/roster.js —— 阵容面板（棋子卡）与图鉴。
 */

import { formatNum } from '../battle/vfx.js';
import { escapeHtml } from './shop.js';

/**
 * @param {HTMLElement} container
 * @param {object} data { heroes, templates, equipments, selectedId }
 * @param {object} handlers { onSelect, onTrain, onAscend, onBreakthrough, onEquip, onDeploy, onSell }
 */
export function renderRoster(container, data, handlers = {}) {
  // 按战力降序 —— 最强的排在前面，玩家一眼就知道该带谁上场
  // （自动通关模拟实测：把一堆 1 级棋子全塞上场会被平均战力稀释，打到第 3 章就卡住）
  const heroes = (data.heroes ?? [])
    .filter((h) => h.isAlly && h.exist)
    .sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
  const items = data.items ?? [];

  container.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">我方阵容</span>
        <span class="panel-sub">${heroes.filter((h) => h.file !== null).length} / ${data.maxBoardPieces ?? 5} 上阵 · 库存 ${heroes.length}</span>
      </div>
      <div class="panel-body">
        ${heroes.length === 0
    ? '<div class="empty-state">还没有棋子，去商店买一个吧</div>'
    : `<div class="hero-grid">${heroes.map((h) => heroCard(h, data, handlers)).join('')}</div>`}
      </div>
    </div>

    <div class="panel" style="margin-top:12px">
      <div class="panel-head">
        <span class="panel-title">装备背包</span>
        <span class="panel-sub">${items.length} 件</span>
      </div>
      <div class="panel-body">
        ${items.length === 0
    ? '<div class="empty-state">背包是空的 —— 商店里会刷出装备</div>'
    : `<div class="hero-tags">${items.map((it) => {
      const eq = (data.equipments ?? []).find((e) => e.code === it.code);
      return `<span class="tag" data-act="equip-item" data-item="${it.id}" style="cursor:pointer"
                    title="${escapeHtml(effectText(eq ?? { effect: {} }))}">${escapeHtml(eq?.name ?? it.code)}</span>`;
    }).join('')}</div>`}
      </div>
    </div>
  `;

  bindHeroActions(container, data, handlers);
}

function heroCard(h, data, handlers) {
  const selected = data.selectedId === h.id;
  const onBoard = h.file !== null && h.file !== undefined;
  const tmpl = (data.templates ?? []).find((t) => t.id === h.templateId);
  const items = (h.items ?? []).map((code) => {
    const eq = (data.equipments ?? []).find((e) => e.code === code);
    return `<span class="tag">${escapeHtml(eq?.name ?? code)}</span>`;
  }).join('');

  const statRows = [
    ['攻击', formatNum(h.attack)],
    ['生命', `${formatNum(h.hp)} / ${formatNum(h.maxHp)}`],
    ['暴击率', `${(h.critRate * 100).toFixed(1)}%`],
    ['暴击倍率', `×${Number(h.critMult).toFixed(2)}`],
    ['大招倍率', `×${Number(h.ultMult).toFixed(2)}`],
    ['防御 / 闪避', `${(h.defense * 100).toFixed(0)}% / ${(h.dodge * 100).toFixed(0)}%`],
    ['最终伤害', `×${Number(h.finalDamageMult ?? 1).toFixed(2)}`],
    ['速度', String(h.speed)],
  ].map(([k, v]) => `<div class="stat-row"><span class="stat-label">${k}</span><span class="stat-value">${v}</span></div>`).join('');

  return `
    <div class="hero-card ${selected ? 'selected' : ''} ${onBoard ? '' : 'dimmed'}" data-hero="${h.id}">
      <div class="hero-card-head">
        <span class="hero-prof" style="color:${professionColor(data, h)}">${escapeHtml(professionName(data, h))}</span>
        <span class="hero-stars">${'★'.repeat(Math.max(1, Math.min(5, h.star ?? 1)))}</span>
      </div>
      <div class="hero-name">${escapeHtml(h.name)}</div>
      <div class="hero-lv">Lv.${h.level}${onBoard ? ' · 已上阵' : ''} · <span class="gold-text">战力 ${formatNum(h.power ?? 0)}</span></div>
      <div class="hero-stats">${statRows}</div>
      <div class="hero-tags">${items}</div>
      <div class="hero-actions">
        <button class="btn btn-ghost btn-sm" data-act="select" data-hero="${h.id}">选中</button>
        <button class="btn btn-gold btn-sm" data-act="train" data-hero="${h.id}">训练</button>
        <button class="btn btn-blue btn-sm" data-act="ascend" data-hero="${h.id}">升阶</button>
        <button class="btn btn-blue btn-sm" data-act="break" data-hero="${h.id}">突破</button>
        <button class="btn btn-danger btn-sm" data-act="sell" data-hero="${h.id}">出售</button>
      </div>
      <div class="hero-tags" style="margin-top:6px">
        ${(data.equipments ?? []).map((e) => `
          <span class="tag ${h.items?.includes(e.code) ? '' : ''}" data-act="equip" data-hero="${h.id}" data-eq="${e.code}"
                style="cursor:pointer;${h.items?.includes(e.code) ? 'border-color:var(--accent-gold)' : ''}"
                title="${escapeHtml(effectText(e))}">${escapeHtml(e.name)}</span>`).join('')}
      </div>
    </div>
  `;
}

function bindHeroActions(container, data, handlers) {
  container.querySelectorAll('[data-act]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const act = el.dataset.act;
      const heroId = Number(el.dataset.hero);
      switch (act) {
        case 'select': handlers.onSelect?.(heroId); break;
        case 'train': handlers.onTrain?.(heroId); break;
        case 'ascend': handlers.onAscend?.(heroId); break;
        case 'break': handlers.onBreakthrough?.(heroId); break;
        case 'sell': handlers.onSell?.(heroId); break;
        case 'equip': handlers.onEquip?.(heroId, el.dataset.eq); break;
        case 'equip-item': handlers.onEquipItem?.(Number(el.dataset.item)); break;
        default: break;
      }
    });
  });
}

/** 图鉴：棋子模板一览 */
export function renderCodex(container, data) {
  const templates = data.templates ?? [];
  container.innerHTML = `
    <div class="panel">
      <div class="panel-head"><span class="panel-title">棋子图鉴</span></div>
      <div class="panel-body">
        <div class="codex-grid">
          ${templates.map((t) => `
            <div class="codex-card">
              <div class="codex-glyph">${escapeHtml(t.glyph)}</div>
              <div class="codex-name">${escapeHtml(t.name)}</div>
              <div class="codex-sub">${escapeHtml(t.professionName)}</div>
              <div class="codex-sub">${escapeHtml(t.movement)}</div>
              <div class="stat-row"><span class="stat-label">攻击 / 生命</span><span class="stat-value">${t.baseAttack} / ${t.baseHp}</span></div>
              <div class="stat-row"><span class="stat-label">暴击 / 大招</span><span class="stat-value">${(t.baseCritRate * 100).toFixed(0)}% / ×${t.baseUltMult}</span></div>
              <div class="codex-sub" style="margin-top:4px;color:var(--accent-gold)">${escapeHtml(t.skillName)}：${escapeHtml(t.skillDesc)}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

export function professionName(data, h) {
  const t = (data.templates ?? []).find((x) => x.id === h.templateId);
  return t?.professionName ?? '—';
}

export function professionColor(data, h) {
  const t = (data.templates ?? []).find((x) => x.id === h.templateId);
  return t?.professionColor ?? 'var(--accent-gold)';
}

function effectText(e) {
  const parts = [];
  const fx = e.effect ?? {};
  if (fx.critRate) parts.push(`暴击率 +${Math.round(fx.critRate * 100)}%`);
  if (fx.lifesteal) parts.push(`吸血 ${Math.round(fx.lifesteal * 100)}%`);
  if (fx.startShield) parts.push(`开战护盾 ${Math.round(fx.startShield * 100)}%`);
  if (fx.speed) parts.push(`速度 +${fx.speed}`);
  if (fx.armorPierce) parts.push(`无视 ${Math.round(fx.armorPierce * 100)}% 防御`);
  if (fx.alwaysCombo) parts.push('暴击必连击');
  if (fx.enemySpeedDebuff) parts.push(`敌方速度 -${fx.enemySpeedDebuff}`);
  if (fx.killHeal) parts.push(`击杀回复 ${Math.round(fx.killHeal * 100)}%`);
  return parts.join('，') || '—';
}
