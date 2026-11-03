/**
 * battle/vfx.js —— 打击感。
 *
 * 全部动效走 CSS class，JS 只负责「加类 → 到时移除」。
 * 关键性能约定：只动 transform / opacity / filter，不动 top/left/width/height，
 * 避免 layout thrash（原版的 innerHTML 全量重绘会把动画冲掉，这里从根上避免）。
 */

import { squareCenterPercent } from '../render/board.js';

const SHAKE_CLASSES = ['fx-shake-l1', 'fx-shake-l2', 'fx-shake-l3', 'fx-shake-l4'];

/** 屏幕震动：按伤害量级分 4 档 */
export function shake(level = 1) {
  const app = document.getElementById('app');
  if (!app) return;
  const cls = SHAKE_CLASSES[Math.max(1, Math.min(4, level)) - 1];
  app.classList.remove(...SHAKE_CLASSES);
  // 强制重排，保证连续两次同档震动也能重新触发
  void app.offsetWidth;
  app.classList.add(cls);
  setTimeout(() => app.classList.remove(cls), 420);
}

/** 按伤害数值决定震动档位 */
export function shakeByDamage(damage) {
  if (damage <= 0) return;
  const d = Math.log10(Math.max(1, damage));
  const level = d < 3 ? 1 : d < 4 ? 2 : d < 5 ? 3 : 4;
  shake(level);
}

/** 伤害飘字 */
export function damageNumber(overlay, file, rank, amount, opts = {}) {
  if (!overlay) return;
  const el = document.createElement('div');
  el.className = 'dmg-pop';
  if (opts.crit) el.classList.add('crit');
  if (opts.heal) el.classList.add('heal');
  if (opts.exec) el.classList.add('exec');
  if (opts.miss) el.classList.add('miss');

  const text = opts.miss ? 'MISS' : (opts.heal ? `+${formatNum(amount)}` : formatNum(amount));
  el.textContent = text;

  // 字号按量级分级
  const size = opts.exec ? 40 : opts.crit ? 30 : Math.min(30, 14 + Math.log10(Math.max(1, amount)) * 5);
  el.style.fontSize = `${size.toFixed(0)}px`;
  const pct = squareCenterPercent(file, rank);
  el.style.left = `${pct.x}%`;
  el.style.top = `${pct.y}%`;
  el.style.transform = 'translate(-50%, -50%)';
  // 随机横向偏移，避免多个数字完全重叠
  el.style.marginLeft = `${(Math.random() * 8 - 4).toFixed(1)}%`;

  overlay.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}

/** 连击横幅 */
export function comboBanner(level) {
  if (level < 2) return;
  const el = document.createElement('div');
  el.className = 'combo-banner';
  el.innerHTML = `<span class="n">${level}</span><span>HIT COMBO!</span>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

/** 受击闪红 / 暴击闪白 */
export function hitFlash(pieceEl, crit = false) {
  if (!pieceEl) return;
  const cls = crit ? 'fx-hit-crit' : 'fx-hit';
  pieceEl.classList.remove('fx-hit', 'fx-hit-crit');
  void pieceEl.offsetWidth;
  pieceEl.classList.add(cls);
  setTimeout(() => pieceEl.classList.remove(cls), crit ? 460 : 320);
}

/** 闪避 */
export function dodgeFx(pieceEl) {
  if (!pieceEl) return;
  pieceEl.classList.remove('fx-dodge');
  void pieceEl.offsetWidth;
  pieceEl.classList.add('fx-dodge');
  setTimeout(() => pieceEl.classList.remove('fx-dodge'), 420);
}

/** 护盾碎裂 */
export function shieldBreak(overlay, file, rank) {
  if (!overlay) return;
  const el = document.createElement('div');
  el.className = 'fx-shield-break';
  const pct = squareCenterPercent(file, rank);
  el.style.left = `${pct.x}%`;
  el.style.top = `${pct.y}%`;
  overlay.appendChild(el);
  setTimeout(() => el.remove(), 700);
}

/** 破防标记 */
export function breakMark(overlay, file, rank) {
  if (!overlay) return;
  const el = document.createElement('div');
  el.className = 'fx-break-mark';
  el.textContent = 'BREAK';
  const pct = squareCenterPercent(file, rank);
  el.style.left = `${pct.x}%`;
  el.style.top = `${pct.y}%`;
  overlay.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

/** 治疗脉冲 */
export function healPulse(pieceEl) {
  if (!pieceEl) return;
  pieceEl.classList.remove('fx-heal-pulse');
  void pieceEl.offsetWidth;
  pieceEl.classList.add('fx-heal-pulse');
  setTimeout(() => pieceEl.classList.remove('fx-heal-pulse'), 700);
}

/** 升变光柱 */
export function promoteBeam(overlay, file, rank) {
  if (!overlay) return;
  const el = document.createElement('div');
  el.className = 'fx-promote-beam';
  el.style.left = `${squareCenterPercent(file, rank).x}%`;
  overlay.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

/** 大招全屏闪 */
export function ultFlash() {
  const el = document.createElement('div');
  el.className = 'fx-ult-flash';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 660);
}

/** 处决演出：压暗 + 十字斩 + 「处 决」 */
export function executeFx(name = '') {
  const overlay = document.createElement('div');
  overlay.className = 'fx-execute-overlay';
  document.body.appendChild(overlay);

  const slashH = document.createElement('div');
  slashH.className = 'fx-execute-slash-h';
  document.body.appendChild(slashH);

  const slashV = document.createElement('div');
  slashV.className = 'fx-execute-slash-v';
  document.body.appendChild(slashV);

  // 主标题只写「处 决」，名字放小字 —— 之前写成「处 决 马·敌方」，
  // 76px 的字一屏都盖不满，棋盘全被挡住了
  const text = document.createElement('div');
  text.className = 'fx-execute-text';
  text.innerHTML = name
    ? '<span class="fx-execute-main">处 决</span><span class="fx-execute-name"></span>'
    : '<span class="fx-execute-main">处 决</span>';
  if (name) text.querySelector('.fx-execute-name').textContent = name;
  document.body.appendChild(text);

  setTimeout(() => {
    overlay.remove(); slashH.remove(); slashV.remove(); text.remove();
  }, 1200);
}

/** 将军：棋盘红色脉冲 */
export function checkPulse(boardEl) {
  if (!boardEl) return;
  boardEl.classList.remove('fx-check-pulse');
  void boardEl.offsetWidth;
  boardEl.classList.add('fx-check-pulse');
  setTimeout(() => boardEl.classList.remove('fx-check-pulse'), 840);
}

/** 将死：全屏黑闪 + 大字 */
export function checkmateOverlay(label = '将 死') {
  const el = document.createElement('div');
  el.className = 'fx-checkmate-overlay';
  el.style.setProperty('--fx-checkmate-label', `"${label}"`);
  document.body.appendChild(el);

  const text = document.createElement('div');
  text.className = 'fx-checkmate-text';
  text.textContent = label;
  document.body.appendChild(text);

  setTimeout(() => { el.remove(); text.remove(); }, 1000);
}

/** 结算奖励弹跳 */
export function rewardPop(el) {
  if (!el) return;
  el.classList.remove('fx-reward-pop');
  void el.offsetWidth;
  el.classList.add('fx-reward-pop');
  setTimeout(() => el.classList.remove('fx-reward-pop'), 800);
}

/** 数字格式化：12345 → 1.2万 */
export function formatNum(n) {
  const v = Math.round(Number(n) || 0);
  if (Math.abs(v) < 10000) return String(v);
  if (Math.abs(v) < 100000000) {
    const w = v / 10000;
    return `${w >= 100 ? Math.round(w) : w.toFixed(1)}万`;
  }
  const y = v / 100000000;
  return `${y >= 100 ? Math.round(y) : y.toFixed(2)}亿`;
}

/**
 * 顿帧：暴击/处决时冻结一小会儿，让打击更有分量。
 */
export function hitStop(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
