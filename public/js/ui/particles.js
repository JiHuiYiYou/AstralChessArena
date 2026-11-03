// particles.js — 全屏金色尘埃粒子背景（Canvas + requestAnimationFrame，标签页隐藏时自动暂停省电）

const PARTICLE_COUNT = 90;
const REDUCED_COUNT = 30;
const TAU = Math.PI * 2;

/**
 * 初始化粒子背景。
 * @param {HTMLCanvasElement} canvasEl 目标画布（通常是 #particles-canvas）
 * @returns {{destroy: () => void}} 控制器，调用 destroy() 可停止循环并解绑监听
 */
export function initParticles(canvasEl) {
  if (!canvasEl || typeof canvasEl.getContext !== 'function') {
    return { destroy() {} };
  }

  let ctx = null;
  try {
    ctx = canvasEl.getContext('2d');
  } catch (e) {
    ctx = null;
  }
  if (!ctx) return { destroy() {} };

  const reducedMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const count = reducedMotion ? REDUCED_COUNT : PARTICLE_COUNT;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let particles = [];
  let rafId = 0;
  let lastTime = 0;
  let running = false;
  let destroyed = false;

  // 保证画布铺满视口且处于最底层（CSS 缺失时也能正常工作）
  canvasEl.style.position = 'fixed';
  canvasEl.style.top = '0';
  canvasEl.style.left = '0';
  canvasEl.style.width = '100%';
  canvasEl.style.height = '100%';
  canvasEl.style.zIndex = '0';
  canvasEl.style.pointerEvents = 'none';
  canvasEl.style.display = 'block';

  function createParticle(initialized) {
    return {
      x: Math.random() * Math.max(1, width),
      y: initialized ? Math.random() * Math.max(1, height) : height + Math.random() * 60,
      size: 1 + Math.random() * 1.5, // 1 ~ 2.5px
      speed: 6 + Math.random() * 16, // 上浮速度 px/s
      drift: Math.random() * TAU,
      driftSpeed: 0.25 + Math.random() * 0.55,
      driftAmp: 4 + Math.random() * 12,
      alpha: 0.12 + Math.random() * 0.38,
      phase: Math.random() * TAU,
    };
  }

  function resize() {
    const rect = canvasEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width || window.innerWidth || 1));
    const h = Math.max(1, Math.round(rect.height || window.innerHeight || 1));
    dpr = Math.min(3, window.devicePixelRatio || 1);

    const prevW = width;
    const prevH = height;
    canvasEl.width = Math.round(w * dpr);
    canvasEl.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    width = w;
    height = h;

    // 视口比例变化时同步已有粒子的位置
    if (prevW > 0 && prevH > 0) {
      const sx = w / prevW;
      const sy = h / prevH;
      for (const p of particles) {
        p.x *= sx;
        p.y *= sy;
      }
    }
  }

  function update(dt) {
    for (const p of particles) {
      p.y -= p.speed * dt;
      p.drift += p.driftSpeed * dt;
      p.x += Math.sin(p.drift) * p.driftAmp * dt;

      if (p.x < -12) p.x = width + 12;
      if (p.x > width + 12) p.x = -12;

      // 出界后从底部重新进入
      if (p.y + p.size < 0) {
        p.y = height + p.size + Math.random() * 24;
        p.x = Math.random() * Math.max(1, width);
      }
    }
  }

  function draw(time) {
    ctx.clearRect(0, 0, width, height);
    for (const p of particles) {
      const twinkle = 0.62 + 0.38 * Math.sin(p.phase + time * 1.6);
      const alpha = p.alpha * twinkle;

      // 外圈柔光（低 alpha 的大圆）
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 2.2, 0, TAU);
      ctx.fillStyle = 'rgba(255, 215, 0, ' + (alpha * 0.16).toFixed(3) + ')';
      ctx.fill();

      // 亮核
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fillStyle = 'rgba(255, 240, 190, ' + alpha.toFixed(3) + ')';
      ctx.fill();
    }
  }

  function frame(now) {
    if (!running || destroyed) return;
    rafId = window.requestAnimationFrame(frame);

    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
    lastTime = now;
    update(dt);
    draw(now / 1000);
  }

  function start() {
    if (running || destroyed) return;
    running = true;
    lastTime = 0;
    rafId = window.requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    lastTime = 0;
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function onVisibilityChange() {
    if (document.hidden) stop();
    else start();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    stop();
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    try {
      ctx.clearRect(0, 0, width, height);
    } catch (e) {
      /* 忽略清理异常 */
    }
  }

  resize();
  particles = [];
  for (let i = 0; i < count; i++) particles.push(createParticle(true));
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', onVisibilityChange);

  if (reducedMotion) {
    draw(0);
  } else {
    start();
  }

  return { destroy };
}
