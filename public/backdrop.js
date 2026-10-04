// Фон листа: световое кольцо вокруг колеса и пыль в луче. Во время прокрута кольцо разгорается, пыль закручивается.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scenes = [];
  let target = 0;
  let fx = { level: 0, mid: 0 };

  const rgb = hex => {
    hex = hex.trim().replace('#', '');
    if (hex.length === 3) hex = [...hex].map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  };
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

  let colors;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    colors = { ring: rgb(cs.getPropertyValue('--acc-hi')), glow: rgb(cs.getPropertyValue('--acc')), bg: cs.getPropertyValue('--hero').trim() };
  }

  function init(cv) {
    const ctx = cv.getContext('2d');
    const anchor = cv.closest('.sheet')?.querySelector('.wheel-box');
    const s = { cv, ctx, anchor, dust: [], waves: [], kick: 0, w: 0, h: 0, dpr: 1, boost: 0, vis: true };
    const resize = () => {
      s.dpr = Math.min(1.5, devicePixelRatio || 1);
      s.w = cv.clientWidth; s.h = cv.clientHeight;
      cv.width = Math.round(s.w * s.dpr); cv.height = Math.round(s.h * s.dpr);
      const n = Math.round(Math.min(260, s.w * s.h / 6500));
      s.dust = Array.from({ length: n }, () => ({
        x: Math.random() * s.w, y: Math.random() * s.h,
        r: Math.random() ** 2 * 1.6 + 0.5,
        vx: 0, vy: 0, bvx: (Math.random() - 0.5) * 4, bvy: -Math.random() * 6 - 1,
        ph: Math.random() * 6.28, sp: 0.6 + Math.random() * 1.6,
      }));
    };
    new ResizeObserver(resize).observe(cv);
    new IntersectionObserver(e => { s.vis = e[0].isIntersecting; }).observe(cv);
    resize();
    scenes.push(s);
  }

  function draw(s, t, dt) {
    const { ctx, w, h, dpr } = s;
    if (!w || !h) return;
    s.boost += (target - s.boost) * Math.min(1, dt * 2.2);
    const b = s.boost;

    // центр и радиус колеса относительно холста
    let cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.36;
    if (s.anchor?.offsetParent) {
      const a = s.anchor.getBoundingClientRect(), c = s.cv.getBoundingClientRect();
      cx = a.left - c.left + a.width / 2; cy = a.top - c.top + a.height / 2; R = a.width / 2;
    }
    const r0 = R * 1.04;
    // под музыку кольцо дышит басом
    const k = (1 + 0.06 * Math.sin(t * 0.9)) * (1 + b * 0.7) * (1 + fx.level * 1.1);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, w, h);

    // широкое свечение
    let g = ctx.createRadialGradient(cx, cy, r0 * 0.5, cx, cy, r0 * 2.6);
    g.addColorStop(0, rgba(colors.glow, 0));
    g.addColorStop(0.3, rgba(colors.glow, 0.24 * k));
    g.addColorStop(1, rgba(colors.glow, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // кольцо
    g = ctx.createRadialGradient(cx, cy, r0 * 0.97, cx, cy, r0 * 1.6);
    g.addColorStop(0, rgba(colors.ring, 0));
    g.addColorStop(0.035, rgba(colors.ring, 0.85 * k));
    g.addColorStop(0.12, rgba(colors.ring, 0.32 * k));
    g.addColorStop(0.4, rgba(colors.glow, 0.1 * k));
    g.addColorStop(1, rgba(colors.glow, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

    // волны от колеса на сильных долях
    for (const wv of s.waves) {
      wv.age += dt * 1.15;
      const e = 1 - wv.age;
      if (e <= 0) continue;
      const rr = r0 * (1.02 + (1 - e * e) * 0.95);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.283);
      ctx.strokeStyle = rgba(colors.glow, 0.22 * e * wv.s); ctx.lineWidth = 18 * e + 4; ctx.stroke();
      ctx.strokeStyle = rgba(colors.ring, 0.7 * e * e * wv.s); ctx.lineWidth = 2.2 * e + 0.6; ctx.stroke();
    }
    s.waves = s.waves.filter(wv => wv.age < 1);
    const kick = s.kick;
    s.kick = 0;

    // пыль: дрейфует вверх, у кольца ярче, при прокруте закручивается, на долях разлетается от колеса
    for (const p of s.dust) {
      const dx = p.x - cx, dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (kick) { const push = 140 * kick * Math.min(1, r0 * 1.5 / d); p.vx += dx / d * push; p.vy += dy / d * push; }
      p.vx += (p.bvx - p.vx) * Math.min(1, dt * 2.5);
      p.vy += (p.bvy - p.vy) * Math.min(1, dt * 2.5);
      const swirl = b * 60 * Math.min(1, r0 * 1.8 / d);
      p.x += (p.vx + (-dy / d) * swirl) * dt;
      p.y += (p.vy + (dx / d) * swirl) * dt;
      if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
      if (p.x < -4) p.x = w + 4; else if (p.x > w + 4) p.x = -4;
      if (p.y > h + 4) p.y = -4;
      const near = Math.exp(-((d - r0) ** 2) / (2 * (r0 * 0.35) ** 2));
      const a = (0.2 + 0.8 * near) * (0.55 + 0.45 * Math.sin(t * p.sp + p.ph)) * (1 + b * 0.5);
      ctx.fillStyle = rgba(near > 0.4 ? colors.ring : [255, 255, 255], a);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + fx.mid * 0.9), 0, 6.283); ctx.fill();
    }
  }

  readColors();
  document.querySelectorAll('canvas.backdrop').forEach(init);
  window.setBackdropColors = readColors;
  window.setBackdropActive = on => { target = on ? 1 : 0; };
  window.setBackdropFx = v => {
    fx = v;
    if (v.beat && !reduce) for (const s of scenes) { s.waves.push({ age: 0, s: v.beat }); s.kick = Math.max(s.kick, v.beat); }
  };

  let last = performance.now();
  (function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const s of scenes) if (s.vis) draw(s, reduce ? 10 : now / 1000, reduce ? 0 : dt);
  })(last);
})();
