// Колесо на canvas. Угол хранится в оборотах: rot ≡ −(позиция под стрелкой).
class Wheel {
  constructor(canvas, { onTick, onCurrent, idleSpeed = 0, hubButton = false } = {}) {
    this.hubButton = hubButton; // центр закрыт DOM-кнопкой, рисовать его не нужно
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cache = document.createElement('canvas');
    this.items = [];           // {id, title, poster, w, target}
    this.rot = 0;
    this.anim = null;
    this.onTick = onTick || (() => {});
    this.onCurrent = onCurrent || (() => {});
    this.idleSpeed = idleSpeed;
    this.images = new Map();
    this.dirty = true;
    this.curId = null;
    this.readColors();
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  }

  readColors() {
    const cs = getComputedStyle(document.documentElement);
    this.colors = {
      seg: cs.getPropertyValue('--seg').split(',').map(s => s.trim()).filter(Boolean),
      accent: cs.getPropertyValue('--acc').trim(),
      accentL: cs.getPropertyValue('--acc-hi').trim(),
      light: cs.getPropertyValue('--btn').trim(),
      bg: cs.getPropertyValue('--sheetA').trim(),
      bg2: cs.getPropertyValue('--s2').trim(),
      rimA: cs.getPropertyValue('--s3').trim(),
      rimB: cs.getPropertyValue('--sheetA').trim(),
      ink: cs.getPropertyValue('--tx').trim(),
      muted: cs.getPropertyValue('--tx3').trim(),
    };
    this.dirty = true;
  }

  resize() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const s = Math.round(this.cv.clientWidth * dpr);
    if (!s) return;
    this.cv.width = this.cv.height = s;
    this.cache.width = this.cache.height = s;
    this.dirty = true;
  }

  // items: [{id, title, poster, weight}] в нужном порядке. Пропавшие плавно сжимаются.
  setItems(list, { snap = false } = {}) {
    const byId = new Map(this.items.map(i => [i.id, i]));
    const next = [];
    const seen = new Set();
    for (const f of list) {
      const old = byId.get(f.id);
      next.push({ id: f.id, title: f.title, poster: f.poster, w: old ? old.w : (snap ? f.weight : 0), target: f.weight });
      seen.add(f.id);
      if (f.poster) this.loadImage(f.poster);
    }
    if (!snap) {
      // выбывшие остаются на своих местах, пока не сожмутся
      this.items.forEach((it, idx) => {
        if (seen.has(it.id)) return;
        const prevId = this.items[idx - 1]?.id;
        const at = prevId ? next.findIndex(n => n.id === prevId) + 1 : 0;
        next.splice(at, 0, { ...it, target: 0 });
      });
    } else next.forEach(i => (i.w = i.target));
    this.items = next;
    this.dirty = true;
  }

  loadImage(url) {
    if (this.images.has(url)) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { img.ok = true; this.dirty = true; };
    img.src = url;
    this.images.set(url, img);
  }

  get total() { return this.items.reduce((s, i) => s + i.w, 0); }

  // Повторяет расчёт сервера: конечный угол — доля оборота.
  static endAngle(spin) {
    const total = spin.snapshot.reduce((a, f) => a + f.weight, 0);
    let acc = 0;
    for (const f of spin.snapshot) {
      if (f.id === spin.filmId) { acc += f.weight * spin.offset; break; }
      acc += f.weight;
    }
    return ((1 - acc / total) % 1 + 1) % 1;
  }

  spin(spin, fromAngle, elapsedMs, done) {
    const target = Wheel.endAngle(spin);
    const from = fromAngle;
    const delta = ((target - from) % 1 + 1) % 1;
    const to = from + spin.turns + delta;
    const dur = spin.duration * 1000;
    if (elapsedMs >= dur) { this.rot = target; this.anim = null; done?.(); return; }
    this.rot = from;
    this.anim = { from, to, dur, start: performance.now() - elapsedMs, done };
  }

  setAngle(a) { if (!this.anim) this.rot = a; }

  static ease(t) { return 1 - Math.pow(1 - t, 3.4); }

  currentIndex() {
    const total = this.total;
    if (!total) return -1;
    const p = (((-this.rot) % 1) + 1) % 1 * total;
    let acc = 0;
    for (let i = 0; i < this.items.length; i++) {
      acc += this.items[i].w;
      if (p < acc) return i;
    }
    return this.items.length - 1;
  }

  frame(now) {
    requestAnimationFrame(t => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    // плавное изменение весов
    let tweening = false;
    for (const it of this.items) {
      const d = it.target - it.w;
      if (Math.abs(d) > 0.001) { it.w += d * Math.min(1, dt * 7); tweening = true; }
      else it.w = it.target;
    }
    if (tweening) this.dirty = true;
    const before = this.items.length;
    this.items = this.items.filter(i => i.target > 0 || i.w > 0.002);
    if (this.items.length !== before) this.dirty = true;

    if (this.anim) {
      const t = Math.min(1, Math.max(0, (now - this.anim.start) / this.anim.dur)); // до старта (отсчёт) t = 0
      this.rot = this.anim.from + (this.anim.to - this.anim.from) * Wheel.ease(t);
      if (t >= 1) { const d = this.anim.done; this.anim = null; this.rot %= 1; d?.(); }
    } else if (this.idleSpeed) this.rot += this.idleSpeed * dt;

    const idx = this.currentIndex();
    const id = this.items[idx]?.id ?? null;
    if (id !== this.curId) {
      const prev = this.curId;
      this.curId = id;
      if (prev !== null && this.anim) this.onTick();
      this.onCurrent(this.items[idx] || null);
    }

    if (this.dirty) { this.buildCache(); this.dirty = false; }
    this.draw(now, idx);
  }

  geom() {
    const S = this.cv.width;
    const c = S / 2;
    const R = c * 0.9;
    return { S, c, R, hub: R * (this.hubButton ? 0.27 : 0.2) };
  }

  buildCache() {
    const { S, c, R, hub } = this.geom();
    const g = this.cache.getContext('2d');
    g.clearRect(0, 0, S, S);
    const total = this.total;
    if (!total) return;
    const segs = this.colors.seg;
    let acc = 0;
    this.items.forEach((it, i) => {
      const a0 = -Math.PI / 2 + (acc / total) * Math.PI * 2;
      acc += it.w;
      const a1 = -Math.PI / 2 + (acc / total) * Math.PI * 2;
      const span = a1 - a0;
      if (span <= 0.0005) return;
      const mid = (a0 + a1) / 2;

      g.save();
      g.beginPath(); g.moveTo(c, c); g.arc(c, c, R, a0, a1); g.closePath();
      g.fillStyle = segs[i % segs.length] || '#222';
      g.fill();
      g.clip();

      const img = it.poster && this.images.get(it.poster);
      if (img?.ok) {
        // постер «верхом» к ободу, растянут по клину
        g.translate(c, c); g.rotate(mid + Math.PI / 2);
        const W = Math.max(2 * R * Math.sin(Math.min(span, Math.PI) / 2), R * 0.25);
        const H = R;
        const k = Math.max(W / img.naturalWidth, H / img.naturalHeight);
        const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
        g.globalAlpha = 0.9;
        g.drawImage(img, -iw / 2, -R - (ih - H) * 0.35, iw, ih);
        g.globalAlpha = 1;
        g.setTransform(1, 0, 0, 1, 0, 0);
        const grd = g.createRadialGradient(c, c, hub, c, c, R);
        grd.addColorStop(0, 'rgba(0,0,0,.78)');
        grd.addColorStop(0.55, 'rgba(0,0,0,.45)');
        grd.addColorStop(1, 'rgba(0,0,0,.2)');
        g.fillStyle = grd; g.fillRect(0, 0, S, S);
      } else {
        const grd = g.createRadialGradient(c, c, hub, c, c, R);
        grd.addColorStop(0, 'rgba(0,0,0,.35)');
        grd.addColorStop(1, 'rgba(255,255,255,.04)');
        g.fillStyle = grd; g.fillRect(0, 0, S, S);
      }
      g.restore();

      // разделитель
      g.save();
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = Math.max(1, S / 500);
      g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a0) * R, c + Math.sin(a0) * R); g.stroke();
      g.restore();

      // подпись вдоль радиуса
      const arcH = span * R * 0.62;
      if (arcH < S / 90) return;
      const fs = Math.min(R * 0.072, arcH * 0.62);
      g.save();
      g.translate(c, c); g.rotate(mid);
      const flip = Math.cos(mid) < -0.01;
      if (flip) g.rotate(Math.PI);
      g.font = `700 ${fs}px Manrope, sans-serif`;
      g.fillStyle = '#fff';
      g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = fs * 0.5;
      g.textBaseline = 'middle';
      const maxW = R * 0.93 - hub * 1.25 - R * 0.05;
      let text = it.title;
      if (g.measureText(text).width > maxW) {
        while (text.length > 1 && g.measureText(text + '…').width > maxW) text = text.slice(0, -1);
        text = text.trimEnd() + '…';
      }
      g.textAlign = flip ? 'left' : 'right';
      g.fillText(text, flip ? -R * 0.93 : R * 0.93, 0);
      g.restore();
    });
  }

  draw(now, idx) {
    const { S, c, R, hub } = this.geom();
    const x = this.ctx;
    x.clearRect(0, 0, S, S);

    // обод с лампочками
    x.save();
    x.beginPath(); x.arc(c, c, c * 0.995, 0, Math.PI * 2);
    const rim = x.createLinearGradient(0, 0, 0, S);
    rim.addColorStop(0, this.colors.rimA); rim.addColorStop(1, this.colors.rimB);
    x.fillStyle = rim; x.fill();
    x.lineWidth = Math.max(1, S / 400); x.strokeStyle = 'rgba(255,255,255,.12)'; x.stroke();
    x.restore();

    const total = this.total;
    if (!total) {
      x.beginPath(); x.arc(c, c, R, 0, Math.PI * 2);
      x.fillStyle = this.colors.seg[0] || '#222'; x.fill();
    } else {
      x.save();
      x.translate(c, c); x.rotate(this.rot * Math.PI * 2);
      x.drawImage(this.cache, -c, -c);
      // подсветка сегмента под стрелкой
      if (idx >= 0) {
        let acc = 0;
        for (let i = 0; i < idx; i++) acc += this.items[i].w;
        const a0 = -Math.PI / 2 + (acc / total) * Math.PI * 2;
        const a1 = a0 + (this.items[idx].w / total) * Math.PI * 2;
        x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R, a0, a1); x.closePath();
        x.fillStyle = 'rgba(255,255,255,.07)'; x.fill();
        x.beginPath(); x.arc(0, 0, R - S / 300, a0, a1);
        x.strokeStyle = this.colors.accent; x.lineWidth = S / 120;
        x.shadowColor = this.colors.accent; x.shadowBlur = S / 40; x.stroke();
      }
      x.restore();
    }

    // кольцо по краю колеса
    x.beginPath(); x.arc(c, c, R, 0, Math.PI * 2);
    x.lineWidth = S / 160; x.strokeStyle = 'rgba(0,0,0,.55)'; x.stroke();

    // лампочки
    const n = 36;
    const speed = this.anim ? 14 : 1.2;
    const phase = now / 1000 * speed;
    const lr = (c * 0.995 + R) / 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const on = this.anim ? (Math.floor(phase) + i) % 3 === 0 : 0.5 + 0.5 * Math.sin(phase + i * 0.9) > 0.5;
      x.beginPath(); x.arc(c + Math.cos(a) * lr, c + Math.sin(a) * lr, S / 170, 0, Math.PI * 2);
      x.fillStyle = on ? this.colors.light : 'rgba(255,255,255,.14)';
      x.shadowColor = this.colors.accent; x.shadowBlur = on ? S / 50 : 0;
      x.fill();
    }
    x.shadowBlur = 0;

    if (this.hubButton) return;

    // центр
    const hg = x.createRadialGradient(c, c - hub * 0.4, hub * 0.1, c, c, hub);
    hg.addColorStop(0, this.colors.bg2); hg.addColorStop(1, this.colors.bg);
    x.beginPath(); x.arc(c, c, hub, 0, Math.PI * 2);
    x.fillStyle = hg; x.fill();
    x.lineWidth = S / 220; x.strokeStyle = 'rgba(255,255,255,.14)'; x.stroke();
    const count = this.items.filter(i => i.target > 0).length;
    if (count) {
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = `800 ${hub * 0.72}px Manrope, sans-serif`;
      const tg = x.createLinearGradient(0, c - hub * 0.4, 0, c + hub * 0.2);
      tg.addColorStop(0, this.colors.ink); tg.addColorStop(1, this.colors.accentL);
      x.fillStyle = tg;
      x.shadowColor = this.colors.accent; x.shadowBlur = S / 50;
      x.fillText(String(count), c, c - hub * 0.12);
      x.shadowBlur = 0;
      x.font = `600 ${hub * 0.2}px Manrope, sans-serif`;
      x.fillStyle = this.colors.muted;
      x.fillText(plural(count, 'фильм', 'фильма', 'фильмов'), c, c + hub * 0.42);
    }
  }
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
