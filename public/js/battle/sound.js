// sound.js — 纯 Web Audio 程序化战斗音效（全部由振荡器与噪声缓冲实时合成，不依赖任何音频文件）

const DEFAULT_VOLUME = 0.8;

let ctx = null;
let masterGain = null;
let muted = false;
let volume = DEFAULT_VOLUME;

/* ---------- 底层：AudioContext 与总音量 ---------- */

function createContext() {
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    const c = new Ctor();
    const gain = c.createGain();
    gain.gain.value = muted ? 0 : volume;
    gain.connect(c.destination);
    return { ctx: c, gain: gain };
  } catch (e) {
    return null;
  }
}

function ensureContext() {
  try {
    if (!ctx) {
      const made = createContext();
      if (!made) return false;
      ctx = made.ctx;
      masterGain = made.gain;
    }
    if (ctx.state === 'suspended') {
      const resumed = ctx.resume();
      if (resumed && typeof resumed.catch === 'function') resumed.catch(() => {});
    }
    return true;
  } catch (e) {
    return false;
  }
}

function applyMasterGain() {
  if (!masterGain || !ctx) return;
  try {
    masterGain.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
  } catch (e) {
    /* 忽略增益异常 */
  }
}

function setMutedValue(value) {
  muted = !!value;
  applyMasterGain();
}

function setVolumeValue(value) {
  const num = Number(value);
  volume = Number.isFinite(num) ? Math.max(0, Math.min(1, num)) : volume;
  applyMasterGain();
}

/* ---------- 合成基元 ---------- */

// 单音振荡器：type 决定音色，freq → freqEnd 为音高滑移
function tone(options) {
  const type = options.type || 'sine';
  const freq = options.freq;
  const freqEnd = options.freqEnd === undefined ? null : options.freqEnd;
  const at = options.at || 0;
  const dur = options.dur === undefined ? 0.1 : options.dur;
  const peak = options.peak === undefined ? 0.1 : options.peak;
  const attack = options.attack === undefined ? 0.005 : options.attack;
  const filter = options.filter || null;

  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  let tail = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.setValueAtTime(filter.freq || 1000, t0);
    f.Q.value = filter.q === undefined ? 1 : filter.q;
    tail.connect(f);
    tail = f;
  }
  tail.connect(gain).connect(masterGain);

  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

// 噪声爆发：白噪声缓冲过双二阶滤波
function noise(options) {
  const type = options.type || 'lowpass';
  const freq = options.freq === undefined ? 1200 : options.freq;
  const freqEnd = options.freqEnd === undefined ? null : options.freqEnd;
  const at = options.at || 0;
  const dur = options.dur === undefined ? 0.1 : options.dur;
  const peak = options.peak === undefined ? 0.1 : options.peak;
  const attack = options.attack === undefined ? 0.004 : options.attack;

  const t0 = ctx.currentTime + at;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== null) {
    filt.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(filt).connect(gain).connect(masterGain);
  src.start(t0);
  src.stop(t0 + dur + 0.03);
}

// 所有音效的统一入口：静音时直接返回，异常时静默降级
function guarded(fn) {
  return function (...args) {
    try {
      if (muted) return;
      if (!ensureContext()) return;
      fn(...args);
    } catch (e) {
      /* 浏览器音频策略拒绝时静默降级 */
    }
  };
}

/* ---------- 音效实现 ---------- */

const playClick = guarded(() => {
  tone({ type: 'square', freq: 880, dur: 0.04, peak: 0.15, attack: 0.004 });
});

const playHover = guarded(() => {
  tone({ type: 'sine', freq: 1200, dur: 0.03, peak: 0.06, attack: 0.003 });
});

const playSuccess = guarded(() => {
  const notes = [660, 880, 1320];
  for (let i = 0; i < notes.length; i++) {
    tone({ type: 'sine', freq: notes[i], at: i * 0.08, dur: 0.08, peak: 0.12, attack: 0.006 });
  }
});

const playError = guarded(() => {
  for (let i = 0; i < 2; i++) {
    tone({
      type: 'square',
      freq: 220,
      freqEnd: 160,
      at: i * 0.12,
      dur: 0.1,
      peak: 0.09,
      attack: 0.005,
    });
  }
});

const playHit = guarded(() => {
  noise({ type: 'lowpass', freq: 1200, freqEnd: 400, dur: 0.09, peak: 0.18, attack: 0.002 });
  tone({ type: 'sine', freq: 120, freqEnd: 70, dur: 0.09, peak: 0.22, attack: 0.002 });
});

const playCrit = guarded(() => {
  noise({ type: 'lowpass', freq: 2200, freqEnd: 500, dur: 0.18, peak: 0.24, attack: 0.002 });
  tone({
    type: 'sawtooth',
    freq: 600,
    freqEnd: 180,
    dur: 0.18,
    peak: 0.22,
    attack: 0.003,
    filter: { type: 'lowpass', freq: 1400, q: 1 },
  });
});

const playCombo = guarded((level) => {
  const lv = Math.max(1, Math.min(20, Math.round(Number(level) || 1)));
  const freq = Math.min(1600, 520 * Math.pow(1.1, lv - 1));
  tone({ type: 'square', freq: freq, dur: 0.07, peak: 0.12, attack: 0.004 });
});

const playHeal = guarded(() => {
  tone({ type: 'sine', freq: 520, freqEnd: 780, dur: 0.2, peak: 0.14, attack: 0.02 });
  tone({ type: 'sine', freq: 1040, freqEnd: 1560, dur: 0.2, peak: 0.05, attack: 0.02 });
});

const playDodge = guarded(() => {
  tone({ type: 'triangle', freq: 900, freqEnd: 400, dur: 0.12, peak: 0.11, attack: 0.004 });
  noise({ type: 'bandpass', freq: 1800, freqEnd: 700, dur: 0.12, peak: 0.06, attack: 0.006 });
});

const playSkill = guarded(() => {
  tone({ type: 'sine', freq: 80, freqEnd: 120, dur: 0.4, peak: 0.2, attack: 0.02 });
  noise({ type: 'highpass', freq: 2400, freqEnd: 5200, dur: 0.4, peak: 0.1, attack: 0.05 });
});

const playExecute = guarded(() => {
  tone({ type: 'sine', freq: 60, freqEnd: 38, dur: 0.5, peak: 0.3, attack: 0.002 });
  noise({ type: 'lowpass', freq: 1800, freqEnd: 180, dur: 0.5, peak: 0.2, attack: 0.002 });
  tone({
    type: 'sawtooth',
    freq: 180,
    freqEnd: 90,
    dur: 0.28,
    peak: 0.1,
    attack: 0.004,
    filter: { type: 'lowpass', freq: 900, q: 1 },
  });
});

const playVictory = guarded(() => {
  const notes = [523, 659, 784, 1047];
  for (let i = 0; i < notes.length; i++) {
    tone({ type: 'triangle', freq: notes[i], at: i * 0.12, dur: 0.12, peak: 0.13, attack: 0.008 });
  }
});

const playDefeat = guarded(() => {
  const notes = [392, 330, 262];
  for (let i = 0; i < notes.length; i++) {
    tone({ type: 'triangle', freq: notes[i], at: i * 0.16, dur: 0.16, peak: 0.12, attack: 0.01 });
  }
});

const playPromote = guarded(() => {
  const notes = [600, 1200, 1800];
  for (let i = 0; i < notes.length; i++) {
    tone({ type: 'sine', freq: notes[i], at: i * 0.08, dur: 0.18, peak: 0.11, attack: 0.006 });
  }
  noise({ type: 'highpass', freq: 3000, freqEnd: 6000, dur: 0.22, peak: 0.05, attack: 0.02 });
});

const playCheck = guarded(() => {
  // 低频警报：两短一长
  tone({ type: 'square', freq: 110, dur: 0.1, peak: 0.1, attack: 0.006 });
  tone({ type: 'square', freq: 110, at: 0.16, dur: 0.1, peak: 0.1, attack: 0.006 });
  tone({ type: 'square', freq: 110, at: 0.32, dur: 0.28, peak: 0.11, attack: 0.006 });
});

/* ---------- 对外接口 ---------- */

export const sfx = {
  /** 懒创建 / 恢复 AudioContext（应在用户手势中首次调用）。 */
  ensure() {
    return ensureContext();
  },
  /** 设置静音。 */
  setMuted(value) {
    setMutedValue(value);
  },
  /** 切换静音，返回切换后的静音状态。 */
  toggleMute() {
    setMutedValue(!muted);
    return muted;
  },
  /** 当前是否静音。 */
  isMuted() {
    return muted;
  },
  /** 设置总音量（0 ~ 1）。 */
  setVolume(value) {
    setVolumeValue(value);
  },

  click: playClick,
  hover: playHover,
  success: playSuccess,
  error: playError,
  hit: playHit,
  crit: playCrit,
  combo: playCombo,
  heal: playHeal,
  dodge: playDodge,
  skill: playSkill,
  execute: playExecute,
  victory: playVictory,
  defeat: playDefeat,
  promote: playPromote,
  check: playCheck,
};
