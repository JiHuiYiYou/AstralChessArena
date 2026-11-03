// modal.js — 模态弹窗（.modal / .modal-panel / .modal-head / .modal-body / .modal-foot）的开关、遮罩与 ESC 关闭，以及 Promise 化的确认框

const OVERLAY_ID = 'modal';
const PANEL_ID = 'modal-panel';

let overlay = null;
let panel = null;
let headEl = null;
let bodyEl = null;
let footEl = null;

let eventsBound = false;
let savedBodyOverflow = '';
let bodyOverflowSaved = false;
let confirmResolve = null;

/* ---------- DOM 构建 ---------- */

function ensureSection(parent, className) {
  let el = parent.querySelector('.' + className);
  if (!el) {
    el = document.createElement('div');
    el.className = className;
  }
  return el;
}

function ensureDom() {
  if (overlay && panel) return;
  if (!document.body) return;

  overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'modal hidden';
    document.body.appendChild(overlay);
  }
  if (!overlay.classList.contains('modal')) overlay.classList.add('modal');

  panel = overlay.querySelector('#' + PANEL_ID);
  if (!panel) {
    const globalPanel = document.getElementById(PANEL_ID);
    panel = globalPanel || document.createElement('div');
    panel.id = PANEL_ID;
    if (!globalPanel) panel.className = 'modal-panel';
    overlay.appendChild(panel);
  }
  if (!panel.classList.contains('modal-panel')) panel.classList.add('modal-panel');

  // 补齐缺失分区，并固定为 head → body → foot 的顺序
  headEl = ensureSection(panel, 'modal-head');
  bodyEl = ensureSection(panel, 'modal-body');
  footEl = ensureSection(panel, 'modal-foot');
  panel.appendChild(headEl);
  panel.appendChild(bodyEl);
  panel.appendChild(footEl);
}

/* ---------- Promise 结算 ---------- */

function settleConfirm(result) {
  if (!confirmResolve) return;
  const resolve = confirmResolve;
  confirmResolve = null;
  resolve(result);
}

/* ---------- 事件 ---------- */

function onOverlayClick(e) {
  // 只有点在遮罩空白处（.modal 自身）才关闭，点面板内部不关
  if (e.target === overlay) closeModal();
}

function onPanelClick(e) {
  const target = e.target instanceof Element ? e.target : null;
  if (!target) return;
  if (target.closest('[data-modal-ok]')) {
    settleConfirm(true);
    closeModal();
    return;
  }
  if (target.closest('[data-modal-cancel]')) {
    closeModal();
  }
}

function onKeyDown(e) {
  if (e.key === 'Escape' || e.key === 'Esc') {
    if (isModalOpen()) closeModal();
  }
}

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  overlay.addEventListener('click', onOverlayClick);
  panel.addEventListener('click', onPanelClick);
  document.addEventListener('keydown', onKeyDown);
}

function unbindEvents() {
  if (!eventsBound) return;
  eventsBound = false;
  overlay.removeEventListener('click', onOverlayClick);
  panel.removeEventListener('click', onPanelClick);
  document.removeEventListener('keydown', onKeyDown);
}

/* ---------- 工具 ---------- */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

// 把纯文本转成可安全插入的 HTML
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/* ---------- 对外接口 ---------- */

/**
 * 打开模态弹窗。
 * @param {{title?: string, bodyHtml?: string, footHtml?: string}} options
 *   title / bodyHtml / footHtml 均为 HTML 字符串，由调用方保证内容安全。
 * @returns {HTMLElement} 弹窗面板元素（.modal-panel）
 */
export function openModal({ title, bodyHtml, footHtml } = {}) {
  ensureDom();
  if (!overlay || !panel) return null;

  // 上一条待确认的 Promise 不应悬空
  settleConfirm(false);

  headEl.innerHTML = title === null || title === undefined ? '' : String(title);
  bodyEl.innerHTML = bodyHtml === null || bodyHtml === undefined ? '' : String(bodyHtml);
  footEl.innerHTML = footHtml === null || footHtml === undefined ? '' : String(footHtml);

  if (!bodyOverflowSaved) {
    savedBodyOverflow = document.body.style.overflow;
    bodyOverflowSaved = true;
  }
  document.body.style.overflow = 'hidden';

  overlay.classList.remove('hidden');
  overlay.removeAttribute('hidden');
  bindEvents();

  return panel;
}

/** 关闭模态弹窗，并解除背景滚动锁定。 */
export function closeModal() {
  if (!overlay) return;

  overlay.classList.add('hidden');
  headEl.innerHTML = '';
  bodyEl.innerHTML = '';
  footEl.innerHTML = '';

  if (bodyOverflowSaved) {
    document.body.style.overflow = savedBodyOverflow;
    savedBodyOverflow = '';
    bodyOverflowSaved = false;
  }

  unbindEvents();
  settleConfirm(false);
}

/** 弹窗当前是否处于打开状态。 */
export function isModalOpen() {
  return !!overlay && !overlay.classList.contains('hidden');
}

/**
 * 带「确定 / 取消」的确认框。
 * 注意：title 与 message 一律按纯文本处理（内部转义），不会解析其中的 HTML，
 * 因此可以直接拼接玩家可编辑的文案而无需担心注入。
 * @param {string} title 标题纯文本
 * @param {string} message 正文纯文本
 * @returns {Promise<boolean>} 确定 resolve(true)；取消 / ESC / 点遮罩 resolve(false)
 */
export function confirmModal(title, message) {
  return new Promise((resolve) => {
    openModal({
      title: escapeHtml(title === null || title === undefined ? '' : title),
      bodyHtml: '<p>' + escapeHtml(message === null || message === undefined ? '' : message) + '</p>',
      footHtml:
        '<button type="button" class="btn btn-ghost" data-modal-cancel>取消</button>' +
        '<button type="button" class="btn btn-gold" data-modal-ok>确定</button>',
    });
    confirmResolve = resolve;
  });
}

// 模块加载时确保弹窗处于隐藏态（不触碰 body 滚动锁定）
ensureDom();
if (overlay) overlay.classList.add('hidden');
