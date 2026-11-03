/**
 * services/battleService.js —— 开打、结算、战斗记录。
 *
 * 战斗是**一次性的同步计算**：服务端算完整场 → 产出事件流 → 存进 battles 表 →
 * 返回给前端播放。这样战斗可复盘、可复现（种子入库），也没有原版那种
 * 「切页签留下僵尸循环往已卸载 DOM 里写」的 bug ⑳。
 */

import { transaction } from '../db/index.js';
import * as saveRepo from '../db/repo/saveRepo.js';
import * as battleRepo from '../db/repo/battleRepo.js';
import { Rng } from '../core/rng.js';
import { generateEnemyRoster, runBattle } from '../core/battle.js';
import { battleReward, roundIncome } from '../core/economy.js';
import { CHAPTERS } from '../core/balance.js';

class ServiceError extends Error {
  constructor(message, code = 'BAD_REQUEST') {
    super(message);
    this.code = code;
  }
}

/**
 * 打一场。
 * @param {number} slot
 */
export function startBattle(slot) {
  return transaction(() => {
    const save = saveRepo.getSaveRow(slot);
    if (!save) throw new ServiceError('存档不存在', 'NOT_FOUND');

    const allHeroes = saveRepo.listHeroes(save.id);
    const onBoard = allHeroes.filter((h) => h.exist && h.isAlly && h.file !== null && h.rank !== null);
    if (onBoard.length === 0) {
      throw new ServiceError('棋盘上至少要摆一个棋子才能开战', 'EMPTY_BOARD');
    }

    const rng = Rng.restore(save.rngState?.seed ? save.rngState : { seed: save.rngSeed });
    const battleSeed = rng.next();
    const enemyRoster = generateEnemyRoster(save.chapter, save.round, rng);

    const outcome = runBattle({
      allyUnits: onBoard,
      enemyUnits: enemyRoster,
      seed: battleSeed,
      chapter: save.chapter,
      round: save.round,
    });

    // 记录
    const battleId = battleRepo.insertBattle({
      saveId: save.id,
      chapter: save.chapter,
      round: save.round,
      result: outcome.result,
      rounds: outcome.rounds,
      allyPower: outcome.allyPower,
      enemyPower: outcome.enemyPower,
      seed: battleSeed,
      events: outcome.events,
    });

    // 结算奖励
    const nextStreakWin = outcome.result === 'win' ? save.streakWin + 1 : 0;
    const nextStreakLose = outcome.result === 'lose' ? save.streakLose + 1 : 0;
    const reward = battleReward(outcome.result, save.chapter, nextStreakWin, nextStreakLose);
    const income = roundIncome({
      gold: save.gold + reward.gold,
      streakWin: nextStreakWin,
      streakLose: nextStreakLose,
    });
    const gained = reward.gold + income.total;

    // 胜利后推进章节
    const nextChapter = outcome.result === 'win'
      ? Math.min(CHAPTERS, save.chapter + 1)
      : save.chapter;

    saveRepo.updateSave(save.id, {
      gold: save.gold + gained,
      chapter: nextChapter,
      streak_win: nextStreakWin,
      streak_lose: nextStreakLose,
      rng_state: rng.snapshot(),
    });

    return {
      ok: true,
      battleId,
      result: outcome.result,
      rounds: outcome.rounds,
      events: outcome.events,
      allyPower: outcome.allyPower,
      enemyPower: outcome.enemyPower,
      rewards: { gold: gained, battle: reward.gold, income },
      chapter: nextChapter,
      state: {
        gold: save.gold + gained,
        chapter: nextChapter,
        round: save.round,
        streakWin: nextStreakWin,
        streakLose: nextStreakLose,
      },
    };
  });
}

/** 战斗记录列表 */
export function listBattles(slot, limit = 30) {
  const save = saveRepo.getSaveRow(slot);
  if (!save) return [];
  return battleRepo.listBattles(save.id, limit);
}

/** 回看某场战斗 */
export function getBattle(id) {
  return battleRepo.getBattle(id);
}
