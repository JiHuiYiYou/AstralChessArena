/**
 * render/synergy.js —— 羁绊面板。
 */

import { escapeHtml } from './shop.js';

/**
 * @param {HTMLElement} container
 * @param {Array} rows synergySummary 的结果
 */
export function renderSynergy(container, rows) {
  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="empty-state">上场同职业的棋子即可激活羁绊</div>';
    return;
  }
  container.innerHTML = `
    <div class="panel">
      <div class="panel-head">
        <span class="panel-title">羁绊</span>
        <span class="panel-sub">同职业 2 / 4 / 6 件触发</span>
      </div>
      <div class="panel-body">
        <div class="synergy-list">
          ${rows.map((r) => `
            <div class="synergy-row ${r.tier > 0 ? 'active' : ''}">
              <span class="synergy-icon" style="color:${colorOf(r.profession)}">${iconOf(r.profession)}</span>
              <div style="flex:1;min-width:0">
                <div class="synergy-name">${escapeHtml(r.professionName)}
                  <span class="synergy-count">${r.count} 件${r.tier > 0 ? ` · ${r.tier} 档` : ''}</span>
                </div>
                <div class="synergy-bonus">
                  ${r.tier > 0
    ? `攻击 +${Math.round(r.atk * 100)}% · 生命 +${Math.round(r.hp * 100)}%${r.skill ? ` · 技能 +${Math.round(r.skill * 100)}%` : ''}`
    : '<span class="muted">未激活</span>'}
                </div>
                ${r.passive ? `<div class="synergy-bonus" style="color:var(--accent-gold)">★ ${escapeHtml(r.passive.name)}</div>` : ''}
                ${r.next ? `<div class="synergy-next">再凑 ${r.next.count_required - r.count} 件 → 攻击 +${Math.round(r.next.atk * 100)}% / 生命 +${Math.round(r.next.hp * 100)}%</div>` : ''}
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>
  `;
}

const COLORS = {
  assassin: 'var(--accent-red)',
  mage: 'var(--accent-purple)',
  healer: 'var(--accent-green)',
  guard: 'var(--accent-blue)',
};
const ICONS = {
  assassin: '🗡', mage: '✦', healer: '✚', guard: '⛨',
};

function colorOf(code) {
  return COLORS[code] ?? 'var(--accent-gold)';
}

function iconOf(code) {
  return ICONS[code] ?? '◆';
}
