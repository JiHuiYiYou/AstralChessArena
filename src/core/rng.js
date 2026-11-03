/**
 * rng.js —— 可播种的伪随机数发生器（xorshift128+）。
 *
 * 原版全靠 Math.random()，既不能复现也不能回滚（bug ⑭）。
 * 这里把种子与内部状态都存进 SQLite，任何一场战斗都能原样重放。
 */

export class Rng {
  /** @param {number|string} seed */
  constructor(seed) {
    this.seed = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
    this.s0 = this.seed || 0x9e3779b9;
    this.s1 = (this.s0 ^ 0x85ebca6b) >>> 0;
    this.s2 = (this.s1 ^ 0xc2b2ae35) >>> 0;
    this.s3 = (this.s2 ^ 0x27d4eb2f) >>> 0;
    // 预热，避免低熵种子前几个数相关
    for (let i = 0; i < 16; i++) this.next();
  }

  /** 内部状态快照（存库用） */
  snapshot() {
    return { seed: this.seed, s0: this.s0, s1: this.s1, s2: this.s2, s3: this.s3 };
  }

  /** 从快照恢复 */
  static restore(snap) {
    const rng = new Rng(snap.seed ?? 1);
    rng.s0 = snap.s0 >>> 0;
    rng.s1 = snap.s1 >>> 0;
    rng.s2 = snap.s2 >>> 0;
    rng.s3 = snap.s3 >>> 0;
    return rng;
  }

  /** 下一个 32 位无符号整数 */
  next() {
    let t = this.s3;
    const s = this.s0;
    this.s3 = this.s2;
    this.s2 = this.s1;
    this.s1 = s;
    t ^= t << 11;
    t ^= t >>> 8;
    this.s0 = (t ^ s ^ (s >>> 19)) >>> 0;
    return this.s0;
  }

  /** [0,1) */
  float() {
    return this.next() / 4294967296;
  }

  /** [min,max) 浮点 */
  range(min, max) {
    return min + this.float() * (max - min);
  }

  /** [min,max] 整数 */
  int(min, max) {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  /** 概率判定 */
  chance(p) {
    return this.float() < p;
  }

  /** 按权重挑选，weights 是 [{weight, ...}] 数组 */
  pick(weights) {
    let total = 0;
    for (const w of weights) total += w.weight ?? 0;
    if (total <= 0) return null;
    let r = this.float() * total;
    for (const w of weights) {
      r -= w.weight ?? 0;
      if (r < 0) return w;
    }
    return weights[weights.length - 1];
  }

  /** 原地洗牌 */
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** 字符串 → 32 位种子 */
export function hashSeed(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 生成一个用于新存档的随机种子 */
export function randomSeed() {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
}
