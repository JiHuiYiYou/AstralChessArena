/**
 * tools/smoke-api.mjs —— 对跑起来的服务做一次端到端冒烟测试。
 *
 * 用法：先 `npm run dev`（或 ARENA_NO_OPEN=1 npm run dev），
 *      再 `node tools/smoke-api.mjs [baseUrl]`。
 */

const BASE = process.argv[2] ?? process.env.ARENA_URL ?? 'http://127.0.0.1:5180';

let failures = 0;

function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name} ${extra}`);
  }
}

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) {
    const e = new Error(`${method} ${path} → ${json.error.code}: ${json.error.message}`);
    e.payload = json;
    throw e;
  }
  return json.data;
}

async function main() {
  console.log(`\n星穹弈境 API 冒烟测试 → ${BASE}\n`);

  // 1. 元数据
  const meta = await call('GET', '/api/meta');
  check('元数据：职业 4 种', meta.professions.length === 4);
  check('元数据：棋子模板 6 种', meta.templates.length === 6);
  check('元数据：装备 8 件', meta.equipments.length === 8);
  check('元数据：卡牌 10 类', meta.cards.length === 10);

  // 2. 建档
  const state = await call('POST', '/api/saves/1');
  check('建档：初始金币 60', state.save.gold === 60, `实际 ${state.save.gold}`);
  check('建档：起手 2 个棋子', state.heroes.length === 2, `实际 ${state.heroes.length}`);
  check('建档：商店 5 个槽位', state.shop.length === 5, `实际 ${state.shop.length}`);
  check('建档：棋子已默认上阵', state.heroes.every((h) => h.file !== null));

  // 3. 商店
  const shop = await call('GET', '/api/saves/1/shop');
  check('商店：可读', shop.slots.length === 5);
  const affordable = shop.slots.find((s) => !s.sold && s.price <= shop.gold);
  if (affordable) {
    const bought = await call('POST', '/api/saves/1/shop/buy', { slotIndex: affordable.slotIndex });
    check('商店：购买成功', bought.ok === true && bought.created.kind);
    const after = await call('GET', '/api/saves/1/shop');
    check('商店：扣款生效', after.gold === shop.gold - affordable.price, `${after.gold} vs ${shop.gold - affordable.price}`);
    check('商店：槽位标记已售', after.slots.find((s) => s.slotIndex === affordable.slotIndex).sold === true);
  } else {
    console.log('  · 跳过购买测试（金币不足）');
  }

  // 4. 刷新商店
  const refreshed = await call('POST', '/api/saves/1/shop/refresh');
  check('商店：刷新成功', refreshed.ok === true && refreshed.slots.length === 5);

  // 5. 布阵
  const heroes = (await call('GET', '/api/saves/1')).heroes.filter((h) => h.isAlly);
  const placements = heroes.slice(0, 5).map((h, i) => ({ heroId: h.id, file: (i * 2) % 8, rank: i % 4 }));
  const form = await call('POST', '/api/saves/1/formation', { placements });
  check('布阵：成功', form.ok === true && form.count === placements.length);

  // 6. 训练
  const target = heroes[0];
  const train = await call('POST', '/api/saves/1/train', { heroId: target.id });
  check('训练：属性提升', train.delta.attack > 0 || train.delta.maxHp > 0, JSON.stringify(train.delta));
  check('训练：扣金币', train.cost > 0);

  // 7. 推进回合攒钱（突破要 30 金，起手 25 金不够 —— 这是设计好的经济节奏）
  for (let i = 0; i < 3; i++) {
    const r = await call('POST', '/api/saves/1/round');
    check(`回合 ${r.round}：发放收入`, r.income.total >= 5, JSON.stringify(r.income));
  }

  // 8. 突破
  const brk = await call('POST', '/api/saves/1/breakthrough', { heroId: target.id, stat: 'attack' });
  check('突破：倍率 ≥1.3', brk.rate >= 1.3, `实际 ${brk.rate}`);
  check('突破：上限同步抬高', brk.hero.breakthroughBonus?.attack >= 1.5);

  // 9. 战斗
  const battle = await call('POST', '/api/saves/1/battle');
  check('战斗：产出事件流', battle.events.length > 10, `实际 ${battle.events.length}`);
  check('战斗：结果合法', ['win', 'lose', 'draw'].includes(battle.result), battle.result);
  const types = new Set(battle.events.map((e) => e.type));
  check('战斗：含攻击事件', types.has('attack'));
  check('战斗：含结束事件', types.has('battle_end'));
  const ts = battle.events.map((e) => e.t);
  check('战斗：时间戳单调不减', ts.every((t, i) => i === 0 || t >= ts[i - 1]));

  // 10. 战斗记录
  const battles = await call('GET', '/api/saves/1/battles');
  check('战斗记录：已落库', battles.length >= 1);
  const replay = await call('GET', `/api/battles/${battle.battleId}`);
  check('战斗记录：可回看', replay.events.length === battle.events.length);

  // 11. 错误处理
  const bad = await fetch(`${BASE}/api/saves/1/train`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ heroId: 999999 }),
  }).then((r) => r.json());
  check('错误处理：棋子不存在返回 NOT_FOUND', bad.ok === false && bad.error.code === 'NOT_FOUND');

  console.log(failures === 0 ? '\n全部通过 ✓\n' : `\n${failures} 项失败 ✗\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error('\n冒烟测试崩溃：', err.message);
  if (err.payload) console.error(JSON.stringify(err.payload, null, 2));
  process.exitCode = 1;
});
