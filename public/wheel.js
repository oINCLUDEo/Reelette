// Колесо на canvas. Угол хранится в оборотах: rot ≡ −(позиция под стрелкой).
class Wheel {
  constructor(canvas, { onTick, onCurrent, onSlow, idleSpeed = 0, hubButton = false } = {}) {
    this.hubButton = hubButton; // центр закрыт DOM-кнопкой, рисовать его не нужно
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cache = document.createElement('canvas');
    this.items = [];           // {id, title, poster, w, target}
    this.rot = 0;
    this.anim = null;
    this.onTick = onTick || (() => {});
    this.onCurrent = onCurrent || (() => {});
    this.onSlow = onSlow; // похоже, устройство не тянет эффекты — один раз за жизнь страницы (app.js предлагает лёгкий режим)
    this.bornAt = performance.now();
    this.idleSpeed = idleSpeed;
    this.images = new Map();
    this.dirty = true;
    this.curId = null;
    this.tint = null; // цвет постера под стрелкой (app.js): подсветка сектора и свечение ламп
    this.calm = matchMedia('(prefers-reduced-motion: reduce)').matches; // без вспышек ламп
    this.readColors();
    this.textW = new Map(); // ширина подписи кеглем 100px: ширина текста растёт с кеглем линейно, мерить каждую сборку незачем
    // подписи рисуются шрифтом интерфейса: когда он догрузился, ширины меряются заново и кэш пересобирается
    // (и на каждую догрузку: Carlito приходит кусками по алфавитам, и «ł», «ż» могут догрузиться посреди вечера)
    const refont = () => { this.textW.clear(); this.dirty = true; };
    document.fonts?.ready.then(refont);
    document.fonts?.addEventListener?.('loadingdone', refont);
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

  // items: [{id, title, poster, weight, color}] в нужном порядке; color — цвет ника автора (кромка сектора). Пропавшие плавно сжимаются.
  setItems(list, { snap = false } = {}) {
    const prev = this.items;
    const byId = new Map(prev.map(i => [i.id, i]));
    const next = [];
    const seen = new Set();
    for (const f of list) {
      const old = byId.get(f.id);
      next.push({ id: f.id, title: f.title, poster: f.poster, color: f.color, w: old ? old.w : (snap ? f.weight : 0), target: f.weight });
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
    // кэш с постерами пересобирается, только если на колесе что-то поменялось: состояние комнаты приходит на любую мелочь
    // (музыка, чат, оценки), а пересборка с постерами — самое дорогое в кадре. Новые веса перетекают в frame(), он и пересоберёт
    const same = !snap && next.length === prev.length && next.every((n, i) => {
      const o = prev[i];
      return o.id === n.id && o.title === n.title && o.poster === n.poster && o.color === n.color && !o.dying === !n.dying;
    });
    if (!same) { this.dirty = true; this.shown = null; }
  }

  loadImage(url, attempt = 0) {
    if (this.images.has(url) && !attempt) return;
    const img = new Image();
    img.decoding = 'async';
    // только что догруженный постер делает сборки дорогими на любом компьютере — секунду после него скорость не меряем
    img.onload = () => { img.ok = true; this.dirty = true; this.imgAt = performance.now(); };
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

  setAngle(a) {
    if (this.anim) return;
    this.rot = a;
    this.restLabels();
  }
  // подписи на левой половине переворачиваются, чтобы читаться: считаем по углу, на котором колесо стоит
  restLabels() {
    if (Math.abs(((this.rot - (this.labelRot || 0)) % 1 + 1) % 1) > 1e-6) { this.labelRot = this.rot; this.dirty = true; }
  }

  // остановка: сектор под стрелкой на миг приподнимается над колесом (app.js landFx)
  land() { this.landAt = performance.now(); }

  static ease(t, k = 3.4) { return 1 - Math.pow(1 - t, k); }

  // веса, которые сейчас нарисованы (на слабом устройстве картинка отстаёт от перетекания на ступеньку):
  // фильм под стрелкой, название над колесом и подсветка считаются по ним, чтобы не расходиться с картинкой
  wAt(i) { return this.shown?.length === this.items.length ? this.shown[i] : this.items[i].w; }
  get shownTotal() { let t = 0; for (let i = 0; i < this.items.length; i++) t += this.wAt(i); return t; }

  currentIndex() {
    const total = this.shownTotal;
    if (!total) return -1;
    const p = (((-this.rot) % 1) + 1) % 1 * total;
    let acc = 0;
    for (let i = 0; i < this.items.length; i++) {
      acc += this.wAt(i);
      if (p < acc) return i;
    }
    return this.items.length - 1;
  }

  frame(now) {
    requestAnimationFrame(t => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    // плавное изменение весов
    let tweening = false, snapped = false;
    for (const it of this.items) {
      const d = it.target - it.w;
      // выбывший сектор схлопывается медленнее, остальные перетекают в новые размеры
      if (Math.abs(d) > 0.001) { it.w += d * Math.min(1, dt * (it.dying ? 2.6 : 4.5)); tweening = true; }
      else if (d) { it.w = it.target; snapped = true; }
    }
    // крошечная смена веса без перетекания: кэш теперь пересобирается только по делу (setItems), так что её надо заметить здесь
    if (snapped && !tweening) this.dirty = true;
    // перетекание весов: кэш с постерами и подписями пересобирается не чаще 30 раз в секунду, на глаз это так же плавно.
    // На слабом устройстве — ступеньками (решение владельца): секторы перетекают в несколько шагов, зато страница не встаёт.
    // Режим выбирается в начале перетекания; посреди него возможен только переход в ступеньки (см. judgeWarm).
    // Каждое четвёртое на слабом идёт плавно — перемерить, вдруг устройство освободилось
    if (tweening && !this.tweened) {
      this.tweenN = (this.tweenN || 0) + 1;
      this.stepMode = Boolean(this.weak) && this.tweenN % 4 !== 0;
      this.tweenBuilds = 0; this.warm = [];
      // первая ступенька — через ~120 мс, когда секторы уже заметно сдвинулись (сразу она рисовала почти неподвижную картинку)
      if (this.stepMode) this.builtAt = now - this.stepMs() + 120;
    }
    this.calibrate(now, tweening);
    let byTween = false;
    if (tweening && !this.dirty && now - (this.builtAt || 0) > (this.stepMode ? this.stepMs() : 30)) { this.dirty = true; byTween = true; }
    if (!tweening && this.tweened) this.dirty = true; // последний кадр перетекания — точные размеры
    this.tweened = tweening;
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
        if (t >= 1) { this.anim = null; this.mood = null; this.rot %= 1; this.restLabels(); a.done?.(); }
      }
    } else if (this.idleSpeed) this.rot += this.idleSpeed * dt;
    this.speed = this.anim && dt > 0 ? Math.abs(this.rot - prevRot) / dt : 0;

    // кэш собираем до подсчёта фильма под стрелкой: оба по одним весам (см. wAt)
    if (this.dirty) {
      const t0 = performance.now();
      this.buildCache();
      // в замер скорости устройства идут только «тёплые» сборки: по ходу плавного перетекания, кроме первых двух, и когда постеры уже загрузились
      const ms = performance.now() - t0;
      if (byTween && ++this.tweenBuilds > 2 && !this.stepMode && now - (this.imgAt || 0) > 1000) { this.warm.push(ms); this.judgeWarm(); }
      // сборка ступеньки дороже тёплой (кэш картинок успевает остыть) — шаг считаем по её настоящей цене
      if (byTween && this.stepMode) this.stepCost = this.stepCost ? this.stepCost * 0.7 + ms * 0.3 : ms;
      this.builtAt = now; this.dirty = false; this.stale = true;
    }
    const idx = this.currentIndex();
    const id = this.items[idx]?.id ?? null;
    if (id !== this.curId) {
      const prev = this.curId;
      this.curId = id;
      if (prev !== null && this.anim) this.onTick();
      this.onCurrent(this.items[idx] || null);
    }

    // в покое кадр не меняется: перерисовываем, только когда колесо крутится, сектор приподнят после остановки
    // или что-то поменялось (угол, сектор под стрелкой, цвет, размер, секторы)
    const sig = `${this.rot}|${idx}|${this.tint}|${this.cv.width}`;
    if (this.anim || this.stale || sig !== this.sig || (this.landAt && now - this.landAt < 1000)) {
      this.sig = sig; this.stale = false;
      this.draw(now, idx);
    }
  }

  // Слабое устройство — по процессорному времени тёплой сборки кэша (медиана трёх и больше) на мегапиксель холста:
  // не меньше 15 мс и не меньше 30 мс/Мп. Время кадра не годится: оно зависит от частоты экрана (30 Гц, энергосбережение) и от 4K.
  // Тёплые — сборки по ходу плавного перетекания, кроме первых двух и секунды после догрузки постера. Первые тёплые всё равно
  // дороже поздних (постеры заново раскодируются): на обычных компьютерах это до ~22 мс/Мп (1080p ~8–15 мс, 2K ~20–28, 4K —
  // меньше на мегапиксель), на процессоре вчетверо медленнее — 37–140 мс/Мп (замер 2026-11-25, tools/perf.js и скрипты критиков).
  // Выходим из режима, только когда заметно легче (меньше 20 мс/Мп), — чтобы не мигать на пороге
  judgeWarm() {
    if (this.warm.length < 3) return;
    const med = [...this.warm].sort((x, y) => x - y)[this.warm.length >> 1];
    const perMp = med / (this.cv.width * this.cv.height / 1e6);
    this.warmMs = med;
    this.weak = this.weak ? perMp >= 20 : med >= 15 && perMp >= 30;
    if (this.weak && !this.stepMode) this.stepMode = true; // тормозит уже сейчас — дальше это перетекание идёт ступеньками
    if (this.weak) this.saySlow();
  }
  // шаг ступенек: сборки занимают не больше пятой части времени (5 × цена сборки ступеньки, от 200 до 500 мс);
  // у выбывшего сектора перетекание длиннее (~2,7 с), шаг не меньше 350 мс — ступенек не больше восьми
  stepMs() {
    const s = Math.min(500, Math.max(200, 5 * Math.max(this.warmMs || 40, this.stepCost || 0)));
    return this.items.some(i => i.dying) ? Math.max(s, 350) : s;
  }

  // Сигнал «похоже, тормозит»: только подсказка. Лёгкий режим человек включает сам (решение владельца) — надёжно отличить
  // слабый ноутбук от занятого обычного компьютера замер не может, а ложно замороженные эффекты хуже лишнего вопроса
  saySlow() {
    if (this.slowSaid) return;
    this.slowSaid = true;
    this.onSlow?.();
  }

  // Калибровка в покое: заметить слабое устройство до первого голоса (для подсказки). Тормозит в покое процессор (стили и перерисовка
  // анимаций ников и рамок), поэтому меряем прямо его: небольшая постоянная задача на JS, пять прогонов по одному на кадр,
  // берём самый быстрый — медленный процессор не выполнит её быстрее своей скорости, а случайная помеха минимум не портит.
  // От комнаты, экрана и видеокарты не зависит (замер сборки колеса зависел: холст рисует видеокарта с отложенным выполнением).
  // Один раз, через 4 с после входа, когда колесо стоит; даёт только подсказку, ступеньками управляет перетекание
  calibrate(now, tweening) {
    if (this.slowSaid || this.calibDone || this.anim || tweening || now - this.bornAt < 4000) return;
    (this.calibMs ||= []).push(Wheel.cpuBench());
    if (this.calibMs.length < 5) return;
    this.calibDone = true;
    this.calibMin = Math.min(...this.calibMs);
    if (this.calibMin >= Wheel.CALIB_WEAK_MS) this.saySlow();
  }
  // постоянная задача на ~1,7–2,5 мс на обычном компьютере (i3-10105F)
  static cpuBench() {
    const t = performance.now();
    let x = 0;
    for (let i = 0; i < 50000; i++) x += Math.sqrt(i) * Math.sin(i);
    const a = Array.from({ length: 750 }, (_, i) => (i * 7919) % 751);
    a.sort((p, q) => p - q);
    Wheel.sink = x + a[5]; // результат «используется», чтобы движок не выбросил вычисления
    return performance.now() - t;
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
    this.shown = this.items.map(i => i.w); // эти веса теперь на картинке
    if (!total) return;
    const segs = this.colors.seg;
    const lr = (this.labelRot || 0) * Math.PI * 2;
    const dpr = S / (this.cv?.clientWidth || S); // раз на сборку, а не на каждую подпись
    // затемнение к центру одно на все секторы: градиент от центра, у всех одинаковый
    const shadePoster = g.createRadialGradient(c, c, hub, c, c, R);
    shadePoster.addColorStop(0, 'rgba(0,0,0,.78)');
    shadePoster.addColorStop(0.55, 'rgba(0,0,0,.45)');
    shadePoster.addColorStop(1, 'rgba(0,0,0,.2)');
    const shadePlain = g.createRadialGradient(c, c, hub, c, c, R);
    shadePlain.addColorStop(0, 'rgba(0,0,0,.35)');
    shadePlain.addColorStop(1, 'rgba(255,255,255,.04)');
    const textW = (text, fs) => {
      let w = this.textW.get(text);
      if (w === undefined) { const f = g.font; g.font = '700 100px Carlito, sans-serif'; w = g.measureText(text).width; g.font = f; this.textW.set(text, w); }
      return w * fs / 100;
    };
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
        g.fillStyle = shadePoster; g.fillRect(0, 0, S, S);
      } else {
        g.fillStyle = shadePlain; g.fillRect(0, 0, S, S);
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
      // порог и в CSS-пикселях, и в реальных: при отдалении страницы буквы физически мельче
      if (fs / dpr < 10.5 || fs < 9) return;
      g.save();
      g.translate(c, c); g.rotate(mid);
      const flip = Math.cos(mid + lr) < -0.01;
      if (flip) g.rotate(Math.PI);
      g.font = `700 ${fs}px Carlito, sans-serif`;
      g.fillStyle = '#fff';
      g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = fs * 0.5;
      g.textBaseline = 'middle';
      const maxW = R * 0.93 - hub * 1.25 - R * 0.05;
      // на постере название целиком или никак: обрезанное «Мартовские…» только шумит. Длинное можно чуть ужать.
      // Сектору без постера подпись нужна, чтобы его различать, — там остаётся многоточие
      let text = it.title;
      const tw = textW(text, fs);
      if (tw > maxW) {
        const f2 = fs * maxW / tw;
        if (f2 >= fs * 0.75 && f2 / dpr >= 10.5 && f2 >= 9) g.font = `700 ${f2}px Carlito, sans-serif`;
        else if (img?.ok) { g.restore(); return; }
        else {
          while (text.length > 1 && textW(text + '…', fs) > maxW) text = text.slice(0, -1);
          text = text.trimEnd() + '…';
        }
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
        const st = this.shownTotal;
        for (let i = 0; i < idx; i++) acc += this.wAt(i);
        const a0 = -Math.PI / 2 + (acc / st) * Math.PI * 2;
        const a1 = a0 + (this.wAt(idx) / st) * Math.PI * 2;
        // приподнятый сектор: за 0,14 с выходит наружу с тенью, потом плавно садится на место
        const lt = this.landAt && !this.calm ? (now - this.landAt) / 1000 : 1;
        const lift = lt >= 1 ? 0 : lt < 0.14 ? 1 - (1 - lt / 0.14) ** 3 : (1 - (lt - 0.14) / 0.86) ** 2;
        if (lift > 0) {
          const mid = (a0 + a1) / 2, off = R * 0.04 * lift;
          x.translate(Math.cos(mid) * off, Math.sin(mid) * off);
          x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R, a0, a1); x.closePath();
          x.save(); x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = S / 22 * lift; x.fillStyle = '#000'; x.fill(); x.restore();
          x.save(); x.clip(); x.drawImage(this.cache, -c, -c); x.restore();
        }
        x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R, a0, a1); x.closePath();
        x.fillStyle = `rgba(255,255,255,${(0.07 + lift * 0.1).toFixed(3)})`; x.fill();
        // подсветка — цветом автора фильма, если он его выбрал, иначе цветом постера (tint из app.js) или акцентом темы
        const hc = this.items[idx].color || this.tint || this.colors.accent;
        x.beginPath(); x.arc(0, 0, R - S / 300, a0, a1);
        x.strokeStyle = hc; x.lineWidth = S / 120;
        x.shadowColor = hc; x.shadowBlur = S / 40; x.stroke();
      }
      x.restore();
    }

    // кольцо по краю колеса
    x.beginPath(); x.arc(c, c, R, 0, Math.PI * 2);
    x.lineWidth = S / 160; x.strokeStyle = 'rgba(0,0,0,.55)'; x.stroke();

    // лампочки: в покое ровные и тусклые, при прокруте бегут; в финале на доползании горят все и дышат.
    // Если играет музыка прокрута, на каждой сильной доле (fx.js) вспыхивают все
    const n = 36;
    const lr = (c * 0.995 + R) / 2;
    const chase = Math.floor(now / 1000 * 14);
    const fx = window.Fx;
    const flash = this.anim && fx && !this.calm ? Math.max(0, 1 - (now - fx.beatAt) / 220) : 0;
    const crawl = this.anim && this.mood === 'final' && this.speed < 0.6;
    const breath = 0.5 + 0.5 * Math.sin(now / 1000 * 7.4);
    // горящие и тусклые лампы — двумя заливками: размытие тени считается один раз на все горящие, а не на каждую
    const lit = new Path2D(), dim = new Path2D(), lr0 = S / 170;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, lx = c + Math.cos(a) * lr, ly = c + Math.sin(a) * lr;
      const p = crawl || (this.anim && ((chase + i) % 3 === 0 || flash > 0.4)) ? lit : dim;
      p.moveTo(lx + lr0, ly); p.arc(lx, ly, lr0, 0, Math.PI * 2);
    }
    x.fillStyle = 'rgba(255,255,255,.16)'; x.fill(dim);
    x.fillStyle = this.colors.light;
    x.shadowColor = this.tint || this.colors.accent; x.shadowBlur = S / (crawl ? 40 + breath * 60 : 50 - flash * 25);
    x.fill(lit);
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
      x.font = `800 ${hub * 0.72}px Carlito, sans-serif`;
      const tg = x.createLinearGradient(0, c - hub * 0.4, 0, c + hub * 0.2);
      tg.addColorStop(0, this.colors.ink); tg.addColorStop(1, this.colors.accentL);
      x.fillStyle = tg;
      x.shadowColor = this.colors.accent; x.shadowBlur = S / 50;
      x.fillText(String(count), c, c - hub * 0.12);
      x.shadowBlur = 0;
      x.font = `600 ${hub * 0.2}px Carlito, sans-serif`;
      x.fillStyle = this.colors.muted;
      x.fillText(plural(count, 'фильм', 'фильма', 'фильмов'), c, c + hub * 0.42);
    }
  }
}

// порог калибровки, мс (минимум из пяти прогонов cpuBench). Замер 2026-11-25 в комнате, обычный Chrome: обычный компьютер
// 1,7–1,8 мс (4K и маленькая комната — так же), он же под нагрузкой 8–12 потоков 2,7–2,8, процессор вдвое медленнее 3,9,
// втрое — 5,5, вчетверо — 6,6–8. Порог посередине (в логарифмической шкале) между загруженным обычным и втрое медленным.
// Присваиванием, а не static-полем класса: так работает и в Safari 14.0
Wheel.CALIB_WEAK_MS = 4.4;

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
