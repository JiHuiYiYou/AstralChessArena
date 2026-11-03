/**
 * render/board.js —— 棋盘渲染。
 *
 * 关键：**增量更新**，不整盘重绘。
 * 棋子元素按 id 缓存复用，血条只改 width、动画只改 class，
 * 这样正在播的动画不会被下一次渲染冲掉（原版 bug ⑮）。
 */

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

/** 棋盘上所有棋子的 id → 元素 */
const pieceIndex = new Map();

/**
 * 建 8×8 格子。
 *
 * DOM 顺序从 rank 7 到 rank 0 —— 这样渲染出来是「敌方在上、我方在下」，
 * 和国际象棋的朝向一致（玩家的 rank 0-3 在下半屏）。
 */
export function createBoardGrid(gridEl, { onSquareClick } = {}) {
  gridEl.innerHTML = '';
  pieceIndex.clear();
  for (let rank = 7; rank >= 0; rank--) {
    for (let file = 0; file < 8; file++) {
      const sq = document.createElement('div');
      sq.className = `square ${(file + rank) % 2 === 0 ? 'light' : 'dark'}`;
      sq.dataset.file = String(file);
      sq.dataset.rank = String(rank);
      sq.dataset.square = `${FILES[file]}${rank + 1}`;
      if (onSquareClick) {
        sq.addEventListener('click', () => onSquareClick(file, rank, sq));
      }
      gridEl.appendChild(sq);
    }
  }
  return gridEl;
}

/** 取格子元素 */
export function squareEl(gridEl, file, rank) {
  return gridEl.querySelector(`.square[data-file="${file}"][data-rank="${rank}"]`);
}

/** 取棋子元素 */
export function pieceEl(gridEl, id) {
  return pieceIndex.get(id) ?? null;
}

/** 棋盘上所有棋子元素 */
export function allPieceEls() {
  return [...pieceIndex.values()];
}

/**
 * 把棋子渲染到棋盘上。
 * @param {HTMLElement} gridEl
 * @param {Array} pieces 每项需要 { id, code, glyph, name, hp, maxHp, file, rank, side, star, isKing, profession }
 * @param {object} opts { selectedId, onPieceClick, sideKey }
 */
export function renderPieces(gridEl, pieces, opts = {}) {
  const seen = new Set();

  for (const p of pieces) {
    if (p.file === null || p.file === undefined || p.rank === null || p.rank === undefined) continue;
    seen.add(p.id);
    let el = pieceIndex.get(p.id);
    const target = squareEl(gridEl, p.file, p.rank);

    if (!el) {
      el = createPieceEl(p);
      pieceIndex.set(p.id, el);
    } else {
      updatePieceEl(el, p);
    }

    // 位置变了才移动（避免无谓的 reflow）
    if (el.parentElement !== target && target) {
      target.appendChild(el);
    }
    el.dataset.id = String(p.id);
    el.classList.toggle('selected', opts.selectedId === p.id);
    el.classList.toggle('enemy', p.side === 'enemy');
    el.classList.toggle('ally', p.side !== 'enemy');
    el.classList.toggle('king', !!p.isKing);
    if (opts.onPieceClick) {
      if (!el.dataset.bound) {
        el.dataset.bound = '1';
        el.style.pointerEvents = 'auto';
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          opts.onPieceClick(p.id);
        });
      }
    }
  }

  // 清理已经不存在的棋子
  for (const [id, el] of [...pieceIndex.entries()]) {
    if (seen.has(id)) continue;
    el.remove();
    pieceIndex.delete(id);
  }
}

function createPieceEl(p) {
  const el = document.createElement('div');
  el.className = 'piece';
  el.innerHTML = `
    <div class="piece-glyph"></div>
    <div class="piece-star"></div>
    <div class="piece-name"></div>
    <div class="piece-hpbar"><div class="piece-hpfill"></div></div>
    <div class="piece-badge"></div>
  `;
  updatePieceEl(el, p);
  return el;
}

function updatePieceEl(el, p) {
  const glyph = el.querySelector('.piece-glyph');
  const star = el.querySelector('.piece-star');
  const name = el.querySelector('.piece-name');
  const fill = el.querySelector('.piece-hpfill');
  const badge = el.querySelector('.piece-badge');

  if (glyph.textContent !== (p.glyph ?? '?')) glyph.textContent = p.glyph ?? '?';
  const stars = '★'.repeat(Math.max(1, Math.min(5, p.star ?? 1)));
  if (star.textContent !== stars) star.textContent = stars;
  if (name.textContent !== (p.name ?? '')) name.textContent = p.name ?? '';

  const ratio = p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
  const width = `${(ratio * 100).toFixed(1)}%`;
  if (fill.style.width !== width) fill.style.width = width;

  const ready = p.ultCooldown === 0 || p.ultCooldown === undefined;
  badge.classList.toggle('cool', !ready);
  badge.title = ready ? '大招就绪' : `大招冷却 ${p.ultCooldown}`;
}

/**
 * 平滑移动棋子到目标格（先位移再归位，触发 CSS transition）。
 */
export function animateMoveTo(gridEl, id, file, rank) {
  const el = pieceIndex.get(id);
  const target = squareEl(gridEl, file, rank);
  if (!el || !target) return Promise.resolve();
  const from = el.parentElement;
  if (!from || from === target) return Promise.resolve();

  const cell = from.getBoundingClientRect();
  const dest = target.getBoundingClientRect();
  const dx = dest.left - cell.left;
  const dy = dest.top - cell.top;

  el.classList.add('moving');
  el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  return new Promise((resolve) => {
    setTimeout(() => {
      target.appendChild(el);
      el.style.transform = 'translate3d(0, 0, 0)';
      el.classList.remove('moving');
      setTimeout(resolve, 190);
    }, 180);
  });
}

/** 立刻把棋子放到某格（不播动画，用于战斗开局摆位） */
export function placePieceNow(gridEl, id, file, rank) {
  const el = pieceIndex.get(id);
  const target = squareEl(gridEl, file, rank);
  if (el && target) {
    target.appendChild(el);
    el.style.transform = 'translate3d(0, 0, 0)';
  }
}

/** 更新某个棋子的血条（战斗中的实时刷新） */
export function updatePieceHp(gridEl, id, hp, maxHp) {
  const el = pieceIndex.get(id);
  if (!el) return;
  const fill = el.querySelector('.piece-hpfill');
  if (!fill) return;
  const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  fill.style.width = `${(ratio * 100).toFixed(1)}%`;
}

/** 标记棋子死亡 */
export function markPieceDead(gridEl, id) {
  const el = pieceIndex.get(id);
  if (!el) return;
  el.style.opacity = '0.25';
  el.style.filter = 'grayscale(1)';
  el.style.pointerEvents = 'none';
}

/**
 * 清空所有棋子（切换存档 / 开新战斗时调用）。
 * 只删棋子，**不能动格子** —— 格子是提前建好的，删了棋盘就没法渲染了。
 */
export function resetBoard() {
  pieceIndex.clear();
  document.querySelectorAll('.board-grid .piece').forEach((el) => el.remove());
}

/**
 * 格子中心相对 board-overlay 的百分比坐标。
 * 棋盘 DOM 是「rank 7 在上」，所以 y 要翻转。
 */
export function squareCenterPercent(file, rank) {
  return {
    x: ((file + 0.5) / 8) * 100,
    y: ((8 - rank - 0.5) / 8) * 100,
  };
}
