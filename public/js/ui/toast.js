// toast.js — 右上角浮动提示条（Toast）的创建、限时自动消失与同屏数量上限控制

const HOST_ID = 'toast-host';
const MAX_VISIBLE = 4;
const LIFETIME_MS = 2600;
const TYPES = ['info', 'success', 'error'];

/**
 * 弹出一条提示消息。
 * @param {string} message 纯文本内容（内部走 textContent，杜绝注入）
 * @param {'info'|'success'|'error'} type 提示类型，决定左侧描边与文字颜色
 * @returns {HTMLElement|null} 创建出的提示元素；容器缺失时返回 null
 */
export function toast(message, type = 'info') {
  const host = document.getElementById(HOST_ID);
  if (!host) return null;

  const kind = TYPES.indexOf(type) === -1 ? 'info' : type;
  const el = document.createElement('div');
  el.className = 'toast toast-' + kind;
  el.textContent = message === null || message === undefined ? '' : String(message);
  host.appendChild(el);

  // 超出上限时移除最早的一条
  while (host.children.length > MAX_VISIBLE) {
    const oldest = host.firstElementChild;
    if (!oldest) break;
    oldest.remove();
  }

  window.setTimeout(() => {
    el.remove();
  }, LIFETIME_MS);

  return el;
}
