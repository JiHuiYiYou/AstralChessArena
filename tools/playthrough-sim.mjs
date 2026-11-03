/**
 * tools/playthrough-sim.mjs —— 自动通关模拟。
 *
 * 用 API 驱动一个「还行的玩家」把游戏从头玩下去：
 *   买棋子 → 上阵 → 训练 → 结束准备阶段 → 战斗 → 再来
 *
 * 目的不是刷分，而是**验证整条养成曲线成立**：
 *   - 钱够不够花？会不会卡在某个章节？
 *   - 棋子是不是在稳定变强？
 *   - 章节推进的速度合不合理？
 *
 * 用法：先 npm run dev，再 node tools/playthrough-sim.mjs [最大回合数]
 */

const BASE = process.argv[3] ?? process.env.ARENA_URL ?? 'http://127.0.0.1:5180';
const MAX_ROUNDS = Number(process.argv[2] ?? 40);
const SLOT = 1;

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) {
    const e = new Error(`${method} ${path} → ${json.error.code}: ${json.error.message}`);
    e.soft = true;
    throw e;
  }
  return json.data;
}

/** 忽略「金币不足」「已达上限」这类预期内的失败 */
async function tryCall(method, path, body) {
  try {
    return await call(method, path, body);
  } catch (err) {
    if (err.soft) return null;
    throw err;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\n自动通关模拟 → ${BASE}\n`);

  await call('POST', `/api/saves/${SLOT}`);
  let state = await call('GET', `/api/saves/${SLOT}`);
  let chapter = state.save.chapter;
  let gold = state.save.gold;
  let round = state.save.round;

  const log = [];
  let wins = 0;
  let losses = 0;
  let bestChapter = 1;

  console.log('回合 | 章节 | 金币 | 我方战力 | 敌方战力 | 结果 | 累计胜率');
  console.log('-----+------+------+----------+----------+------+---------');

  for (let r = 1; r <= MAX_ROUNDS; r++) {
    // ① 买棋子：买得起就买，优先买能凑成同种对子（为了升阶）
    for (let attempt = 0; attempt < 6; attempt++) {
      const shop = await call('GET', `/api/saves/${SLOT}/shop`);
      const piece = shop.slots.find((s) => s.kind === 'piece' && !s.sold && s.price <= shop.gold);
      if (!piece) break;
      await tryCall('POST', `/api/saves/${SLOT}/shop/buy`, { slotIndex: piece.slotIndex });
    }

    // ② 上阵：**只上最强的 5 个** —— 把一堆 1 级棋子全塞上场会被平均战力稀释
    state = await call('GET', `/api/saves/${SLOT}`);
    const allies = state.heroes
      .filter((h) => h.isAlly && h.exist)
      .sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    // 注意：格子不能重叠 —— 之前用 (i*2)%8 会让第 5 枚棋子撞上第 1 枚，
    // 服务端会拒绝整个布阵（这是对的），结果新棋子根本没上阵。
    const FILES = [0, 2, 4, 6, 1];
    const placements = allies.slice(0, 5).map((h, i) => ({
      heroId: h.id,
      file: FILES[i],
      rank: i < 4 ? 3 : 2,   // 前排 4 个，后排 1 个
    }));
    if (placements.length) {
      await tryCall('POST', `/api/saves/${SLOT}/formation`, { placements });
    }

    // ②b. 装备：背包里的装备装给最强、且没满 3 件的棋子
    state = await call('GET', `/api/saves/${SLOT}`);
    const equipped = state.heroes.filter((h) => h.isAlly && h.exist).sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    for (const item of state.items) {
      const target = equipped.find((h) => (h.items ?? []).length < 3 && !(h.items ?? []).includes(item.code));
      if (!target) break;
      await tryCall('POST', `/api/saves/${SLOT}/equip-item`, { itemId: item.id, heroId: target.id });
    }

    // ②c. 突破：给最强的棋子堆攻击
    state = await call('GET', `/api/saves/${SLOT}`);
    const strongest = state.heroes.filter((h) => h.isAlly && h.exist).sort((a, b) => (b.power ?? 0) - (a.power ?? 0))[0];
    if (strongest && r % 2 === 0) {
      await tryCall('POST', `/api/saves/${SLOT}/breakthrough`, { heroId: strongest.id, stat: 'attack' });
    }

    // ③ 训练：优先练还没到上限的棋子
    state = await call('GET', `/api/saves/${SLOT}`);
    for (const h of state.heroes.filter((x) => x.isAlly && x.exist).slice(0, 5)) {
      const trained = await tryCall('POST', `/api/saves/${SLOT}/train`, { heroId: h.id });
      if (!trained) break;   // 金币不够了
    }

    // ④ 升阶：有两个同种就升
    state = await call('GET', `/api/saves/${SLOT}`);
    const byTpl = new Map();
    for (const h of state.heroes.filter((x) => x.isAlly && x.exist)) {
      if (!byTpl.has(h.templateId)) byTpl.set(h.templateId, []);
      byTpl.get(h.templateId).push(h);
    }
    const pair = [...byTpl.values()].find((l) => l.length >= 2);
    if (pair) {
      await tryCall('POST', `/api/saves/${SLOT}/ascend`, { heroIdA: pair[0].id, heroIdB: pair[1].id });
    }

    // ⑤ 结束准备阶段（发收入 + 刷商店）
    await call('POST', `/api/saves/${SLOT}/round`);

    // ⑥ 战斗
    const battle = await tryCall('POST', `/api/saves/${SLOT}/battle`);
    if (!battle) {
      console.log(`${String(r).padStart(4)} | ${String(chapter).padStart(4)} | 打不了（棋盘上没人）`);
      break;
    }
    if (battle.result === 'win') wins++;
    else losses++;
    chapter = battle.chapter;
    bestChapter = Math.max(bestChapter, chapter);
    gold = battle.state.gold;
    round = battle.state.round;

    console.log(
      `${String(r).padStart(4)} | ${String(battle.state.chapter).padStart(4)} | ${String(gold).padStart(4)} | `
      + `${String(battle.allyPower).padStart(6)} | ${String(battle.enemyPower).padStart(6)} | `
      + `${(battle.result === 'win' ? '胜' : battle.result === 'lose' ? '负' : '平').padStart(4)} | `
      + `${String(Math.round((wins / (wins + losses)) * 100)).padStart(3)}%`,
    );
    log.push({ r, chapter: battle.state.chapter, gold, result: battle.result });

    // 卡住太久就换回低一点的章节再试试（玩家也会这么干）
    if (r > 6 && battle.result === 'lose' && battle.state.chapter > 1) {
      await tryCall('POST', `/api/saves/${SLOT}/chapter`, { chapter: battle.state.chapter - 1 });
    }
  }

  const rate = Math.round((wins / Math.max(1, wins + losses)) * 100);
  console.log('');
  console.log(`模拟结束：${wins + losses} 场战斗，胜率 ${rate}%，最高到达第 ${bestChapter} 章`);
  const stuck = log.filter((x) => x.result === 'lose').slice(-3);
  if (stuck.length) {
    console.log(`最后几场都在第 ${stuck[0].chapter} 章失败 —— 看看是不是数值卡住了`);
  }
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
