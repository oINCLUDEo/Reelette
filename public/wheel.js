// Колесо на canvas. Угол хранится в оборотах: rot ≡ −(позиция под стрелкой).
// Стиль (по мотивам CIRO и ALCHE): колесо монохромное, в цвете только сектор под стрелкой — цвет бежит под ней,
// как свет. Вместо обода с лампочками тонкое кольцо с бегущим бликом. На скорости колесо смазывается
// и чуть запрокидывается в 3D, к остановке выпрямляется и становится резким.
class Wheel {
  constructor(canvas, { onTick, onCurrent, idleSpeed = 0, hubButton = false } = {}) {
    this.hubButton = hubButton; // центр закрыт DOM-кнопкой, рисовать его не нужно
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cache = document.createElement('canvas'); // монохромное колесо
    this.cacheColor = document.createElement('canvas'); // цветное: из него рисуется сектор под стрелкой
    this.box = canvas.parentElement; // наклон в 3D — CSS-переменной --tilt у него
    this.tilt = 0; this.hotAt = 0; this.stopAt = 0;
    this.items = [];           // {id, title, poster, w, target}
    this.rot = 0;
    this.anim = null;
    this.onTick = onTick || (() => {});
    this.onCurrent = onCurrent || (() => {});
    this.idleSpeed = idleSpeed;
    this.images = new Map();
    this.dirty = true;
    this.curId = null;
    this.calm = matchMedia('(prefers-reduced-motion: reduce)').matches; // без вспышек, смаза и наклона
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
      bg: cs.getPropertyValue('--sheetA').trim(),
      bg2: cs.getPropertyValue('--s2').trim(),
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
    this.cache.width = this.cache.height = this.cacheColor.width = this.cacheColor.height = s;
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
        next.splice(at, 0, { ...it, target: 0, dying: true });
      });
    } else next.forEach(i => (i.w = i.target));
    this.items = next;
    this.dirty = true;
  }

  loadImage(url, attempt = 0) {
    if (this.images.has(url) && !attempt) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { img.ok = true; this.dirty = true; };
    // не загрузилось (сервер или сеть моргнули): пробуем ещё, с паузой побольше и мимо кеша браузера
    img.onerror = () => { if (attempt < 4 && this.images.get(url) === img) setTimeout(() => this.loadImage(url, attempt + 1), 2000 * 3 ** attempt); };
    img.src = attempt ? `${url}${url.includes('?') ? '&' : '?'}r=${attempt}` : url;
    this.images.set(url, img);
  }

  // по кнопке «Подтянуть недостающие постеры»: ещё раз, мимо кеша, все обложки, что так и не загрузились
  reloadFailed() {
    for (const [url, img] of this.images) if (!img.ok) this.loadImage(url, 1);
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

  // Ближе к финалу выбывания: замах назад перед стартом (wind, мс; back — доля оборота) и более долгое доползание (k).
  static feel(stage) {
    if (stage === 'final') return { k: 4, wind: 900, back: 0.06 };
    if (stage === 'semi') return { k: 3.8, wind: 650, back: 0.04 };
    return { k: 3.4, wind: 0, back: 0 };
  }

  spin(spin, fromAngle, elapsedMs, done) {
    const target = Wheel.endAngle(spin);
    const from = fromAngle;
    const delta = ((target - from) % 1 + 1) % 1;
    const to = from + spin.turns + delta;
    const dur = Math.max(1, spin.duration * 1000); // при нулевой длительности колесо встаёт сразу
    if (elapsedMs >= dur) { this.rot = target; this.anim = null; this.mood = null; done?.(); return; }
    const { k, wind, back } = Wheel.feel(spin.stage);
    this.rot = from;
    this.mood = spin.stage || null;
    this.anim = { from, to, dur, k, wind: Math.min(wind, dur / 4), back, start: performance.now() - elapsedMs, done };
  }

  setAngle(a) { if (!this.anim) this.rot = a; }

  static ease(t, k = 3.4) { return 1 - Math.pow(1 - t, k); }

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
      // выбывший сектор схлопывается медленнее, остальные перетекают в новые размеры
      if (Math.abs(d) > 0.001) { it.w += d * Math.min(1, dt * (it.dying ? 2.6 : 4.5)); tweening = true; }
      else it.w = it.target;
    }
    if (tweening) this.dirty = true;
    const before = this.items.length;
    this.items = this.items.filter(i => i.target > 0 || i.w > 0.002);
    if (this.items.length !== before) this.dirty = true;

    const prevRot = this.rot;
    if (this.anim) {
      const a = this.anim, el = now - a.start; // до старта (отсчёт) el < 0, колесо стоит
      if (el < a.wind) {
        const u = Math.max(0, el / a.wind);
        this.rot = a.from - a.back * (1 - (1 - u) * (1 - u)); // плавно оттягивается назад и замирает
      } else {
        const t = Math.min(1, Math.max(0, (el - a.wind) / (a.dur - a.wind)));
        this.rot = a.from - a.back + (a.to - a.from + a.back) * Wheel.ease(t, a.k);
        if (t >= 1) { this.anim = null; this.mood = null; this.rot %= 1; this.stopAt = now; a.done?.(); }
      }
    } else if (this.idleSpeed) this.rot += this.idleSpeed * dt;
    this.speed = this.anim && dt > 0 ? Math.abs(this.rot - prevRot) / dt : 0;

    // глубина: на скорости колесо чуть запрокидывается (до 12°), к остановке плавно выпрямляется
    if (!this.calm && this.box) {
      this.tilt += ((this.anim ? Math.min(12, this.speed * 9) : 0) - this.tilt) * Math.min(1, dt * 4);
      if (Math.abs(this.tilt - (this.tiltSet ?? -1)) > 0.05) { this.box.style.setProperty('--tilt', `${this.tilt.toFixed(2)}deg`); this.tiltSet = this.tilt; }
    }

    const idx = this.currentIndex();
    const id = this.items[idx]?.id ?? null;
    if (id !== this.curId) {
      const prev = this.curId;
      this.curId = id;
      this.hotAt = now;
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
    const g = this.cacheColor.getContext('2d');
    g.clearRect(0, 0, S, S);
    const m = this.cache.getContext('2d');
    m.clearRect(0, 0, S, S);
    const total = this.total;
    if (!total) return;
    const segs = this.colors.seg;
    const arcs = []; // углы секторов — для цветных деталей поверх монохрома
    let acc = 0;
    this.items.forEach((it, i) => {
      const a0 = -Math.PI / 2 + (acc / total) * Math.PI * 2;
      acc += it.w;
      const a1 = -Math.PI / 2 + (acc / total) * Math.PI * 2;
      const span = a1 - a0;
      if (span <= 0.0005) return;
      arcs.push({ it, a0, a1 });
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
      if (it.dying) { g.fillStyle = 'rgba(255, 60, 90, .5)'; g.fillRect(0, 0, S, S); }
      // кромка по ободу цветом автора (его цвет ника из профиля): видно, чьи фильмы на колесе
      if (it.color) {
        g.beginPath(); g.arc(c, c, R - S / 160, a0, a1);
        g.strokeStyle = it.color; g.lineWidth = S / 80; g.globalAlpha = 0.9; g.stroke(); g.globalAlpha = 1;
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
      // узкий сектор: мелкую подпись не прочитать, остаётся постер (название всё равно видно над колесом)
      const dpr = S / (this.cv?.clientWidth || S);
      // порог и в CSS-пикселях, и в реальных: при отдалении страницы буквы физически мельче
      if (fs / dpr < 10.5 || fs < 9) return;
      g.save();
      g.translate(c, c); g.rotate(mid);
      const flip = Math.cos(mid) < -0.01;
      if (flip) g.rotate(Math.PI);
      g.font = `700 ${fs}px Manrope, sans-serif`;
      g.fillStyle = '#fff';
      g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = fs * 0.5;
      g.textBaseline = 'middle';
      const maxW = R * 0.93 - hub * 1.25 - R * 0.05;
      // на постере название целиком или никак: обрезанное «Мартовские…» только шумит. Длинное можно чуть ужать.
      // Сектору без постера подпись нужна, чтобы его различать, — там остаётся многоточие
      let text = it.title;
      const tw = g.measureText(text).width;
      if (tw > maxW) {
        const f2 = fs * maxW / tw;
        if (f2 >= fs * 0.75 && f2 / dpr >= 10.5 && f2 >= 9) g.font = `700 ${f2}px Manrope, sans-serif`;
        else if (img?.ok) { g.restore(); return; }
        else {
          while (text.length > 1 && g.measureText(text + '…').width > maxW) text = text.slice(0, -1);
          text = text.trimEnd() + '…';
        }
      }
      g.textAlign = flip ? 'left' : 'right';
      g.fillText(text, flip ? -R * 0.93 : R * 0.93, 0);
      g.restore();
    });

    // монохромная копия: то же колесо в серой гамме и чуть темнее (наложение «saturation» серым убирает цвет,
    // попиксельной обработки и копий постеров не нужно). Обрезаем кругом, иначе серым зальётся и угол холста
    m.drawImage(this.cacheColor, 0, 0);
    m.save();
    m.beginPath(); m.arc(c, c, R, 0, Math.PI * 2); m.clip();
    m.globalCompositeOperation = 'saturation'; m.fillStyle = '#808080'; m.fillRect(0, 0, S, S);
    m.globalCompositeOperation = 'source-atop'; m.fillStyle = 'rgba(0,0,0,.22)'; m.fillRect(0, 0, S, S);
    m.restore();
    // в монохроме остаются цветными вспышка выбывшего и кромка цвета автора
    for (const { it, a0, a1 } of arcs) {
      if (it.dying) {
        m.save(); m.beginPath(); m.moveTo(c, c); m.arc(c, c, R, a0, a1); m.closePath();
        m.fillStyle = 'rgba(255, 60, 90, .45)'; m.fill(); m.restore();
      }
      if (it.color) {
        m.save(); m.beginPath(); m.moveTo(c, c); m.arc(c, c, R, a0, a1); m.closePath(); m.clip();
        m.beginPath(); m.arc(c, c, R - S / 160, a0, a1);
        m.strokeStyle = it.color; m.lineWidth = S / 80; m.globalAlpha = 0.9; m.stroke(); m.restore();
      }
    }
  }

  draw(now, idx) {
    const { S, c, R, hub } = this.geom();
    const x = this.ctx;
    x.clearRect(0, 0, S, S);

    const total = this.total;
    if (!total) {
      x.beginPath(); x.arc(c, c, R, 0, Math.PI * 2);
      x.fillStyle = 'rgba(255,255,255,.06)'; x.fill();
    } else {
      const ang = this.rot * Math.PI * 2;
      x.save();
      x.translate(c, c);
      // смаз на скорости: три полупрозрачные копии чуть позади по ходу вращения, на замедлении исчезают
      const blur = this.anim && !this.calm ? Math.min(1, Math.max(0, (this.speed - 0.5) / 1.5)) : 0;
      if (blur > 0) {
        const step = this.speed * Math.PI * 2 / 180; // треть кадра при 60 к/с
        x.globalAlpha = 0.22 * blur;
        for (let i = 3; i >= 1; i--) { x.save(); x.rotate(ang - step * i); x.drawImage(this.cache, -c, -c); x.restore(); }
        x.globalAlpha = 1;
      }
      x.rotate(ang);
      x.drawImage(this.cache, -c, -c);
      if (idx >= 0) {
        let acc = 0;
        for (let i = 0; i < idx; i++) acc += this.items[i].w;
        const a0 = -Math.PI / 2 + (acc / total) * Math.PI * 2;
        const a1 = a0 + (this.items[idx].w / total) * Math.PI * 2;
        // цвет — только у сектора под стрелкой; на медленном ходу он проявляется мягко, на быстром бежит без задержки
        x.save();
        x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R, a0, a1); x.closePath(); x.clip();
        x.globalAlpha = this.anim && this.speed > 1 ? 1 : Math.min(1, (now - this.hotAt) / 180);
        x.drawImage(this.cacheColor, -c, -c);
        x.restore();
        // световая кромка по ободу — цветом автора фильма, если он его выбрал, иначе акцентом темы
        const hc = this.items[idx].color || this.colors.accent;
        x.beginPath(); x.arc(0, 0, R - S / 300, a0, a1);
        x.strokeStyle = hc; x.lineWidth = S / 160;
        x.shadowColor = hc; x.shadowBlur = S / 45; x.stroke();
        x.shadowBlur = 0;
      }
      x.restore();
    }

    // край диска
    x.beginPath(); x.arc(c, c, R, 0, Math.PI * 2);
    x.lineWidth = S / 320; x.strokeStyle = 'rgba(0,0,0,.5)'; x.stroke();

    // тонкое кольцо вместо обода с лампочками. На прокруте по нему бежит блик (вдвое быстрее колеса, гаснет к остановке),
    // на сильных долях музыки (fx.js) кольцо вспыхивает, в финале на доползании дышит, на остановке коротко загорается
    const rr = c * 0.955;
    const fx = window.Fx;
    const flash = this.anim && fx && !this.calm ? Math.max(0, 1 - (now - fx.beatAt) / 260) : 0;
    const crawl = this.anim && this.mood === 'final' && this.speed < 0.6;
    const breath = crawl ? 0.5 + 0.5 * Math.sin(now / 1000 * 7.4) : 0;
    const stop = this.calm ? 0 : Math.max(0, 1 - (now - this.stopAt) / 700);
    x.beginPath(); x.arc(c, c, rr, 0, Math.PI * 2);
    x.lineWidth = Math.max(1, S / 420);
    x.strokeStyle = `rgba(255,255,255,${Math.min(0.9, 0.14 + flash * 0.35 + breath * 0.4 + stop * 0.55).toFixed(3)})`;
    x.stroke();
    const comet = this.anim && !this.calm ? Math.min(1, this.speed / 0.8) : 0;
    if (comet > 0.02) {
      const head = this.rot * Math.PI * 4 - Math.PI / 2, len = 1.1, n = 14;
      x.lineCap = 'round';
      for (let i = 0; i < n; i++) {
        const k = 1 - i / n;
        x.beginPath(); x.arc(c, c, rr, head - ((i + 1) / n) * len, head - (i / n) * len);
        x.strokeStyle = `rgba(255,255,255,${(comet * k * k * 0.95).toFixed(3)})`;
        x.lineWidth = (S / 200) * (0.4 + 0.6 * k);
        if (!i) { x.shadowColor = this.colors.accent; x.shadowBlur = S / 50; }
        x.stroke();
        x.shadowBlur = 0;
      }
      x.lineCap = 'butt';
    }

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
