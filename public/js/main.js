/**
 * main.js —— 前端主控。
 *
 * 职责：拉元数据 → 管存档 → 渲染准备阶段 / 战斗阶段 → 调后端 API。
 * 所有状态都在 state 里，渲染函数只读 state。
 */

import { api } from './api.js';
import { toast } from './ui/toast.js';
import { closeModal, confirmModal, openModal } from './ui/modal.js';
import { initParticles } from './ui/particles.js';
import { sfx } from './battle/sound.js';
import {
  createBoardGrid,
  renderPieces,
  resetBoard,
  squareEl,
} from './render/board.js';
import { renderShop, escapeHtml } from './render/shop.js';
import { renderRoster, renderCodex } from './render/roster.js';
import { renderSynergy } from './render/synergy.js';
import { playBattle } from './battle/player.js';
import { formatNum, rewardPop } from './battle/vfx.js';

/* ------------------------------------------------------------------ *
 * 状态
 * ------------------------------------------------------------------ */

const state = {
  meta: null,
  slot: null,
  save: null,
  heroes: [],
  cards: [],
  items: [],
  shop: null,
  selectedHeroId: null,
  tab: 'shop',
  view: 'prep',
  battleCtrl: { value: 1, skip: false },
};

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ *
 * 启动
 * ------------------------------------------------------------------ */

async function boot() {
  initParticles($('particles-canvas'));
  bindGlobalEvents();

  try {
    state.meta = await api.meta();
  } catch (err) {
    toast(`无法连接后端：${err.message}`, 'error');
    return;
  }

  renderShell();
  await pickSlot();
}

function renderShell() {
  createBoardGrid($('board-grid'), { onSquareClick: onSquareClick });
  createBoardGrid($('battle-grid'), {});
  renderTabs();
}

/* ------------------------------------------------------------------ *
 * 存档
 * ------------------------------------------------------------------ */

async function pickSlot() {
  const saves = await api.listSaves();
  const body = saves.map((s) => `
    <div class="roster-row" data-slot="${s.slot}">
      <div style="flex:1">
        <strong>存档 ${s.slot}</strong>
        <div class="muted" style="font-size:12px">
          ${s.heroCount > 0
    ? `💰 ${formatNum(s.gold)} · ⭐ 第 ${s.chapter} 章 · 👥 ${s.allyCount} 我方 / ${s.heroCount - s.allyCount} 敌方 · 🃏 ${s.cardCount} 张卡`
    : '空存档'}
        </div>
      </div>
      <button class="btn btn-gold btn-sm" data-act="load" data-slot="${s.slot}">读取</button>
      <button class="btn btn-danger btn-sm" data-act="wipe" data-slot="${s.slot}">清空</button>
    </div>`).join('');

  openModal({
    title: '选择存档',
    bodyHtml: `<div class="roster-list">${body}</div>`,
    footHtml: '<button class="btn btn-blue btn-sm" data-act="new">新建存档</button>',
  });

  const panel = $('modal-panel');
  panel.querySelectorAll('[data-act]').forEach((el) => {
    el.addEventListener('click', async () => {
      const act = el.dataset.act;
      if (act === 'load') {
        await loadSave(Number(el.dataset.slot));
        closeModal();
      } else if (act === 'wipe') {
        if (await confirmModal('清空存档', `确定清空存档 ${el.dataset.slot}？此操作不可撤销。`)) {
          await api.deleteSave(Number(el.dataset.slot));
          toast('已清空', 'success');
          await pickSlot();
        }
      } else if (act === 'new') {
        const empty = saves.find((s) => s.heroCount === 0);
        const slot = empty?.slot ?? 1;
        await api.createSave(slot);
        await loadSave(slot);
        closeModal();
        toast('新存档已创建', 'success');
      }
    });
  });
}

async function loadSave(slot) {
  const data = await api.getSave(slot);
  state.slot = slot;
  state.save = data.save;
  state.heroes = data.heroes;
  state.cards = data.cards;
  state.items = data.items ?? [];
  state.shop = null;
  state.selectedHeroId = null;
  await refreshShop();
  renderAll();
}

async function refreshShop() {
  try {
    state.shop = await api.shop(state.slot);
  } catch {
    state.shop = { slots: [], gold: 0, refreshCost: 0, freeRefreshLeft: 0 };
  }
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

function renderAll() {
  renderResBar();
  renderBoard();
  renderChapterSelect();
  renderTab();
}

/** 章节选择（只能选已解锁的） */
function renderChapterSelect() {
  const box = $('chapter-select');
  if (!box) return;
  const cur = state.save?.chapter ?? 1;
  const max = state.save?.maxChapter ?? 1;
  const total = 12;
  const chips = [];
  for (let c = 1; c <= total; c++) {
    const locked = c > max;
    chips.push(`<button class="chapter-chip ${c === cur ? 'active' : ''} ${locked ? 'locked' : ''}"
      data-chapter="${c}" ${locked ? 'disabled' : ''}>${c}</button>`);
  }
  box.innerHTML = chips.join('');
  box.querySelectorAll('[data-chapter]').forEach((el) => {
    el.addEventListener('click', async () => {
      const c = Number(el.dataset.chapter);
      if (c === cur) return;
      try {
        await api.setChapter(state.slot, c);
        state.save.chapter = c;
        sfx.click();
        renderAll();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

function renderResBar() {
  const s = state.save;
  if (!s) return;
  setRes('gold', formatNum(s.gold));
  setRes('chapter', s.chapter);
  setRes('round', s.round);
  setRes('streak', `${s.streakWin}胜/${s.streakLose}负`);
}

function setRes(key, value) {
  const el = document.querySelector(`.res[data-res="${key}"] b`);
  if (el) el.textContent = value;
}

function renderBoard() {
  const onBoard = state.heroes.filter((h) => h.file !== null && h.file !== undefined);
  renderPieces($('board-grid'), onBoard, {
    selectedId: state.selectedHeroId,
    onPieceClick: onPieceClick,
  });
}

function renderTabs() {
  document.querySelectorAll('#tabs .tab').forEach((el) => {
    el.addEventListener('click', () => {
      state.tab = el.dataset.tab;
      document.querySelectorAll('#tabs .tab').forEach((t) => t.classList.toggle('active', t === el));
      renderTab();
      sfx.click();
    });
  });
}

function renderTab() {
  const body = $('tab-body');
  const templates = state.meta?.templates ?? [];
  const equipments = state.meta?.equipments ?? [];

  if (state.tab === 'shop') {
    renderShop(body, {
      slots: state.shop?.slots ?? [],
      gold: state.shop?.gold ?? state.save?.gold ?? 0,
      refreshCost: state.shop?.refreshCost ?? 0,
      freeRefreshLeft: state.shop?.freeRefreshLeft ?? 0,
      cards: state.cards,
    }, {
      onBuy: onBuy,
      onRefresh: onRefreshShop,
      onUseCard: onUseCard,
    });
  } else if (state.tab === 'roster') {
    renderRoster(body, {
      heroes: state.heroes,
      items: state.items,
      templates,
      equipments,
      selectedId: state.selectedHeroId,
      maxBoardPieces: state.meta?.maxBoardPieces ?? 5,
    }, {
      onSelect: onSelectHero,
      onTrain: onTrain,
      onAscend: onAscend,
      onBreakthrough: onBreakthrough,
      onEquip: onEquip,
      onEquipItem: onEquipItem,
      onSell: onSell,
    });
  } else if (state.tab === 'synergy') {
    renderSynergy(body, synergyRows());
  } else {
    renderCodex(body, { templates });
  }
}

/** 客户端算羁绊（与服务端 computeSynergies 同规则） */
function synergyRows() {
  const counts = new Map();
  for (const h of state.heroes) {
    if (!h.isAlly || !h.exist) continue;
    const t = state.meta?.templates.find((x) => x.id === h.templateId);
    if (!t) continue;
    counts.set(t.professionCode, (counts.get(t.professionCode) ?? 0) + 1);
  }
  const tiers = [
    { tier: 1, need: 2, atk: 0.10, hp: 0.05, skill: 0 },
    { tier: 2, need: 4, atk: 0.25, hp: 0.12, skill: 0.25 },
    { tier: 3, need: 6, atk: 0.50, hp: 0.25, skill: 0.50 },
  ];
  const rows = [];
  for (const [code, count] of counts) {
    const t = state.meta?.templates.find((x) => x.professionCode === code);
    const active = [...tiers].reverse().find((x) => count >= x.need) ?? null;
    const next = tiers.find((x) => count < x.need) ?? null;
    rows.push({
      profession: code,
      professionName: t?.professionName ?? code,
      count,
      tier: active?.tier ?? 0,
      atk: active?.atk ?? 0,
      hp: active?.hp ?? 0,
      skill: active?.skill ?? 0,
      passive: active?.tier === 3 && code === 'assassin'
        ? { name: '影刃 6 件：暴击必定触发连击' }
        : null,
      next: next ? { count_required: next.need, atk: next.atk, hp: next.hp } : null,
    });
  }
  rows.sort((a, b) => b.tier - a.tier || b.count - a.count);
  return rows;
}

/* ------------------------------------------------------------------ *
 * 交互
 * ------------------------------------------------------------------ */

function onPieceClick(id) {
  sfx.click();
  state.selectedHeroId = state.selectedHeroId === id ? null : id;
  renderBoard();
  renderTab();
}

/** 从阵容面板里选中棋子（和点棋盘上的棋子等价） */
function onSelectHero(id) {
  sfx.click();
  state.selectedHeroId = state.selectedHeroId === id ? null : id;
  renderBoard();
  renderTab();
}

function onSquareClick(file, rank) {
  // 敌方半场不可布阵
  if (rank > 3) {
    toast('只能把棋子布置在己方半场（下方 4 排）', 'error');
    return;
  }
  const occupied = state.heroes.find((h) => h.file === file && h.rank === rank);
  if (occupied) {
    // 点到已占用的格子 → 选中那个棋子
    onPieceClick(occupied.id);
    return;
  }
  if (!state.selectedHeroId) return;
  const hero = state.heroes.find((h) => h.id === state.selectedHeroId);
  if (!hero) return;

  const placements = state.heroes
    .filter((h) => h.file !== null && h.file !== undefined && h.exist && h.isAlly)
    .map((h) => (h.id === hero.id ? { heroId: h.id, file, rank } : { heroId: h.id, file: h.file, rank: h.rank }));

  api.formation(state.slot, placements).then(() => {
    state.heroes = state.heroes.map((h) => (h.id === hero.id ? { ...h, file, rank } : h));
    state.selectedHeroId = null;
    sfx.success();
    renderAll();
  }).catch((err) => toast(err.message, 'error'));
}

/** 下场（把棋子从棋盘撤下来） */
function onDeployOff(heroId) {
  const hero = state.heroes.find((h) => h.id === heroId);
  if (!hero) return;
  const placements = state.heroes
    .filter((h) => h.file !== null && h.file !== undefined && h.exist && h.isAlly && h.id !== heroId)
    .map((h) => ({ heroId: h.id, file: h.file, rank: h.rank }));
  api.formation(state.slot, placements).then(() => {
    state.heroes = state.heroes.map((h) => (h.id === heroId ? { ...h, file: null, rank: null } : h));
    renderAll();
  }).catch((err) => toast(err.message, 'error'));
}

async function onBuy(slotIndex) {
  try {
    const res = await api.buy(state.slot, slotIndex);
    sfx.success();
    toast(`买下了 ${res.created?.name ?? '物品'}（-${res.price} 金）`, 'success');
    await reload();
  } catch (err) {
    sfx.error();
    toast(err.message, 'error');
  }
}

async function onRefreshShop() {
  try {
    const res = await api.refreshShop(state.slot);
    sfx.click();
    toast(res.cost > 0 ? `刷新花掉了 ${res.cost} 金` : '免费刷新', 'info');
    await reload();
  } catch (err) {
    sfx.error();
    toast(err.message, 'error');
  }
}

async function onSell(heroId) {
  const hero = state.heroes.find((h) => h.id === heroId);
  if (hero && hero.file !== null && hero.file !== undefined) {
    toast('先把它从棋盘上撤下来', 'error');
    return;
  }
  if (!await confirmModal('出售棋子', `确定出售「${hero?.name ?? ''}」？`)) return;
  try {
    const res = await api.sell(state.slot, heroId);
    toast(`出售成功，返还 ${res.refund} 金`, 'success');
    await reload();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function onTrain(heroId) {
  try {
    const res = await api.train(state.slot, heroId);
    sfx.success();
    toast(`训练完成（-${res.cost} 金）攻击 +${res.delta.attack} 生命 +${res.delta.maxHp}`, 'success');
    await reload();
  } catch (err) {
    sfx.error();
    toast(err.message, 'error');
  }
}

async function onAscend(heroId) {
  const candidates = state.heroes.filter(
    (h) => h.id !== heroId && h.isAlly && h.exist
      && state.heroes.find((x) => x.id === heroId)?.templateId === h.templateId,
  );
  if (candidates.length === 0) {
    toast('需要另一个同种棋子才能升阶', 'error');
    return;
  }
  const hero = state.heroes.find((h) => h.id === heroId);
  const body = candidates.map((c) => `
    <div class="roster-row" data-other="${c.id}">
      <div style="flex:1"><strong>${escapeHtml(c.name)}</strong> <span class="muted">Lv.${c.level} ${'★'.repeat(c.star ?? 1)}</span></div>
      <button class="btn btn-gold btn-sm" data-act="do" data-other="${c.id}">升阶</button>
    </div>`).join('');

  openModal({
    title: `升阶 · ${escapeHtml(hero?.name ?? '')}`,
    bodyHtml: `<p class="muted" style="font-size:12px">升阶公式：新属性 = 大的 + 小的 × 50%，等级 +1（不是取平均）。</p>
      <div class="roster-list">${body}</div>`,
  });

  $('modal-panel').querySelectorAll('[data-act="do"]').forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        const res = await api.ascend(state.slot, heroId, Number(el.dataset.other));
        closeModal();
        sfx.promote?.();
        toast(`升阶成功！${res.hero.name} → Lv.${res.hero.level}`, 'success');
        await reload();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

async function onBreakthrough(heroId) {
  const stats = state.meta?.breakthroughStats ?? [];
  const body = stats.map((s) => `
    <div class="roster-row" data-stat="${s.key}">
      <div style="flex:1">${escapeHtml(s.name)}</div>
      <button class="btn btn-blue btn-sm" data-act="do" data-stat="${s.key}">突破</button>
    </div>`).join('');

  openModal({
    title: '突破 · 选择属性',
    bodyHtml: `<p class="muted" style="font-size:12px">突破会把该属性 ×1.3~1.6，并同步抬高它的上限，所以不会白费资源。</p>
      <div class="roster-list">${body}</div>`,
  });

  $('modal-panel').querySelectorAll('[data-act="do"]').forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        const res = await api.breakthrough(state.slot, heroId, el.dataset.stat);
        closeModal();
        sfx.success();
        toast(`${res.statName} ×${res.rate}`, 'success');
        await reload();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

async function onEquip(heroId, code) {
  try {
    await api.equip(state.slot, heroId, code);
    await reload();
  } catch (err) {
    toast(err.message, 'error');
  }
}

/** 从装备背包里挑一个棋子装上 */
async function onEquipItem(itemId) {
  const allies = state.heroes.filter((h) => h.isAlly && h.exist);
  if (allies.length === 0) {
    toast('没有可以装备的棋子', 'error');
    return;
  }
  const item = state.items.find((i) => i.id === itemId);
  const eq = state.meta?.equipments.find((e) => e.code === item?.code);
  const body = allies.map((h) => `
    <div class="roster-row">
      <div style="flex:1"><strong>${escapeHtml(h.name)}</strong>
        <span class="muted">${(h.items ?? []).length}/3 装备</span></div>
      <button class="btn btn-gold btn-sm" data-act="do" data-hero="${h.id}">装备</button>
    </div>`).join('');

  openModal({
    title: `装备 · ${escapeHtml(eq?.name ?? '')}`,
    bodyHtml: `<div class="roster-list">${body}</div>`,
  });

  $('modal-panel').querySelectorAll('[data-act="do"]').forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        await api.equipItem(state.slot, itemId, Number(el.dataset.hero));
        closeModal();
        sfx.success();
        toast(`装备成功：${eq?.name ?? ''}`, 'success');
        await reload();
      } catch (err) {
        sfx.error();
        toast(err.message, 'error');
      }
    });
  });
}

async function onUseCard(saveCardId) {
  const allies = state.heroes.filter((h) => h.isAlly && h.exist);
  if (allies.length === 0) {
    toast('没有可以附魔的棋子', 'error');
    return;
  }
  const card = state.cards.find((c) => c.id === saveCardId);
  const body = allies.map((h) => `
    <div class="roster-row">
      <div style="flex:1"><strong>${escapeHtml(h.name)}</strong> <span class="muted">Lv.${h.level}</span></div>
      <button class="btn btn-gold btn-sm" data-act="do" data-hero="${h.id}">附魔</button>
    </div>`).join('');

  openModal({
    title: `附魔 · ${escapeHtml(card?.statName ?? '')}`,
    bodyHtml: `<div class="roster-list">${body}</div>`,
  });

  $('modal-panel').querySelectorAll('[data-act="do"]').forEach((el) => {
    el.addEventListener('click', async () => {
      try {
        const res = await api.enchant(state.slot, Number(el.dataset.hero), saveCardId);
        closeModal();
        sfx.success();
        toast(`${res.hero.name} 附魔成功（-${res.cost} 金）`, 'success');
        await reload();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

/* ------------------------------------------------------------------ *
 * 战斗
 * ------------------------------------------------------------------ */

async function onStartBattle() {
  try {
    sfx.ensure();
    const res = await api.battle(state.slot);
    state.battleCtrl = { value: state.battleCtrl.value, skip: false };
    showBattleStage(res);
  } catch (err) {
    sfx.error();
    toast(err.message, 'error');
  }
}

function showBattleStage(res) {
  state.view = 'battle';
  $('stage-prep').classList.add('hidden');
  $('stage-battle').classList.remove('hidden');
  $('btn-battle-again').classList.add('hidden');
  $('btn-battle-back').classList.add('hidden');
  $('battle-title').textContent = `第 ${res.rounds ?? '?'} 回合 · 第 ${state.save.chapter} 章`;
  $('battle-log').innerHTML = '';
  $('result-slot').innerHTML = '';

  resetBoard();
  state.battleCtrl.skip = false;

  playBattle({
    gridEl: $('battle-grid'),
    overlayEl: $('battle-overlay'),
    boardEl: $('battle-board'),
    events: res.events,
    ctrl: state.battleCtrl,
    onLog: (text, type) => appendLog(text, type),
    onEnd: async () => {
      $('btn-battle-again').classList.remove('hidden');
      $('btn-battle-back').classList.remove('hidden');
      const label = res.result === 'win' ? '胜利' : res.result === 'lose' ? '失败' : '平局';
      appendLog(`—— 战斗${label} —— 获得 ${formatNum(res.rewards.gold)} 金币`, 'result');
      showResult(res);
      rewardPop($('battle-title'));
      await reload();
    },
  });
}

/** 战斗结果面板 */
function showResult(res) {
  const slot = $('result-slot');
  if (!slot) return;
  const win = res.result === 'win';
  const rows = [
    ['战斗回合', `${res.rounds} 回合`, ''],
    ['我方战力', formatNum(res.allyPower), ''],
    ['敌方战力', formatNum(res.enemyPower), ''],
    ['获得金币', `+${formatNum(res.rewards.gold)}`, 'reward-gain'],
  ];
  if (win) {
    rows.push(['章节进度', `第 ${res.chapter} 章`, 'reward-gain']);
    rows.push(['连胜', `${res.state?.streakWin ?? 0} 连胜`, 'reward-gain']);
  } else {
    rows.push(['章节进度', `仍为第 ${res.state?.chapter ?? res.chapter} 章`, 'reward-lose']);
  }

  slot.innerHTML = `
    <div class="result-panel" data-result="${res.result}">
      <div class="result-title">${res.result === 'win' ? '胜 利' : res.result === 'lose' ? '失 败' : '平 局'}</div>
      <div class="result-reward">
        ${rows.map(([k, v, cls]) => `
          <div class="reward-row"><span>${k}</span><span class="${cls}">${v}</span></div>`).join('')}
      </div>
    </div>
  `;
}

function appendLog(text, type = '') {
  const log = $('battle-log');
  if (!log) return;
  const div = document.createElement('div');
  div.className = `log-entry ${type ? `log-${type}` : ''}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  while (log.childElementCount > 60) log.removeChild(log.firstChild);
}

function backToPrep() {
  state.view = 'prep';
  $('result-slot').innerHTML = '';
  $('stage-battle').classList.add('hidden');
  $('stage-prep').classList.remove('hidden');
  renderAll();
}

/* ------------------------------------------------------------------ *
 * 全局
 * ------------------------------------------------------------------ */

async function reload() {
  const data = await api.getSave(state.slot);
  state.save = data.save;
  state.heroes = data.heroes;
  state.cards = data.cards;
  state.items = data.items ?? [];
  await refreshShop();
  if (state.view === 'prep') renderAll();
  else renderResBar();
}

function bindGlobalEvents() {
  $('btn-battle')?.addEventListener('click', onStartBattle);

  $('btn-round')?.addEventListener('click', async () => {
    try {
      const res = await api.startRound(state.slot);
      toast(`回合 ${res.round} 开始，收入 ${res.income.total} 金（基础 ${res.income.base} / 连胜 ${res.income.streak} / 利息 ${res.income.interest}）`, 'success');
      await reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  $('btn-battle-back')?.addEventListener('click', backToPrep);
  $('btn-battle-again')?.addEventListener('click', onStartBattle);

  $('btn-battle-skip')?.addEventListener('click', () => {
    state.battleCtrl.skip = true;
    toast('已跳过剩余动画', 'info');
  });

  const speedBtn = $('btn-battle-speed');
  speedBtn?.addEventListener('click', () => {
    const next = state.battleCtrl.value >= 4 ? 0.5 : state.battleCtrl.value * 2;
    state.battleCtrl.value = next;
    speedBtn.textContent = `×${next}`;
  });

  $('btn-speed')?.addEventListener('click', () => {
    const next = state.battleCtrl.value >= 4 ? 0.5 : state.battleCtrl.value * 2;
    state.battleCtrl.value = next;
    $('btn-speed').textContent = `×${next}`;
  });

  $('btn-sound')?.addEventListener('click', () => {
    sfx.ensure();
    const muted = sfx.toggleMute();
    $('btn-sound').textContent = muted ? '🔇' : '🔊';
  });

  $('btn-saves')?.addEventListener('click', async () => {
    await reload();
    await pickSlot();
  });

  document.addEventListener('click', () => sfx.ensure(), { once: true });
}

boot();
