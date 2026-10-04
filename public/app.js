'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ls = {
  get(k, d) { try { const v = localStorage.getItem('kk_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kk_' + k, JSON.stringify(v)); } catch {} },
};

const ICON = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>',
  heart: '<svg viewBox="0 0 24 24" class="heart"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3Z"/></svg>',
};

// ---------- палитра ----------
const PALS = ['night', 'mono', 'ember'];
function applyPalette(p) {
  if (!PALS.includes(p)) p = 'night';
  document.documentElement.dataset.pal = p;
  ls.set('pal', p);
  window.setBackdropColors?.();
  wheel?.readColors();
  demo?.readColors();
  $$('#pals button').forEach(b => b.classList.toggle('on', b.dataset.p === p));
}

let wheel = null, demo = null;
applyPalette(ls.get('pal', 'night'));

// ---------- появление: заголовки из маски, блоки из размытия ----------
document.documentElement.classList.add('js');
function revealCheck() {
  const lim = innerHeight * .94;
  $$('.mk:not(.is-in), .bu:not(.is-in)').forEach(el => {
    if (!el.offsetParent || el.getBoundingClientRect().top > lim) return;
    const sib = [...el.parentElement.children].filter(x => x.matches('.mk, .bu'));
    const delay = Math.max(0, sib.indexOf(el)) * (el.classList.contains('mk') ? 110 : 90);
    (el.classList.contains('mk') ? el.firstElementChild : el).style.transitionDelay = delay + 'ms';
    el.classList.add('is-in');
  });
}
addEventListener('scroll', revealCheck, { passive: true });
addEventListener('resize', revealCheck);

// ---------- утилиты ----------
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}
function toast(text, bad = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (bad ? ' bad' : '');
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = 0; }, 2600);
  setTimeout(() => el.remove(), 3100);
}
// Окна: показываем элемент, на следующем кадре включаем переход; при закрытии ждём конец перехода.
const modalEl = m => (typeof m === 'string' ? $(m) : m);
function openModal(m) {
  const el = modalEl(m);
  clearTimeout(el._t);
  el.hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
}
function closeModal(m) {
  const el = modalEl(m);
  if (!el || el.hidden) return;
  el.classList.remove('open');
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.hidden = true;
    if (el.id === 'trailerModal') $('#trailerFrame').innerHTML = '';
  }, 300);
}
function openTrailer(key) {
  // youtube.com, а не youtube-nocookie: так плеер видит вход в YouTube и реже требует подтвердить, что вы не бот
  const k = encodeURIComponent(key);
  $('#trailerFrame').innerHTML = `<iframe src="https://www.youtube.com/embed/${k}?autoplay=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  $('#trailerLink').href = `https://www.youtube.com/watch?v=${k}`;
  openModal('#trailerModal');
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-trailer]');
  if (t) { e.stopPropagation(); openTrailer(t.dataset.trailer); }
}, true);
const fmtRuntime = m => (m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`);
const trailerBtn = f => (f.trailer ? `<button class="btn btn-ghost" data-trailer="${esc(f.trailer)}"><svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z" fill="currentColor"/></svg>Трейлер</button>` : '');
const anyModalOpen = () => $$('.modal:not([hidden])').length > 0;
function messageModal(html) {
  document.body.insertAdjacentHTML('beforeend', `<div class="modal" data-fixed><div class="modal-card small-card">${html}</div></div>`);
  openModal(document.body.lastElementChild);
}
document.addEventListener('click', e => {
  const m = e.target.closest('.modal');
  if (m && (e.target === m || e.target.closest('[data-close]')) && m.id !== 'nameModal' && !m.hasAttribute('data-fixed')) closeModal(m);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') $$('.modal.open').forEach(m => { if (m.id !== 'nameModal' && !m.hasAttribute('data-fixed')) closeModal(m); });
});

// Индикатор в переключателях подстраивается под ширину выбранной кнопки.
function placeSeg(seg) {
  const on = seg.querySelector('button.on');
  const ind = seg.querySelector('.seg-ind, .tabs-ind');
  if (!on || !ind || !on.offsetWidth) return;
  ind.style.width = on.offsetWidth + 'px';
  ind.style.transform = `translateX(${on.offsetLeft - 4}px)`;
}
addEventListener('resize', () => $$('.seg, .tabs').forEach(placeSeg));
document.fonts?.ready.then(() => $$('.seg, .tabs').forEach(placeSeg));

// Аккаунт: Discord, если настроен на сервере, иначе гость.
const account = { user: null, discord: false };
const accountReady = api('/me').then(r => Object.assign(account, r)).catch(() => {});
const loginUrl = () => `/auth/discord?back=${encodeURIComponent(location.pathname)}`;
async function logout() {
  await fetch('/auth/logout', { method: 'POST' }).catch(() => {});
  location.reload();
}
if (new URLSearchParams(location.search).has('login_error')) {
  const why = new URLSearchParams(location.search).get('login_error');
  history.replaceState(null, '', location.pathname);
  setTimeout(() => toast(why === 'cancel' ? 'Вход через Discord отменён' : 'Не удалось войти через Discord', why !== 'cancel'), 300);
}
function hue(s) { let h = 0; for (const ch of s) h = (h * 31 + ch.codePointAt(0)) % 360; return h; }
function posterStyle(f) { return f.poster ? `background-image:url('${esc(f.poster)}')` : `--c:hsl(${hue(f.title)} 35% 24%)`; }
function initial(t) { return esc((t || '?').trim()[0]?.toUpperCase() || '?'); }
function timeAgo(ts) {
  const d = new Date(ts);
  const today = new Date();
  const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === today.toDateString() ? `сегодня, ${hm}` : `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}, ${hm}`;
}

// ---------- маршрутизация ----------
const roomMatch = location.pathname.match(/^\/r\/([A-Za-z0-9]+)/);
if (roomMatch) initRoom(roomMatch[1]); else initHome();

// ================= Главная =================
function initHome() {
  $('#home').hidden = false;
  demo = new Wheel($('#demoWheel'), { idleSpeed: 0.03 });
  demo.setItems(['Интерстеллар', 'Субмарина', 'Джанго освобождённый', 'Нечто', 'Сумерки', 'Чёрный лебедь', 'Пираты Карибского моря', 'Зелёная книга', 'Реквием по мечте', 'Револьвер']
    .map((t, i) => ({ id: 'd' + i, title: t, weight: 1 + (i % 3) })), { snap: true });

  function renderRecent() {
    const recent = ls.get('rooms', []);
    $('#recent').hidden = !recent.length;
    $('#recentList').innerHTML = recent.slice(0, 9).map(r => `<div class="item"><a href="/r/${esc(r.id)}"><b>${esc(r.name)}</b><span>${timeAgo(r.at)}</span></a><button class="forget" data-forget="${esc(r.id)}" title="Убрать из списка">${ICON.x}</button></div>`).join('');
  }
  renderRecent();
  $('#recentList').addEventListener('click', e => {
    const b = e.target.closest('[data-forget]');
    if (!b) return;
    ls.set('rooms', ls.get('rooms', []).filter(r => r.id !== b.dataset.forget));
    renderRecent();
  });
  requestAnimationFrame(revealCheck); setTimeout(revealCheck, 80);

  accountReady.then(() => {
    const box = $('#homeAcct');
    if (account.user) box.innerHTML = `<span class="user-chip"><img src="${esc(account.user.avatar)}" alt="">${esc(account.user.name)}</span><button class="ghost sm" id="homeLogout">Выйти</button>`;
    else if (account.discord) box.innerHTML = `<a class="btn btn-discord" href="${loginUrl()}"><svg class="dc"><use href="#discord"/></svg>Войти через Discord</a>`;
    $('#homeLogout')?.addEventListener('click', logout);
  });

  $('#createForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = e.submitter; btn.classList.add('busy'); btn.disabled = true;
    try {
      let cid = ls.get('cid', '');
      if (!cid) { cid = Math.random().toString(36).slice(2, 12); ls.set('cid', cid); }
      const { id } = await api('/rooms', { method: 'POST', body: { name: $('#roomName').value, cid } });
      location.href = '/r/' + id;
    } catch (err) { toast(err.message, true); btn.classList.remove('busy'); btn.disabled = false; }
  });
}

// ================= Комната =================
function initRoom(roomId) {
  $('#room').hidden = false;
  const me = { name: ls.get('name', ''), cid: ls.get('cid', '') };
  if (!me.cid) { me.cid = Math.random().toString(36).slice(2, 12); ls.set('cid', me.cid); }

  let state = null;
  let spinningSid = null;
  let serverOffset = 0;
  let es = null;
  let provider = 'none';
  const settings = { mode: ls.get('mode', 'normal'), duration: ls.get('dur', 12), auto: ls.get('auto', false), sound: ls.get('sound', true), music: ls.get('music', false), delay: 0 };
  let people = [];
  let countdown = null; // секунд до старта, пока идёт отсчёт
  let countdownTimer = null;

  // ---- звук щелчка ----
  function tick() {
    const p = $('#pointer');
    p.classList.remove('tick'); void p.offsetWidth; p.classList.add('tick');
    if (settings.sound) Sfx.tick();
  }

  wheel = new Wheel($('#wheel'), {
    hubButton: true,
    onTick: tick,
    onCurrent: it => {
      $('#currentTitle').textContent = it ? it.title : ' ';
      $$('.film').forEach(el => el.classList.toggle('hot', el.dataset.id === it?.id));
    },
  });

  // короткий сигнал отсчёта, на старте выше
  function beep(go) {
    if (settings.sound) Sfx.beep(go);
  }
  // музыка прокрута подстраивает темп под скорость колеса; свой трек на это время приглушается
  function musicOn() {
    window.setBackdropActive?.(true);
    ytDuck(true);
    if (settings.music) Sfx.spinStart(() => wheel.speed || 0);
  }
  function musicOff() {
    window.setBackdropActive?.(false);
    ytDuck(false);
    Sfx.spinStop();
  }

  // ---- подключение ----
  function connect() {
    es?.close();
    es = new EventSource(`/api/rooms/${roomId}/events?name=${encodeURIComponent(me.name)}&cid=${me.cid}`);
    es.onmessage = e => handle(JSON.parse(e.data));
    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) setTimeout(connect, 2000);
    };
  }

  function handle(msg) {
    if (msg.now) serverOffset = msg.now - Date.now();
    if (msg.type === 'state') {
      state = msg.state;
      document.title = `${state.name} — Reelette`;
      remember();
      if (state.spin && state.spin.sid !== spinningSid) runSpin(state.spin);
      if (!state.spin && !spinningSid) { syncWheel(); wheel.setAngle(state.angle); }
      render();
      syncMusic();
    } else if (msg.type === 'spin') {
      runSpin(msg.spin);
    } else if (msg.type === 'presence') {
      renderPeople(msg.people);
    } else if (msg.type === 'result') {
      showResult(msg);
    } else if (msg.type === 'cancel') {
      stopCountdown();
      musicOff();
      wheel.anim = null;
      spinningSid = null;
      wheel.setAngle(state.angle);
      syncWheel();
      toast(msg.by ? `${msg.by} отменил(а) прокрут` : 'Прокрут отменён');
      render();
    } else if (msg.type === 'duel-stop') {
      toast(msg.by ? `${msg.by} остановил(а) дуэль` : 'Дуэль остановлена');
    } else if (msg.type === 'deleted') {
      es.close();
      ls.set('rooms', ls.get('rooms', []).filter(r => r.id !== roomId));
      messageModal('<h2>Комнату удалили. <span class="m">Её больше нет на сервере.</span></h2><a class="btn btn-primary" href="/">На главную</a>');
    }
  }

  function remember() {
    const list = ls.get('rooms', []).filter(r => r.id !== roomId);
    list.unshift({ id: roomId, name: state.name, at: Date.now() });
    ls.set('rooms', list.slice(0, 12));
  }

  // Та же логика, что на сервере: неизвестная длина или год не отсекаются, без жанров при выбранных жанрах не проходит.
  function matchesFilters(f) {
    const F = state?.filters;
    if (!F?.on) return true;
    if (F.maxRuntime && f.runtime && f.runtime > F.maxRuntime) return false;
    if (F.minYear && f.year && Number(f.year) < F.minYear) return false;
    if (F.genres.length && !(f.genres || []).some(g => F.genres.includes(String(g).toLowerCase()))) return false;
    return true;
  }
  function activeFilms() {
    return state ? state.films.filter(f => !state.eliminated.includes(f.id) && matchesFilters(f)) : [];
  }
  // ---- голоса: тот же расчёт веса, что на сервере ----
  const rules = () => state?.rules || { votes: 3, points: 4, cap: 4 };
  const votePoints = f => (rules().points ?? 4) * Math.min(rules().cap, (f.votes || []).length);
  const myPid = () => (account.user ? 'd' + account.user.id : 'g' + me.cid);
  const myVotesUsed = () => state.films.reduce((n, f) => n + (f.votes || []).filter(v => v.id === myPid()).length, 0);
  const iVoted = f => (f.votes || []).some(v => v.id === myPid());
  const isRoomOwner = () => Boolean(state?.owner) && state.owner === myPid();
  // удалить фильм может создатель комнаты или тот, кто фильм добавил
  const canDelete = f => isRoomOwner() || personOf(f) === myPid();
  async function voteFilm(id) {
    try { await api(`/rooms/${roomId}/films/${id}/vote`, { method: 'POST', body: { cid: me.cid, by: me.name } }); }
    catch (e) { toast(e.message, true); }
  }
  // кто добавил фильм: id Discord-пользователя или гостя; у старых фильмов только имя
  const personOf = f => (f.addedById ? (/^\d+$/.test(f.addedById) ? 'd' + f.addedById : f.addedById) : 'n:' + (f.addedBy || ''));
  const isBy = (f, pid, name) => personOf(f) === pid || (!f.addedById && f.addedBy === name);

  // Шансы: тот же расчёт, что на сервере (chanceWeights в server.js)
  function chanceWeights(list) {
    const mod = state?.modifier;
    const modOf = pid => (mod && mod.pid === pid ? mod.factor : 1);
    const w = new Map();
    if (state?.fair !== false) {
      const groups = new Map();
      for (const f of list) {
        const p = personOf(f);
        if (!groups.has(p)) groups.set(p, []);
        groups.get(p).push(f);
      }
      for (const [p, fs] of groups) {
        const sum = fs.reduce((a, f) => a + f.weight, 0) || 1;
        for (const f of fs) w.set(f.id, ((100 / groups.size) * (f.weight / sum) + votePoints(f)) * modOf(p));
      }
    } else {
      const sum = list.reduce((a, f) => a + f.weight, 0) || 1;
      for (const f of list) w.set(f.id, (100 * f.weight / sum + votePoints(f)) * modOf(personOf(f)));
    }
    return w;
  }
  const fmtFactor = x => '×' + String(x).replace('.', ',');
  const avgRating = h => {
    const author = personOf(h.film);
    const sc = Object.entries(h.ratings || {}).filter(([pid]) => pid !== author).map(([, v]) => v.score);
    return sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
  };

  function syncWheel() {
    const list = activeFilms();
    const W = chanceWeights(list);
    wheel.setItems(list.map(f => ({ ...f, weight: W.get(f.id) })));
  }

  function runSpin(spin) {
    spinningSid = spin.sid;
    const byId = new Map(state.films.map(f => [f.id, f]));
    wheel.setItems(spin.snapshot.map(s => ({ ...byId.get(s.id), weight: s.weight })).filter(f => f.id), { snap: true });
    const elapsed = Date.now() + serverOffset - spin.startedAt;
    $$('.modal.winner').forEach(closeModal);
    stopCountdown();
    if (elapsed < 0) startCountdown(spin);
    else musicOn();
    wheel.spin(spin, state.angle, elapsed, () => {
      spinningSid = null;
      musicOff();
      if (!state.spin || state.spin.sid === spin.sid) {
        state.angle = Wheel.endAngle(spin);
        // если итог уже пришёл (вкладка была свёрнута), сразу показываем актуальное колесо
        if (!state.spin) syncWheel();
      }
      render();
    });
    render();
  }

  function startCountdown(spin) {
    const step = () => {
      const left = spin.startedAt - (Date.now() + serverOffset);
      if (left <= 0) {
        stopCountdown();
        beep(true);
        musicOn();
        render();
        return;
      }
      const sec = Math.ceil(left / 1000);
      if (sec !== countdown) {
        countdown = sec;
        beep(false);
        render();
        const b = $('#spinBtn');
        b.classList.remove('beat'); void b.offsetWidth; b.classList.add('beat');
      }
    };
    countdownTimer = setInterval(step, 50);
    step();
  }
  function stopCountdown() {
    clearInterval(countdownTimer);
    countdownTimer = null;
    countdown = null;
  }

  // ---- результат ----
  let finalTimer = null;
  function showResult(msg) {
    const f = msg.film;
    if (!f) return;
    if (msg.mode !== 'elimination' && settings.music) setTimeout(() => Sfx.win(), msg.mode === 'final' ? 1700 : msg.mode === 'duel' ? 600 : 0);
    if (msg.mode === 'elimination') {
      if (settings.sound) Sfx.out();
      showWin(f, 'out', msg.left);
      if (msg.left > 1) setTimeout(() => { if ($('#winDetail').dataset.id === f.id) closeModal('#winModal'); }, 2300);
    } else if (msg.mode === 'final') {
      clearTimeout(finalTimer);
      finalTimer = setTimeout(() => showWin(f, 'win'), 1700);
    } else if (msg.mode === 'duel') {
      setTimeout(() => showWin(f, 'win', 0, 'Победитель дуэли'), 600);
    } else showWin(f, 'win');
  }

  function showWin(f, kind, left, title) {
    const card = $('#winModal .win-card');
    card.classList.toggle('out', kind === 'out');
    $('#winDetail').dataset.id = f.id;
    const label = title || (kind === 'out' ? `Выбывает${left > 1 ? `, осталось ${left}` : ''}` : 'Сегодня смотрим');
    $('#winDetail').innerHTML = `
      ${f.poster ? `<div class="win-bg" style="--img:url('${esc(f.poster)}')"></div>` : ''}
      <div class="win-inner">
        ${f.poster ? `<img src="${esc(f.poster)}" alt="">` : `<div class="noposter" style="${posterStyle(f)}"></div>`}
        <div>
          <div class="win-label">${label}</div>
          <div class="win-title">${esc(f.title)}</div>
          ${facts(f)}
          ${kind === 'win' && f.overview ? `<p>${esc(f.overview)}</p>` : ''}
          ${kind === 'win' ? `<div class="detail-actions">
            ${f.url ? `<a class="btn btn-primary" href="${esc(f.url)}" target="_blank" rel="noopener">Открыть страницу фильма</a>` : ''}
            ${trailerBtn(f)}
            ${state.films.some(x => x.id === f.id) && canDelete(f) ? `<button class="btn btn-ghost" data-remove="${esc(f.id)}">Убрать из колеса</button>` : ''}
          </div>` : ''}
        </div>
      </div>`;
    openModal('#winModal');
    $('#winDetail [data-remove]')?.addEventListener('click', async e => {
      await removeFilm(e.currentTarget.dataset.remove);
      closeModal('#winModal');
    });
  }

  function facts(f) {
    const parts = [];
    if (f.year) parts.push(`<span><b>${esc(f.year)}</b></span>`);
    if (f.runtime) parts.push(`<span><b>${fmtRuntime(f.runtime)}</b></span>`);
    if (f.rating) parts.push(`<span>Рейтинг <b>${esc(f.rating)}</b></span>`);
    if (f.genres?.length) parts.push(`<span>${esc(f.genres.join(', '))}</span>`);
    if (f.addedBy) parts.push(`<span>Добавил(а) <button class="person" data-person="${esc(personOf(f))}" data-name="${esc(f.addedBy)}">${esc(f.addedBy)}</button></span>`);
    return parts.length ? `<div class="facts">${parts.join('')}</div>` : '';
  }

  // ---- отрисовка ----
  function render() {
    if (!state) return;
    $('#roomTitle').textContent = state.name;
    const spinning = Boolean(spinningSid || state.spin);
    const active = activeFilms();
    const W = chanceWeights(active);
    const total = active.reduce((s, f) => s + W.get(f.id), 0);
    const amOwner = Boolean(state.owner) && state.owner === myPid();
    const out = new Set(state.eliminated);

    const used = myVotesUsed(), R = rules();
    $('#myVotes').innerHTML = `<span>Ваши голоса</span><span class="dots">${Array.from({ length: R.votes }, (_, i) => `<i class="${i < R.votes - used ? 'on' : ''}"></i>`).join('')}</span><span class="m">${used < R.votes ? `осталось ${R.votes - used}, каждый даёт фильму около ${R.points ?? 4}% колеса` : 'все отданы, голос можно снять'}</span>`;

    const mod = state.modifier;
    $('#modBanner').hidden = !mod || mod.factor === 1;
    if (mod && mod.factor !== 1) {
      $('#modBanner').className = 'mod-banner ' + (mod.factor < 1 ? 'down' : 'up');
      $('#modBanner').innerHTML = `<b>${fmtFactor(mod.factor)}</b><span>фильмам автора <button class="person" data-person="${esc(mod.pid)}" data-name="${esc(mod.name)}">${esc(mod.name)}</button> на этот выбор: «${esc(mod.title)}» получил среднюю ${String(mod.avg).replace('.', ',')}</span>`;
    }
    $('#fairOn').checked = state.fair !== false;
    $('#fairOn').disabled = spinning || Boolean(state.duel);
    renderRate();

    $('#filmCount').textContent = state.films.length ? String(state.films.length) : '';
    $('#filmEmpty').hidden = state.films.length > 0;
    // группы по тем, кто добавил: сначала ваши, потом остальные по числу фильмов
    const groups = new Map();
    for (const f of state.films) {
      const p = personOf(f);
      if (!groups.has(p)) groups.set(p, { pid: p, name: f.addedBy || 'Без имени', films: [] });
      groups.get(p).films.push(f);
    }
    const ordered = [...groups.values()].sort((a, b) => (b.pid === myPid()) - (a.pid === myPid()) || b.films.length - a.films.length);
    const avatarOf = pid => people.find(p => p.pid === pid)?.avatar
      || state.films.flatMap(f => f.votes || []).find(v => v.id === pid && v.avatar)?.avatar
      || (account.user && pid === myPid() ? account.user.avatar : '');
    const filmRow = f => {
      const filtered = !out.has(f.id) && !matchesFilters(f);
      const share = (W.get(f.id) || 0) / total;
      const pct = out.has(f.id) || filtered || !total ? '—' : `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;
      const nv = (f.votes || []).length, mine = iVoted(f);
      const meta = filtered ? ['не подходит под фильтры'] : [f.year, f.runtime && fmtRuntime(f.runtime)].filter(Boolean);
      return `<div class="film${out.has(f.id) ? ' out' : ''}${filtered ? ' filtered' : ''}${wheel.curId === f.id ? ' hot' : ''}" data-id="${esc(f.id)}">
        <div class="film-poster" style="${posterStyle(f)}">${f.poster ? '' : initial(f.title)}</div>
        <div class="film-main">
          <div class="film-title">${esc(f.title)}</div>
          <div class="film-meta">${meta.map(esc).join(', ')}</div>
        </div>
        <div class="film-side">
          <span class="film-pct">${pct}</span>
          <div class="film-actions">
            <button class="vote-btn${mine ? ' on' : ''}${nv ? ' has' : ''}" data-vote-film title="${mine ? 'Снять свой голос' : `Хочу посмотреть: около +${rules().points ?? 4}% колеса этому фильму`}">${ICON.heart}<b>${nv || ''}</b></button>
            ${amOwner ? `<div class="stepper"><button data-w="-1" title="Меньше">${ICON.minus}</button><b>${f.weight}</b><button data-w="1" title="Больше">${ICON.plus}</button></div>` : ''}
          </div>
        </div>
        ${canDelete(f) ? `<button class="film-del" data-del title="Удалить">${ICON.x}</button>` : ''}
      </div>`;
    };
    $('#filmList').innerHTML = ordered.map(g => {
      const gShare = total ? g.films.reduce((a, f) => a + (W.get(f.id) || 0), 0) / total : 0;
      const ava = avatarOf(g.pid);
      const closed = collapsed.has(g.pid);
      return `<div class="film-group${closed ? ' closed' : ''}">
        <div class="group-head" data-group="${esc(g.pid)}" role="button" tabindex="0" aria-expanded="${!closed}" title="${closed ? 'Развернуть' : 'Свернуть'}">
          <svg class="g-chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
          <span class="g-person" data-person="${esc(g.pid)}" data-name="${esc(g.name)}" title="Профиль">
            ${ava ? `<img src="${esc(ava)}" alt="">` : `<span class="g-ava" style="background:hsl(${hue(g.name)} 55% 42%)">${initial(g.name)}</span>`}
            <b>${esc(g.name)}${g.pid === myPid() ? ' <span class="m">(вы)</span>' : ''}</b>
          </span>
          <span class="g-count">${g.films.length}</span>
          <em>${gShare ? `${(gShare * 100).toFixed(gShare < 0.1 ? 1 : 0)}%` : '—'}</em>
        </div>
        <div class="g-body"><div>${g.films.map(filmRow).join('')}</div></div>
      </div>`;
    }).join('');

    $('#historyList').innerHTML = state.history.length
      ? state.history.slice(0, 20).map((h, i) => {
        const a = avgRating(h);
        return `<div class="hist" data-h="${i}"><i style="${posterStyle(h.film)}"></i><div><b>${esc(h.film.title)}</b><span>${timeAgo(h.at)}</span></div>${a !== null ? `<em class="score">${a.toFixed(1).replace('.', ',')}</em>` : ''}</div>`;
      }).join('')
      : '<p class="note">Пока ничего. Победители будут появляться здесь.</p>';

    const btn = $('#spinBtn');
    const counting = countdown !== null;
    const duel = state.duel;
    btn.disabled = spinning || Boolean(duel) || active.length < 2;
    btn.classList.toggle('busy', spinning && !counting);
    btn.classList.toggle('count', counting);
    $('#spinBtn .hub-label').textContent = counting ? String(countdown) : spinning ? 'Крутится'
      : settings.mode === 'duel' ? 'Дуэль' : settings.mode === 'elimination' && state.eliminated.length ? 'Дальше' : 'Крутить';
    $('#hubSub').textContent = counting || spinning ? '' : active.length < 2 ? 'нужно 2 фильма' : `${active.length} ${plural(active.length, 'фильм', 'фильма', 'фильмов')}`;

    $('#stopBtn').hidden = !counting && !state.series;
    $('#stopBtn').textContent = counting ? 'Отменить прокрут' : 'Остановить серию';
    if (spinning) {
      const by = state.spin?.by || '';
      $('#stageStatus').textContent = counting ? (by ? `${by} запускает колесо` : 'Колесо сейчас запустится')
        : state.series ? `Серия до победителя, осталось ${active.length}` : by ? `Крутит ${by}` : 'Колесо крутится';
    }
    $('#resetBtn').hidden = !state.eliminated.length || spinning;
    $('#addBtn').disabled = spinning || Boolean(duel);

    $('.stage').classList.toggle('dueling', Boolean(duel));
    $('#duelBox').hidden = !duel;
    if (duel) renderDuel(duel);
    renderFilters(spinning || Boolean(duel));

    if (duel) $('#stageStatus').textContent = '';
    else if (!spinning) {
      $('#stageStatus').textContent = active.length < 2
        ? (state.eliminated.length && active.length === 1 ? 'Остался один фильм. Чтобы начать заново, верните выбывших.'
          : state.films.length ? 'Для прокрута нужно хотя бы два фильма' : '')
        : settings.mode === 'elimination' && state.eliminated.length ? `В колесе осталось ${active.length}`
        : settings.mode === 'duel' ? 'Нажмите на центр колеса, чтобы начать дуэль' : 'Нажмите на центр колеса или пробел';
    }
  }

  // ---- общая музыка из YouTube ----
  // Сервер хранит, когда трек был на нуле (startedAt) или на какой секунде пауза (pausedAt).
  // Каждый плеер считает ожидаемую позицию сам и подтягивается, если ушёл больше чем на 2,5 с.
  let yt = null, ytReady = false, ytVid = null, ytDucked = false, ytChanging = false;
  function loadYT(cb) {
    if (window.YT?.Player) return cb();
    if (!loadYT.queue) {
      loadYT.queue = [];
      window.onYouTubeIframeAPIReady = () => loadYT.queue.forEach(f => f());
      const sc = document.createElement('script');
      sc.src = 'https://www.youtube.com/iframe_api';
      document.head.append(sc);
    }
    loadYT.queue.push(cb);
  }
  function ytExpected(m) {
    const pos = m.pausedAt != null ? m.pausedAt : (Date.now() + serverOffset - m.startedAt) / 1000;
    const d = m.duration || (ytReady ? yt.getDuration() : 0);
    if (d <= 1) return pos;
    // по кругу, только пока очередь пуста; иначе сервер сам переключит на следующий трек
    return state?.queue?.length ? Math.min(pos, d - 0.5) : pos % d;
  }
  const ytReported = new Set();
  function reportDuration(m) {
    if (!ytReady || m.duration || ytReported.has(m.vid) || ytVid !== m.vid) return;
    const d = yt.getDuration();
    if (d > 1) { ytReported.add(m.vid); api(`/rooms/${roomId}/music/duration`, { method: 'POST', body: { vid: m.vid, duration: d } }).catch(() => {}); }
  }
  function renderQueue() {
    const q = state?.queue || [];
    const m = state?.music;
    $('#ytQCount').hidden = !q.length;
    $('#ytQCount').textContent = q.length;
    $('#ytQueueBtn').hidden = !m;
    $('#ytNowBtn').textContent = m ? 'Включить сейчас' : 'Включить';
    $('#ytNowBtn').className = m ? 'btn btn-ghost' : 'btn btn-primary';
    $('#ytNext').disabled = !m;
    $('#ytQueue').innerHTML = !m ? '' : q.length
      ? `<span class="label">Дальше в очереди <span class="m">${q.length}</span></span>` + q.map((t, i) => `<div class="q-item">
          <img src="https://i.ytimg.com/vi/${esc(t.vid)}/default.jpg" alt="">
          <div><b>${esc(t.title)}</b><span>${esc(t.by)}</span></div>
          ${i ? `<button type="button" class="nav-icon" data-qup="${esc(t.qid)}" title="Играть следующим"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>` : ''}
          <button type="button" class="nav-icon" data-qrm="${esc(t.qid)}" title="Убрать из очереди"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>`).join('')
      : '<p class="note">Очередь пуста. Треки из очереди играют по порядку, когда закончится текущий.</p>';
  }
  function ytVolume() {
    if (!ytReady) return;
    const v = Number($('#ytVol').value);
    yt.setVolume(Math.round(v * (ytDucked ? 0.3 : 1)));
  }
  function ytDuck(on) { ytDucked = on; ytVolume(); }
  function syncMusic() {
    const m = state?.music;
    $('#ytCard').hidden = !m;
    $('#ytAdd').hidden = !ytChanging;
    renderQueue();
    $('#musicBtn').hidden = Boolean(m);
    if (!m) {
      if (yt) { yt.destroy(); yt = null; ytReady = false; ytVid = null; $('#ytHost').innerHTML = ''; }
      return;
    }
    $('#ytTitle').textContent = m.title;
    $('#ytBy').textContent = [m.author, m.pausedAt != null ? `на паузе (${m.by})` : `включил(а) ${m.by}`].filter(Boolean).join(', ');
    $('#ytToggle').innerHTML = m.pausedAt != null
      ? '<svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>';
    $('#ytToggle').title = m.pausedAt != null ? 'Играть у всех' : 'Пауза у всех';
    loadYT(() => {
      if (!yt) {
        ytVid = m.vid;
        $('#ytHost').innerHTML = '<div></div>';
        yt = new YT.Player($('#ytHost').firstChild, {
          videoId: m.vid,
          playerVars: { autoplay: 1, controls: 0, disablekb: 1, rel: 0, playsinline: 1, iv_load_policy: 3, start: Math.floor(ytExpected(m)) },
          events: {
            onReady: () => { ytReady = true; ytVolume(); syncMusic(); },
            onStateChange: e => {
              // трек закончился, а общая музыка не на паузе: начинаем заново (по кругу)
              if (e.data === 0 && state?.music && state.music.pausedAt == null && !state.queue?.length) { yt.seekTo(0, true); yt.playVideo(); }
              if (e.data === 1 && state?.music) reportDuration(state.music);
              if (e.data === 1) $('#ytUnmute').hidden = true;
            },
            onError: e => toast(e.data === 101 || e.data === 150 ? 'Автор запретил встраивать это видео' : 'YouTube не смог воспроизвести трек', true),
          },
        });
        return;
      }
      if (!ytReady) return;
      if (ytVid !== m.vid) { ytVid = m.vid; yt.loadVideoById({ videoId: m.vid, startSeconds: ytExpected(m) }); return; }
      reportDuration(m);
      const exp = ytExpected(m), cur = yt.getCurrentTime(), st = yt.getPlayerState();
      if (m.pausedAt != null) {
        if (st === 1 || st === 3) yt.pauseVideo();
        if (Math.abs(cur - exp) > 1) yt.seekTo(exp, true);
        $('#ytUnmute').hidden = true;
      } else {
        if (Math.abs(cur - exp) > 2.5) yt.seekTo(exp, true);
        if (st !== 1 && st !== 3) yt.playVideo();
        // браузер не дал включить звук без клика: просим нажать
        $('#ytUnmute').hidden = st === 1 || st === 3;
      }
    });
  }
  setInterval(() => { if (state?.music) syncMusic(); }, 4000);
  $('#ytUnmute').addEventListener('click', () => { Sfx.unlock(); if (ytReady) { yt.playVideo(); ytVolume(); } setTimeout(syncMusic, 600); });
  $('#ytAdd').addEventListener('submit', async e => {
    e.preventDefault();
    const url = $('#ytUrl').value.trim();
    if (!url) return;
    const now = e.submitter?.dataset.mode === 'now' || !state?.music;
    try {
      const r = await api(`/rooms/${roomId}/music`, { method: 'POST', body: { url, now, by: me.name } });
      $('#ytUrl').value = '';
      Sfx.unlock();
      if (r.queued) toast('Трек добавлен в очередь');
      else { ytChanging = false; syncMusic(); }
    } catch (err) { toast(err.message, true); }
  });
  $('#ytQueue').addEventListener('click', e => {
    const up = e.target.closest('[data-qup]'), rm = e.target.closest('[data-qrm]');
    if (up) api(`/rooms/${roomId}/music/up`, { method: 'POST', body: { qid: up.dataset.qup } }).catch(err => toast(err.message, true));
    if (rm) api(`/rooms/${roomId}/music/remove`, { method: 'POST', body: { qid: rm.dataset.qrm } }).catch(err => toast(err.message, true));
  });
  $('#ytNext').addEventListener('click', () => api(`/rooms/${roomId}/music/next`, { method: 'POST', body: { by: me.name } }).catch(e => toast(e.message, true)));
  $('#ytToggle').addEventListener('click', () => api(`/rooms/${roomId}/music/toggle`, { method: 'POST', body: { by: me.name } }).catch(e => toast(e.message, true)));
  $('#ytStop').addEventListener('click', () => confirm('Выключить музыку у всех и очистить очередь?') && api(`/rooms/${roomId}/music/stop`, { method: 'POST', body: { by: me.name } }).catch(e => toast(e.message, true)));
  const openMusicForm = () => { ytChanging = !ytChanging; syncMusic(); if (ytChanging) setTimeout(() => $('#ytUrl').focus(), 30); };
  $('#ytChange').addEventListener('click', openMusicForm);
  $('#musicBtn').addEventListener('click', openMusicForm);
  // форма ссылки — всплывающая: закрывается кликом мимо и по Esc
  document.addEventListener('click', e => {
    if (ytChanging && !e.target.closest('#navMusic')) { ytChanging = false; syncMusic(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ytChanging) { ytChanging = false; syncMusic(); } });
  $('#ytVol').addEventListener('input', () => {
    $('#ytVol').style.setProperty('--f', $('#ytVol').value / 100);
    ls.set('ytVol', Number($('#ytVol').value));
    ytVolume();
  });
  $('#ytVol').value = ls.get('ytVol', 50);
  $('#ytVol').style.setProperty('--f', $('#ytVol').value / 100);

  // ---- оценка последнего выбранного фильма ----
  function renderRate() {
    const h = state.history[0];
    const box = $('#rateBox');
    if (!h || h.consumed) { box.hidden = true; return; }
    box.hidden = false;
    const author = personOf(h.film);
    const isAuthor = author === myPid();
    const mine = h.ratings?.[myPid()]?.score || 0;
    const list = Object.entries(h.ratings || {}).filter(([pid]) => pid !== author);
    const mod = state.modifier;
    const who = `<button class="person" data-person="${esc(author)}" data-name="${esc(h.film.addedBy || '')}">${esc(h.film.addedBy || 'автора')}</button>`;
    const effect = !mod
      ? `Средняя оценка изменит шанс фильмов ${who} на следующий выбор.`
      : mod.factor === 1 ? `Средняя ${String(mod.avg).replace('.', ',')}: шанс фильмов ${who} не меняется.`
      : `Средняя ${String(mod.avg).replace('.', ',')}: фильмы ${who} получат ${fmtFactor(mod.factor)} на следующий выбор.`;
    box.innerHTML = `
      <h3>Оцените после просмотра</h3>
      <div class="rate-film" data-h="0"><i style="${posterStyle(h.film)}">${h.film.poster ? '' : initial(h.film.title)}</i><div><b>${esc(h.film.title)}</b><span>добавил(а) ${who}</span></div></div>
      ${isAuthor ? '<p class="note">Это ваш фильм, его оценивают остальные.</p>'
        : `<div class="rate-scale">${Array.from({ length: 10 }, (_, i) => `<button class="${i + 1 === mine ? 'on' : ''} ${i + 1 < 5 ? 'low' : i + 1 < 8 ? 'mid' : 'high'}" data-score="${i + 1}">${i + 1}</button>`).join('')}</div>`}
      ${list.length ? `<div class="rate-list">${list.map(([pid, v]) => `<span><button class="person" data-person="${esc(pid)}" data-name="${esc(v.name)}">${esc(v.name)}</button><b>${v.score}</b></span>`).join('')}</div>` : ''}
      <p class="rate-effect">${effect}</p>`;
  }
  $('#rateBox').addEventListener('click', async e => {
    const b = e.target.closest('[data-score]');
    if (!b) return;
    const h = state.history[0];
    const score = b.classList.contains('on') ? 0 : Number(b.dataset.score); // повторный клик снимает оценку
    try { await api(`/rooms/${roomId}/rate`, { method: 'POST', body: { hid: h.hid, score, cid: me.cid, by: me.name } }); }
    catch (err) { toast(err.message, true); }
  });
  $('#fairOn').addEventListener('change', e => {
    state.fair = e.target.checked;
    syncWheel(); render();
    api(`/rooms/${roomId}`, { method: 'PATCH', body: { fair: state.fair } }).catch(err => toast(err.message, true));
  });

  // ---- мини-профиль: считается из данных комнаты ----
  function openProfile(pid, name) {
    if (!state) return;
    const online = people.find(p => p.pid === pid);
    const avatar = online?.avatar || state.films.flatMap(f => f.votes || []).find(v => v.id === pid && v.avatar)?.avatar || (account.user && pid === myPid() ? account.user.avatar : '');
    const added = state.films.filter(f => isBy(f, pid, name));
    const wins = state.history.filter(h => isBy(h.film, pid, name)).map(h => h.film);
    const voted = state.films.filter(f => (f.votes || []).some(v => v.id === pid));
    const freq = new Map();
    const seen = new Set();
    for (const f of [...added, ...wins]) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      for (const g of f.genres || []) freq.set(g, (freq.get(g) || 0) + 1);
    }
    const genres = [...freq.keys()].sort((a, b) => freq.get(b) - freq.get(a)).slice(0, 4);
    const rated = state.history.filter(h => isBy(h.film, pid, name)).map(avgRating).filter(a => a !== null);
    const avgOfHis = rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : null;
    const modNow = state.modifier && state.modifier.pid === pid && state.modifier.factor !== 1 ? state.modifier : null;
    const row = list => `<div class="poster-row">${list.slice(0, 8).map(f => `<i title="${esc(f.title)}" style="${posterStyle(f)}">${f.poster ? '' : initial(f.title)}</i>`).join('')}${list.length > 8 ? `<span>+${list.length - 8}</span>` : ''}</div>`;
    const sec = (title, list) => (list.length ? `<div class="profile-sec"><h3>${title}</h3>${row(list)}</div>` : '');
    $('#profileBody').innerHTML = `
      <div class="profile-head">
        ${avatar ? `<img src="${esc(avatar)}" alt="">` : `<span class="profile-ava" style="background:hsl(${hue(name)} 55% 42%)">${initial(name)}</span>`}
        <div>
          <h2>${esc(name)}</h2>
          <div class="profile-tags"><span>${pid.startsWith('d') ? 'Discord' : 'Гость'}</span>${online ? '<span class="online">в комнате</span>' : ''}${pid === myPid() ? '<span>это вы</span>' : ''}${modNow ? `<span class="${modNow.factor < 1 ? 'down' : 'up'}">${fmtFactor(modNow.factor)} на этот выбор</span>` : ''}</div>
        </div>
      </div>
      <div class="profile-stats">
        <div><b>${added.length}</b><span>${plural(added.length, 'фильм', 'фильма', 'фильмов')} в колесе</span></div>
        <div><b>${wins.length}</b><span>${plural(wins.length, 'раз выбрали', 'раза выбрали', 'раз выбрали')} его фильм</span></div>
        <div><b>${avgOfHis !== null ? avgOfHis.toFixed(1).replace('.', ',') : '—'}</b><span>средняя оценка его фильмов</span></div>
      </div>
      ${genres.length ? `<div class="profile-sec"><h3>Любимые жанры</h3><div class="chips">${genres.map(g => `<span class="chip on-static">${esc(g)}</span>`).join('')}</div></div>` : ''}
      ${sec(`Хочет посмотреть (${voted.length} из ${rules().votes} голосов)`, voted)}
      ${sec('Выбирали его фильмы', wins)}
      ${sec('Добавил(а) в колесо', added)}
      ${!added.length && !wins.length && !voted.length ? '<p class="note">Пока ничего не добавил и не голосовал.</p>' : ''}`;
    openModal('#profileModal');
  }
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-person]');
    if (!t || !t.dataset.person) return;
    e.preventDefault();
    openProfile(t.dataset.person, t.dataset.name || 'Без имени');
  });

  // ---- дуэль ----
  const myVoter = () => (account.user ? 'd' + account.user.id : me.cid);
  function renderDuel(d) {
    const pair = d.matches[d.idx] || [];
    const byId = new Map(state.films.map(f => [f.id, f]));
    const mine = d.votes[myVoter()]?.film;
    const voters = Object.values(d.votes);
    $('#duelProgress').innerHTML = `<b>Раунд ${d.round}</b><span>пара ${d.idx + 1} из ${d.matches.length}</span><span>осталось ${d.left}</span>`;
    $('#duelPair').innerHTML = pair.map((fid, i) => {
      const f = byId.get(fid) || { title: '?' };
      const names = voters.filter(v => v.film === fid).map(v => v.name);
      const rv = d.reveal;
      const cls = [mine === fid && 'mine', rv && (rv.winner === fid ? 'win' : 'lose')].filter(Boolean).join(' ');
      const card = `<button class="duel-card ${cls}" data-vote="${esc(fid)}" ${rv ? 'disabled' : ''}>
        <span class="duel-poster" style="${posterStyle(f)}">${f.poster ? '' : initial(f.title)}</span>
        <span class="duel-info"><b>${esc(f.title)}</b><span>${[f.year, f.runtime && fmtRuntime(f.runtime)].filter(Boolean).map(esc).join(', ')}</span></span>
        <span class="duel-voters">${names.length ? names.map(n => `<i>${esc(n)}</i>`).join('') : '<em>нет голосов</em>'}</span>
        ${rv ? `<span class="duel-badge">${rv.winner === fid ? (rv.tie ? 'Ничья, прошёл по жребию' : 'Проходит дальше') : 'Вылетает'}</span>` : ''}
      </button>`;
      return i === 0 ? card + '<span class="duel-vs">VS</span>' : card;
    }).join('');
    $('#duelVotes').textContent = d.reveal ? 'Итог пары' : `Проголосовали ${voters.length} из ${Math.max(people.length, voters.length)}`;
    $('#duelNext').hidden = Boolean(d.reveal);
  }
  $('#duelPair').addEventListener('click', async e => {
    const c = e.target.closest('[data-vote]');
    if (!c || c.disabled) return;
    try { await api(`/rooms/${roomId}/duel/vote`, { method: 'POST', body: { filmId: c.dataset.vote, cid: me.cid, by: me.name } }); }
    catch (err) { toast(err.message, true); }
  });
  $('#duelNext').addEventListener('click', () => api(`/rooms/${roomId}/duel/next`, { method: 'POST' }).catch(e => toast(e.message, true)));
  $('#duelStop').addEventListener('click', () => {
    if (!confirm('Остановить дуэль? Прогресс пропадёт.')) return;
    api(`/rooms/${roomId}/duel/stop`, { method: 'POST', body: { by: me.name } }).catch(e => toast(e.message, true));
  });

  // ---- фильтры (общие для комнаты) ----
  function saveFilters(patch) {
    state.filters = { ...state.filters, ...patch };
    syncWheel();
    render();
    api(`/rooms/${roomId}`, { method: 'PATCH', body: { filters: state.filters } }).catch(e => toast(e.message, true));
  }
  function renderFilters(locked) {
    const F = state.filters || { on: false, maxRuntime: 0, minYear: 0, genres: [] };
    $('#filtersOn').checked = F.on;
    $('#filtersOn').disabled = locked;
    $('#filtersBody').hidden = !F.on;
    $('#filtersBody').classList.toggle('locked', locked);
    if (!F.on) return;
    $$('#fRuntime button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === F.maxRuntime));
    $$('#fYear button').forEach(b => b.classList.toggle('on', Number(b.dataset.v) === F.minYear));
    requestAnimationFrame(() => { placeSeg($('#fRuntime')); placeSeg($('#fYear')); });
    const freq = new Map();
    for (const f of state.films) for (const g of f.genres || []) freq.set(g.toLowerCase(), (freq.get(g.toLowerCase()) || 0) + 1);
    const genres = [...new Set([...F.genres, ...[...freq.keys()].sort((a, b) => freq.get(b) - freq.get(a))])];
    $('#fGenres').innerHTML = genres.length
      ? genres.map(g => `<button class="chip${F.genres.includes(g) ? ' on' : ''}" data-g="${esc(g)}">${esc(g)}</button>`).join('')
      : '<span class="note">Жанры появятся, когда подгрузятся данные фильмов</span>';
    const fit = state.films.filter(matchesFilters).length;
    const noLen = F.maxRuntime ? state.films.filter(f => !f.runtime).length : 0;
    $('#filtersNote').textContent = `Подходит ${fit} из ${state.films.length}.` + (noLen ? ` У ${noLen} нет длительности, их фильтр по длине не отсекает.` : '');
  }
  $('#filtersOn').addEventListener('change', e => saveFilters({ on: e.target.checked }));
  $('#fRuntime').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) saveFilters({ maxRuntime: Number(b.dataset.v) }); });
  $('#fYear').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) saveFilters({ minYear: Number(b.dataset.v) }); });
  $('#fGenres').addEventListener('click', e => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    const g = b.dataset.g, cur = state.filters.genres || [];
    saveFilters({ genres: cur.includes(g) ? cur.filter(x => x !== g) : [...cur, g] });
  });

  function renderPeople(list) {
    people = list;
    if (state?.duel) renderDuel(state.duel);
    const people_ = list;
    $('#people').innerHTML = people_.slice(0, 6).map(p => `<span class="ava" style="background:hsl(${hue(p.name)} 55% 42%)" data-tip="${esc(p.name)}" data-person="${esc(p.pid || '')}" data-name="${esc(p.name)}">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : initial(p.name)}</span>`).join('')
      + (people_.length > 6 ? `<span class="ava" style="background:#333">+${people_.length - 6}</span>` : '');
  }

  // ---- действия с фильмами ----
  async function removeFilm(id) {
    try { await api(`/rooms/${roomId}/films/${id}?cid=${encodeURIComponent(me.cid)}`, { method: 'DELETE' }); }
    catch (e) { toast(e.message, true); }
  }

  // свёрнутые группы запоминаются для комнаты в этом браузере
  const collapsed = new Set(ls.get('collapsed_' + roomId, []));
  function toggleGroup(head) {
    const pid = head.dataset.group;
    if (collapsed.has(pid)) collapsed.delete(pid); else collapsed.add(pid);
    ls.set('collapsed_' + roomId, [...collapsed]);
    const closed = collapsed.has(pid);
    head.parentElement.classList.toggle('closed', closed);
    head.setAttribute('aria-expanded', String(!closed));
    head.title = closed ? 'Развернуть' : 'Свернуть';
  }
  $('#filmList').addEventListener('keydown', e => {
    const head = e.target.closest('[data-group]');
    if (head && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleGroup(head); }
  });
  $('#filmList').addEventListener('click', async e => {
    const head = e.target.closest('[data-group]');
    if (head) { if (!e.target.closest('[data-person]')) toggleGroup(head); return; }
    const row = e.target.closest('.film');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.closest('[data-vote-film]')) return voteFilm(id);
    const w = e.target.closest('[data-w]');
    if (w) {
      try { await api(`/rooms/${roomId}/films/${id}`, { method: 'PATCH', body: { delta: Number(w.dataset.w), cid: me.cid } }); }
      catch (err) { toast(err.message, true); }
      return;
    }
    if (e.target.closest('[data-del]')) return removeFilm(id);
    showDetail(state.films.find(f => f.id === id));
  });

  $('#historyList').addEventListener('click', e => {
    const h = e.target.closest('[data-h]');
    if (h) showDetail(state.history[h.dataset.h].film, true);
  });

  function showDetail(f, fromHistory = false) {
    if (!f) return;
    const active = activeFilms();
    const W = chanceWeights(active);
    const total = active.reduce((s, x) => s + W.get(x.id), 0);
    const inWheel = !fromHistory && active.some(x => x.id === f.id);
    const votes = f.votes || [];
    const votersLine = votes.length ? `<div class="voters-line">Хотят посмотреть: ${votes.map(v => `<button class="person" data-person="${esc(v.id)}" data-name="${esc(v.name)}">${esc(v.name)}</button>`).join(', ')}${!fromHistory ? ` <span class="m">около +${votePoints(f)}% колеса</span>` : ''}</div>` : '';
    $('#filmDetail').innerHTML = `<div class="detail">
      ${f.poster ? `<img src="${esc(f.poster)}" alt="">` : `<div class="noposter" style="${posterStyle(f)}"></div>`}
      <div>
        <h2>${esc(f.title)}</h2>
        ${f.original ? `<div class="orig">${esc(f.original)}</div>` : ''}
        ${facts(f)}
        ${inWheel ? `<div class="facts"><span>Вес <b>${f.weight}</b></span><span>Голосов <b>${votes.length}</b></span><span>Шанс <b>${(W.get(f.id) / total * 100).toFixed(1)}%</b></span></div>` : ''}
        ${votersLine}
        <p>${f.overview ? esc(f.overview) : '<span class="muted">Описания нет.</span>'}</p>
        <div class="detail-actions">
          ${f.url ? `<a class="btn btn-primary" href="${esc(f.url)}" target="_blank" rel="noopener">Страница фильма</a>` : ''}
          ${trailerBtn(f)}
          ${!fromHistory ? `<button class="btn btn-ghost${iVoted(f) ? ' on' : ''}" data-vote-detail>${ICON.heart}${iVoted(f) ? 'Снять голос' : 'Хочу посмотреть'}</button>` : ''}
          ${!fromHistory && canDelete(f) ? `<button class="btn btn-ghost" data-rm>Удалить из колеса</button>` : ''}
        </div>
      </div></div>`;
    $('#filmDetail [data-rm]')?.addEventListener('click', async () => { await removeFilm(f.id); closeModal('#filmModal'); });
    $('#filmDetail [data-vote-detail]')?.addEventListener('click', async () => {
      await voteFilm(f.id);
      setTimeout(() => showDetail(state.films.find(x => x.id === f.id), false), 250);
    });
    openModal('#filmModal');
  }

  // ---- добавление ----
  $('#addBtn').addEventListener('click', () => {
    openModal('#addModal');
    requestAnimationFrame(() => placeSeg($('#addTabs')));
    setTimeout(() => $('#searchInput').focus({ preventScroll: true }), 120);
  });
  $('#addTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    $$('#addTabs button').forEach(x => x.classList.toggle('on', x === b));
    placeSeg($('#addTabs'));
    $$('#addModal [data-pane]').forEach(p => (p.hidden = p.dataset.pane !== b.dataset.tab));
  });

  let searchTimer = null, searchSeq = 0, lastResults = [];
  $('#searchInput').addEventListener('input', e => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    searchTimer = setTimeout(() => search(q), 350);
  });
  $('#searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); $('#searchResults .res')?.click(); }
  });

  async function search(q) {
    const seq = ++searchSeq;
    const box = $('#searchResults');
    if (q.length < 2) { box.innerHTML = ''; return; }
    let results = [];
    if (provider !== 'none') {
      box.innerHTML = '<p class="note">Ищу…</p>';
      try { results = (await api('/search?q=' + encodeURIComponent(q))).results; }
      catch (e) { if (seq === searchSeq) toast(e.message, true); }
    }
    if (seq !== searchSeq) return;
    lastResults = results;
    box.innerHTML = results.map((r, i) => `<button class="res" data-i="${i}">
        <i style="${r.poster ? `background-image:url('${esc(r.poster)}')` : ''}"></i>
        <div><b>${esc(r.title)}</b><span>${[r.year, r.original, r.rating && `★ ${r.rating}`].filter(Boolean).map(esc).join(', ')}</span></div>
        <span class="plus">${ICON.plus}</span></button>`).join('')
      + `<button class="res res-manual" data-manual><i></i><div><b>Добавить «${esc(q)}»</b><span>Без постера и описания</span></div><span class="plus">${ICON.plus}</span></button>`;
  }

  $('#searchResults').addEventListener('click', async e => {
    const b = e.target.closest('.res');
    if (!b || b.classList.contains('added')) return;
    const film = b.dataset.manual !== undefined ? { title: $('#searchInput').value.trim() } : lastResults[b.dataset.i];
    try {
      const r = await api(`/rooms/${roomId}/films`, { method: 'POST', body: { ...film, by: me.name, cid: me.cid } });
      b.classList.add('added');
      b.querySelector('.plus').innerHTML = ICON.check;
      toast(r.voted.length ? `«${film.title}» уже есть, ваш голос отдан ему` : r.merged.length ? `«${film.title}» уже есть в колесе` : `«${film.title}» добавлен`);
    } catch (err) { toast(err.message, true); }
  });

  // ---- добавление списком: поиск по каждой строке, затем проверка ----
  // choice: индекс найденного варианта, 'raw' (как есть) или 'skip' (не добавлять)
  let bulk = [];

  async function addFilms(films) {
    const r = await api(`/rooms/${roomId}/films`, { method: 'POST', body: { films, by: me.name, cid: me.cid } });
    toast(`Добавлено: ${r.added.length}${r.merged.length ? `, уже были: ${r.merged.length}` : ''}${r.voted.length ? `, за ${r.voted.length} из них отдан ваш голос` : ''}`);
  }
  async function findFilm(q) {
    try { return (await api('/search?q=' + encodeURIComponent(q))).results.slice(0, 6); } catch { return []; }
  }
  function showBulkReview(on) {
    $('#bulkEdit').hidden = on;
    $('#bulkReview').hidden = !on;
  }

  $('#bulkBtn').addEventListener('click', async () => {
    const lines = [...new Set($('#bulkInput').value.split('\n').map(s => s.trim()).filter(Boolean))].slice(0, 60);
    if (!lines.length) return;
    const btn = $('#bulkBtn');
    if (provider === 'none') {
      try { await addFilms(lines.map(title => ({ title }))); $('#bulkInput').value = ''; closeModal('#addModal'); }
      catch (err) { toast(err.message, true); }
      return;
    }
    btn.disabled = true;
    bulk = lines.map(query => ({ query, results: [], choice: 'raw', open: false }));
    let done = 0, next = 0;
    btn.textContent = `Ищу: 0 из ${lines.length}`;
    // по четыре запроса параллельно
    await Promise.all(Array.from({ length: Math.min(4, bulk.length) }, async () => {
      while (next < bulk.length) {
        const it = bulk[next++];
        it.results = await findFilm(it.query);
        it.choice = it.results.length ? 0 : 'raw';
        it.open = !it.results.length;
        btn.textContent = `Ищу: ${++done} из ${lines.length}`;
      }
    }));
    btn.disabled = false; btn.textContent = 'Найти фильмы';
    renderBulk();
    showBulkReview(true);
  });

  function renderBulk() {
    const missing = bulk.filter(it => !it.results.length).length;
    const count = bulk.filter(it => it.choice !== 'skip').length;
    $('#bulkSummary').innerHTML = `Будет добавлено <b>${count}</b> из ${bulk.length}${missing ? `, <span class="warn">не нашлось: ${missing}</span>` : ''}`;
    $('#bulkAdd').disabled = !count;
    $('#bulkAdd').textContent = count ? `Добавить ${count} ${plural(count, 'фильм', 'фильма', 'фильмов')}` : 'Нечего добавлять';
    $('#bulkRows').innerHTML = bulk.map((it, i) => {
      const pick = typeof it.choice === 'number' ? it.results[it.choice] : null;
      const skip = it.choice === 'skip';
      const title = pick ? pick.title : it.query;
      const sub = skip ? 'Не будет добавлен'
        : pick ? [pick.year, pick.original, pick.title.toLowerCase() !== it.query.toLowerCase() && `по запросу «${it.query}»`].filter(Boolean).map(esc).join(', ')
        : it.results.length ? 'Как есть, без постера' : 'Не нашлось. Добавить как есть, поискать иначе или пропустить?';
      return `<div class="bulk-row${it.results.length ? '' : ' missing'}${skip ? ' skip' : ''}${it.open ? ' open' : ''}" data-i="${i}">
        <div class="bulk-line">
          <i style="${pick?.poster ? `background-image:url('${esc(pick.poster)}')` : ''}">${pick?.poster ? '' : initial(it.query)}</i>
          <div class="bulk-main"><b>${esc(title)}</b><span>${sub}</span></div>
          <button class="ghost sm" data-toggle>${it.open ? 'Свернуть' : 'Изменить'}</button>
        </div>
        ${it.open ? `<div class="bulk-opts">
          ${it.results.map((r, j) => `<button class="bulk-alt${it.choice === j ? ' on' : ''}" data-pick="${j}">
            <i style="${r.poster ? `background-image:url('${esc(r.poster)}')` : ''}"></i>
            <span><b>${esc(r.title)}</b>${[r.year, r.original].filter(Boolean).map(esc).join(', ')}</span></button>`).join('')}
          <div class="bulk-actions">
            <button class="btn btn-ghost${it.choice === 'raw' ? ' on' : ''}" data-raw>Добавить как есть</button>
            <button class="btn btn-ghost${skip ? ' on' : ''}" data-skip>Не добавлять</button>
          </div>
          <div class="bulk-search"><input value="${esc(it.query)}" placeholder="Другое название"><button class="btn btn-ghost" data-research>Искать</button></div>
        </div>` : ''}
      </div>`;
    }).join('');
  }

  async function researchBulk(i, row) {
    const it = bulk[i];
    const q = row.querySelector('.bulk-search input').value.trim();
    if (q.length < 2) return;
    row.querySelector('[data-research]').textContent = 'Ищу…';
    it.query = q;
    it.results = await findFilm(q);
    it.choice = it.results.length ? 0 : 'raw';
    renderBulk();
  }

  $('#bulkRows').addEventListener('click', e => {
    const row = e.target.closest('.bulk-row');
    if (!row) return;
    const it = bulk[row.dataset.i];
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-toggle]')) it.open = !it.open;
    else if (t.matches('[data-pick]')) { it.choice = Number(t.dataset.pick); it.open = false; }
    else if (t.matches('[data-raw]')) { it.choice = 'raw'; it.open = false; }
    else if (t.matches('[data-skip]')) { it.choice = 'skip'; it.open = false; }
    else if (t.matches('[data-research]')) return researchBulk(row.dataset.i, row);
    renderBulk();
  });
  $('#bulkRows').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.closest('.bulk-search input')) return;
    e.preventDefault();
    const row = e.target.closest('.bulk-row');
    researchBulk(row.dataset.i, row);
  });
  $('#bulkBack').addEventListener('click', () => showBulkReview(false));
  $('#bulkAdd').addEventListener('click', async () => {
    const films = bulk.filter(it => it.choice !== 'skip').map(it => (typeof it.choice === 'number' ? it.results[it.choice] : { title: it.query }));
    if (!films.length) return;
    $('#bulkAdd').disabled = true;
    try {
      await addFilms(films);
      bulk = [];
      $('#bulkInput').value = '';
      showBulkReview(false);
      closeModal('#addModal');
    } catch (err) { toast(err.message, true); $('#bulkAdd').disabled = false; }
  });

  // ---- управление ----
  function setMode(m) {
    settings.mode = m; ls.set('mode', m);
    $$('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    placeSeg($('#modeSeg'));
    $('#modeNote').textContent = m === 'normal'
      ? 'Один прокрут выбирает один фильм. Шанс фильма равен его доле в колесе.'
      : m === 'elimination' ? 'Каждый прокрут убирает один фильм, последний оставшийся побеждает. Шансы на победу такие же, как в обычном режиме.'
      : 'Фильмы выходят парами, все голосуют. Проигравший вылетает, пока не останется один. При ничьей победителя выбирает жребий с учётом веса.';
    $('#autoWrap').hidden = m !== 'elimination';
    $('#durField').hidden = m === 'duel';
    $('#delayField').hidden = m === 'duel';
    render();
  }
  $('#modeSeg').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  setMode(settings.mode);

  const dur = $('#duration');
  function setDur(v) {
    settings.duration = v; ls.set('dur', v);
    dur.value = v;
    $('#durVal').textContent = v ? `${v} с` : 'сразу';
    dur.style.setProperty('--f', (v - dur.min) / (dur.max - dur.min));
  }
  dur.addEventListener('input', () => setDur(Number(dur.value)));
  setDur(settings.duration);

  function setDelay(v) {
    settings.delay = v;
    $$('#delaySeg button').forEach(b => b.classList.toggle('on', Number(b.dataset.delay) === v));
    placeSeg($('#delaySeg'));
  }
  $('#delaySeg').addEventListener('click', e => { const b = e.target.closest('[data-delay]'); if (b) setDelay(Number(b.dataset.delay)); });
  setDelay(settings.delay);

  $('#stopBtn').addEventListener('click', async () => {
    const counting = countdown !== null;
    try {
      await api(`/rooms/${roomId}/stop`, { method: 'POST', body: { by: me.name } });
      if (!counting) toast('Серия остановится после текущего прокрута');
    } catch (e) { toast(e.message, true); }
  });

  $('#autoSpin').checked = settings.auto;
  $('#autoSpin').addEventListener('change', e => { settings.auto = e.target.checked; ls.set('auto', settings.auto); });
  $('#musicOn').checked = settings.music;
  $('#musicOn').addEventListener('change', e => {
    settings.music = e.target.checked; ls.set('music', settings.music);
    if (!settings.music) Sfx.spinStop();
  });

  $('#soundOn').checked = settings.sound;
  $('#soundOn').addEventListener('change', e => { settings.sound = e.target.checked; ls.set('sound', settings.sound); });

  async function spin() {
    if ($('#spinBtn').disabled) return;
    Sfx.unlock(); // браузер разрешает звук только после клика
    if (settings.mode === 'duel') {
      try { await api(`/rooms/${roomId}/duel/start`, { method: 'POST', body: { by: me.name } }); }
      catch (e) { toast(e.message, true); }
      return;
    }
    try {
      await api(`/rooms/${roomId}/spin`, { method: 'POST', body: { mode: settings.mode, duration: settings.duration, auto: settings.auto, delay: settings.delay, by: me.name } });
    } catch (e) { toast(e.message, true); }
  }
  $('#spinBtn').addEventListener('click', spin);
  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || e.target.closest('input, textarea, button') || anyModalOpen()) return;
    e.preventDefault(); spin();
  });

  $('#resetBtn').addEventListener('click', () => api(`/rooms/${roomId}/reset`, { method: 'POST' }).catch(e => toast(e.message, true)));

  $('#inviteBtn').addEventListener('click', async () => {
    const url = location.origin + '/r/' + roomId;
    try { await navigator.clipboard.writeText(url); toast('Ссылка скопирована, отправьте её друзьям'); }
    catch { prompt('Ссылка на комнату', url); }
  });

  // ---- настройки ----
  function openSettings() {
    $('#setName').value = state?.name || '';
    $('#setNick').value = me.name;
    $('#nickField').hidden = Boolean(account.user);
    $('#accountBox').innerHTML = account.user
      ? `<img src="${esc(account.user.avatar)}" alt=""><div><b>${esc(account.user.name)}</b><span>Вход через Discord</span></div><button class="btn btn-ghost" id="logoutBtn">Выйти</button>`
      : account.discord ? `<span class="ava" style="background:hsl(${hue(me.name)} 55% 42%)">${initial(me.name)}</span><div><b>${esc(me.name)}</b><span>Гость</span></div><a class="btn btn-discord" href="${loginUrl()}"><svg class="dc"><use href="#discord"/></svg>Войти</a>` : '';
    $('#logoutBtn')?.addEventListener('click', logout);
    $('#deleteRoom').hidden = Boolean(state?.owner && state.owner !== myPid());
    $('#clearHistory').hidden = !isRoomOwner();
    $('#clearFilms').hidden = !isRoomOwner();
    $('#claimRoom').hidden = Boolean(state?.owner);
    $('#setHook').value = '';
    $('#hookState').textContent = state?.hasWebhook ? 'подключён' : '';
    $('#setHook').placeholder = state?.hasWebhook ? 'Вставьте новый, чтобы заменить' : 'https://discord.com/api/webhooks/…';
    applyPalette(document.documentElement.dataset.pal);
    openModal('#settingsModal');
  }
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#roomTitle').addEventListener('click', openSettings);
  $('#pals').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) applyPalette(b.dataset.p); });
  $('#saveSettings').addEventListener('click', async () => {
    const body = { name: $('#setName').value };
    const hook = $('#setHook').value.trim();
    if (hook) body.webhook = hook;
    try {
      await api(`/rooms/${roomId}`, { method: 'PATCH', body });
      const nick = $('#setNick').value.trim();
      if (nick && nick !== me.name) { me.name = nick; ls.set('name', nick); connect(); }
      closeModal('#settingsModal');
      toast('Сохранено');
    } catch (e) { toast(e.message, true); }
  });
  $('#clearHistory').addEventListener('click', async () => {
    if (!confirm('Очистить историю выпавших фильмов?')) return;
    await api(`/rooms/${roomId}/clear`, { method: 'POST', body: { what: 'history', cid: me.cid } }).catch(e => toast(e.message, true));
  });
  $('#deleteRoom').addEventListener('click', async () => {
    if (!confirm(`Удалить комнату «${state.name}» вместе со всеми фильмами и историей? Это нельзя отменить.`)) return;
    try {
      await api(`/rooms/${roomId}?cid=${encodeURIComponent(me.cid)}`, { method: 'DELETE' });
      ls.set('rooms', ls.get('rooms', []).filter(r => r.id !== roomId));
      location.href = '/';
    } catch (e) { toast(e.message, true); }
  });
  $('#claimRoom').addEventListener('click', async () => {
    try {
      await api(`/rooms/${roomId}/claim`, { method: 'POST', body: { cid: me.cid } });
      toast('Теперь вы создатель комнаты: вам доступны кнопки веса');
      closeModal('#settingsModal');
    } catch (e) { toast(e.message, true); }
  });
  $('#clearFilms').addEventListener('click', async () => {
    if (!confirm('Удалить все фильмы из колеса?')) return;
    await api(`/rooms/${roomId}/clear`, { method: 'POST', body: { what: 'films', cid: me.cid } }).catch(e => toast(e.message, true));
    closeModal('#settingsModal');
  });

  // ---- старт ----
  api('/config').then(c => {
    provider = c.provider;
    $('#providerNote').textContent = provider === 'kinopoisk' ? 'с Кинопоиска' : provider === 'tmdb' ? 'из TMDB' : '';
    if (provider === 'none') $('#searchInput').placeholder = 'Название фильма (поиск постеров не настроен)';
  }).catch(() => {});

  Promise.all([api(`/rooms/${roomId}`), accountReady]).then(() => {
    if (account.user) { me.name = account.user.name; connect(); }
    else if (me.name) connect();
    else {
      $$('.discord-login, .discord-or').forEach(el => (el.hidden = !account.discord));
      $('.discord-login').href = loginUrl();
      openModal('#nameModal');
      setTimeout(() => $('#nameInput').focus({ preventScroll: true }), 120);
    }
  }).catch(() => {
    messageModal('<h2>Комната не найдена. <span class="m">Возможно, её удалили или ссылка неполная.</span></h2><a class="btn btn-primary" href="/">На главную</a>');
  });

  $('#nameForm').addEventListener('submit', e => {
    e.preventDefault();
    me.name = $('#nameInput').value.trim().slice(0, 32);
    if (!me.name) return;
    ls.set('name', me.name);
    closeModal('#nameModal');
    connect();
  });
}
