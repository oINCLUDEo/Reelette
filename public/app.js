'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
// меняем разметку только если она правда изменилась: так не перезапускаются CSS-анимации
const setHTML = (el, html) => { if (el && el.__html !== html) { el.innerHTML = html; el.__html = html; } };
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
// Кинопоиск: страница фильма, если он там найден, иначе поиск по названию и году
const kpBtn = f => {
  const id = f.kpId || (f.source === 'kinopoisk' ? f.sourceId : '');
  const href = id ? `https://www.kinopoisk.ru/film/${encodeURIComponent(id)}/` : `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(f.title + (f.year ? ' ' + f.year : ''))}`;
  return `<a class="btn btn-ghost" href="${href}" target="_blank" rel="noopener">${id ? 'На Кинопоиске' : 'Найти на Кинопоиске'}</a>`;
};
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
  const settings = { mode: ls.get('mode', 'normal'), duration: ls.get('dur', 12), auto: ls.get('auto', false), sound: ls.get('sound', true), showOut: ls.get('showOut', true), music: ls.get('music', false), delay: 0 };
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
    if (msg.type === 'profiles') { profilesMap = msg.profiles || {}; render(); return; }
    if (msg.type === 'react') { spawnReaction(msg.kind, msg.pid, msg.name); return; }
    if (msg.type === 'throw') { throwItem(msg); return; }
    if (msg.type === 'chat') {
      flyMessage(msg.msg);
      if (!msg.msg.guess && state) { state.chat = [...(state.chat || []), msg.msg].slice(-50); if (!$('#chatLog').hidden) renderChatLog(); }
      return;
    }
    if (msg.type === 'quiz-guess') {
      flyMessage({ pid: msg.pid, name: msg.name, text: `угадал(а)! +${msg.pts}`, win: true });
      if (msg.pid === myPid()) Sfx.win?.();
      return;
    }
    if (msg.type === 'state') {
      state = msg.state;
      profilesMap = state.profiles || profilesMap;
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
    } else if (msg.type === 'music-skip') {
      toast(`«${msg.title}» нельзя проиграть на сайте, включаю следующий`, true);
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
    const modOf = pid => state?.modifiers?.[pid]?.factor || 1;
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

  // ---- оформление профилей: цвет и эффект ника, рамка аватара (общие для всех комнат) ----
  let profilesMap = {};
  const GRADS = {
    sunset: ['linear-gradient(90deg,#FF5A6E,#FFB347)', '#FF5A6E', '#FFB347'],
    neon: ['linear-gradient(90deg,#22D3EE,#A855F7)', '#22D3EE', '#A855F7'],
    gold: ['linear-gradient(90deg,#FDE68A,#F59E0B,#FDE68A)', '#FDE68A', '#F59E0B'],
    ice: ['linear-gradient(90deg,#E0F2FE,#7DD3FC,#A5B4FC)', '#E0F2FE', '#7DD3FC'],
    rainbow: ['linear-gradient(90deg,#FF5A6E,#FFD54A,#3DDC97,#38BDF8,#C084FC)', '#FF5A6E', '#C084FC'],
  };
  const prof = pid => profilesMap[pid] || {};
  function nickVars(p) {
    const c = p.color || '';
    if (c.startsWith('grad:') && GRADS[c.slice(5)]) { const [g, a, b] = GRADS[c.slice(5)]; return { cls: 'c-grad', style: `--ng:${g};--n1:${a};--n2:${b};--ngl:${a}` }; }
    if (c) return { cls: 'c-solid', style: `--nc:${c};--n1:${c};--n2:${c};--ngl:${c}` };
    return { cls: '', style: '' };
  }
  function nick(pid, name, p = prof(pid)) {
    const v = nickVars(p);
    const fx = p.effect && p.effect !== 'none' ? ` fx-${p.effect}` : '';
    const font = p.font && p.font !== 'default' ? ` nf-${p.font}` : '';
    const text = p.effect === 'wave' ? [...String(name)].map((ch, i) => `<span style="--i:${i}">${esc(ch)}</span>`).join('') : esc(name);
    const b = p.badge && typeof BADGES !== 'undefined' ? BADGES.find(x => x.id === p.badge) : null;
    return `<span class="nick ${v.cls}${fx}${font}" style="${v.style}">${text}</span>`
      + (p.icon ? `<span class="nick-ico">${esc(p.icon)}</span>` : '')
      + (b ? `<i class="nick-badge" title="${esc(b.name)}"><svg viewBox="0 0 24 24">${b.icon}</svg></i>` : '');
  }
  const frameCls = (pid, p = prof(pid)) => (p.frame && p.frame !== 'none' ? ` frame-${p.frame}` : '');
  const frameVars = (pid, p = prof(pid)) => nickVars(p).style;

  // на выбывании колесо показывает шанс вылететь (как на сервере)
  const elimView = () => settings.mode === 'elimination' || Boolean(state?.eliminated?.length);
  // тот же расчёт, что elimWeights на сервере
  function elimWeights(W, list) {
    const out = new Map();
    const inv = f => 1 / Math.max(1e-6, W.get(f.id) || 0);
    if (state?.fair === false) {
      const sum = list.reduce((a, f) => a + inv(f), 0) || 1;
      for (const f of list) out.set(f.id, (inv(f) / sum) * 100);
      return out;
    }
    const groups = new Map();
    for (const f of list) { const p = personOf(f); if (!groups.has(p)) groups.set(p, []); groups.get(p).push(f); }
    const share = new Map([...groups.keys()].map(p => [p, 1 / (state?.modifiers?.[p]?.factor || 1)]));
    const tot = [...share.values()].reduce((a, b) => a + b, 0) || 1;
    for (const [p, fs] of groups) {
      const s = fs.reduce((a, f) => a + inv(f), 0) || 1;
      for (const f of fs) out.set(f.id, (100 * share.get(p) / tot) * (inv(f) / s));
    }
    return out;
  }
  const viewWeights = list => (elimView() ? elimWeights(chanceWeights(list), list) : chanceWeights(list));
  const ratingFactor = avg => (avg < 5 ? 0.5 : avg < 8 ? 1 : avg < 10 ? 1.25 : 1.5);
  function syncWheel() {
    const list = activeFilms();
    const W = viewWeights(list);
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
      if (!settings.showOut) { toast(`Выбывает: ${f.title}${msg.left > 1 ? `, осталось ${msg.left}` : ''}`); return; }
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
            ${kpBtn(f)}
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
  // Смена режима (колесо, караоке, игра) — с анимированным переходом, если браузер умеет View Transitions.
  let lastMode = null;
  let vtBusy = false;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function render() {
    if (!state) return;
    const mode = state.quiz ? 'quiz' : state.karaoke ? 'karaoke' : 'wheel';
    const prev = lastMode;
    lastMode = mode;
    if (prev && prev !== mode && document.startViewTransition && !reduceMotion) {
      document.documentElement.dataset.vt = prev === 'wheel' ? 'enter' : mode === 'wheel' ? 'exit' : 'swap';
      // плеер YouTube создаём уже после перехода: его загрузка посреди анимации даёт рывки
      vtBusy = true;
      const t = document.startViewTransition(() => renderNow());
      t.finished.finally(() => { delete document.documentElement.dataset.vt; vtBusy = false; syncMusic(); });
      return;
    }
    renderNow();
  }
  // новые фильмы в списке появляются с подскоком; при первой отрисовке — без анимации
  let seenFilms = null;
  function renderNow() {
    if (!state) return;
    $('#roomTitle').textContent = state.name;
    const spinning = Boolean(spinningSid || state.spin);
    const active = activeFilms();
    const W = viewWeights(active);
    const total = active.reduce((s, f) => s + W.get(f.id), 0);
    const amOwner = Boolean(state.owner) && state.owner === myPid();
    const out = new Set(state.eliminated);

    const used = myVotesUsed(), R = rules();
    $('#myVotes').innerHTML = `<span>Ваши голоса</span><span class="dots">${Array.from({ length: R.votes }, (_, i) => `<i class="${i < R.votes - used ? 'on' : ''}"></i>`).join('')}</span><span class="m">${used < R.votes ? `осталось ${R.votes - used}, каждый даёт фильму около ${R.points ?? 4}% колеса` : 'все отданы, голос можно снять'}</span>`;

    const mods = Object.values(state.modifiers || {}).filter(m => m.factor !== 1);
    $('#modBanner').hidden = !mods.length;
    $('#modBanner').className = 'mod-banner mod-list';
    $('#modBanner').innerHTML = mods.map(m => `<div class="mod-row ${m.factor < 1 ? 'down' : 'up'}" title="«${esc(m.title)}» получил среднюю ${String(m.avg).replace('.', ',')}. Действует, пока снова не выпадет фильм этого автора."><b>${fmtFactor(m.factor)}</b><span>фильмам <button class="person" data-person="${esc(m.pid)}" data-name="${esc(m.name)}">${nick(m.pid, m.name)}</button> за «${esc(m.title)}», до выпадения их фильма</span></div>`).join('');
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
      const fresh = seenFilms && !seenFilms.has(f.id);
      return `<div class="film${fresh ? ' fresh' : ''}${out.has(f.id) ? ' out' : ''}${filtered ? ' filtered' : ''}${wheel.curId === f.id ? ' hot' : ''}" data-id="${esc(f.id)}">
        <div class="film-poster" style="${posterStyle(f)}">${f.poster ? '' : initial(f.title)}</div>
        <div class="film-main">
          <div class="film-title">${esc(f.title)}</div>
          <div class="film-meta">${meta.map(esc).join(', ')}</div>
        </div>
        <div class="film-side">
          <span class="film-pct${elimView() ? ' elim' : ''}" title="${elimView() ? 'Шанс вылететь на следующем прокруте' : 'Шанс выпасть'}">${pct}</span>
          <div class="film-actions">
            <button class="vote-btn${mine ? ' on' : ''}${nv ? ' has' : ''}" data-vote-film title="${mine ? 'Снять свой голос' : `Хочу посмотреть: около +${rules().points ?? 4}% колеса этому фильму`}">${ICON.heart}<b>${nv || ''}</b></button>
            ${amOwner ? `<div class="stepper"><button data-w="-1" title="Меньше">${ICON.minus}</button><b>${f.weight}</b><button data-w="1" title="Больше">${ICON.plus}</button></div>` : ''}
          </div>
        </div>
        ${canDelete(f) ? `<button class="film-del" data-del title="Удалить">${ICON.x}</button>` : ''}
      </div>`;
    };
    queueMicrotask(() => { seenFilms = new Set(state.films.map(f => f.id)); });
    $('#filmList').innerHTML = ordered.map(g => {
      const gShare = total ? g.films.reduce((a, f) => a + (W.get(f.id) || 0), 0) / total : 0;
      const ava = avatarOf(g.pid);
      const closed = collapsed.has(g.pid);
      return `<div class="film-group${closed ? ' closed' : ''}">
        <div class="group-head" data-group="${esc(g.pid)}" role="button" tabindex="0" aria-expanded="${!closed}" title="${closed ? 'Развернуть' : 'Свернуть'}">
          <svg class="g-chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>
          <span class="g-person" data-person="${esc(g.pid)}" data-name="${esc(g.name)}" title="Профиль">
            ${ava ? `<img class="${frameCls(g.pid)}" style="${frameVars(g.pid)}" src="${esc(ava)}" alt="">` : `<span class="g-ava${frameCls(g.pid)}" style="background:hsl(${hue(g.name)} 55% 42%);${frameVars(g.pid)}">${initial(g.name)}</span>`}
            <b>${nick(g.pid, g.name)}${g.pid === myPid() ? ' <span class="m">(вы)</span>' : ''}</b>
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
    const locked = Boolean(state.spinLock) && !isRoomOwner();
    btn.disabled = spinning || Boolean(duel) || active.length < 2 || locked;
    btn.classList.toggle('locked', locked && !spinning);
    $('#lockWrap').hidden = !isRoomOwner();
    $('#spinLockOn').checked = Boolean(state.spinLock);
    btn.classList.toggle('busy', spinning && !counting);
    btn.classList.toggle('count', counting);
    $('#spinBtn .hub-label').innerHTML = counting ? String(countdown) : spinning ? 'Крутится'
      : locked ? '<svg class="hub-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
      : settings.mode === 'duel' ? 'Дуэль' : settings.mode === 'elimination' && state.eliminated.length ? 'Дальше' : 'Крутить';
    $('#hubSub').textContent = counting || spinning ? '' : locked ? 'крутит создатель' : active.length < 2 ? 'нужно 2 фильма' : `${active.length} ${plural(active.length, 'фильм', 'фильма', 'фильмов')}`;

    $('#stopBtn').hidden = !counting && !state.series;
    $('#stopBtn').textContent = counting ? 'Отменить прокрут' : 'Остановить серию';
    if (spinning) {
      const by = state.spin?.by || '';
      $('#stageStatus').textContent = counting ? (by ? `${by} запускает колесо` : 'Колесо сейчас запустится')
        : state.series ? `Серия до победителя, осталось ${active.length}` : by ? `Крутит ${by}` : 'Колесо крутится';
    }
    $('#resetBtn').hidden = !state.eliminated.length || spinning;
    const addClosed = (state.addLock && !isRoomOwner()) || state.elimActive;
    $('#addBtn').disabled = spinning || Boolean(duel) || addClosed;
    $('#addBtn').title = state.elimActive ? 'Идёт выбывание: добавлять фильмы можно после него' : state.addLock && !isRoomOwner() ? 'Создатель комнаты закрыл добавление фильмов' : '';
    $('#addLockWrap').hidden = !isRoomOwner();
    $('#addLockOn').checked = Boolean(state.addLock);
    $('#showOutWrap').hidden = settings.mode !== 'elimination';

    $('.stage').classList.toggle('dueling', Boolean(duel));
    $('#duelBox').hidden = !duel;
    if (duel) renderDuel(duel);
    const quiz = state.quiz;
    const karaoke = Boolean(state.karaoke) && !quiz;
    const stageMode = karaoke || Boolean(quiz); // сцена на всю страницу
    $('.stage').classList.toggle('karaoke-on', stageMode);
    document.body.classList.toggle('karaoke-on', stageMode);
    $('#karaokeBox').hidden = !karaoke;
    $('#navKaraoke').hidden = !karaoke;
    $('#quizBox').hidden = !quiz;
    $('#karaokeBtn').classList.toggle('on', Boolean(state.karaoke));
    $('#quizBtn').classList.toggle('on', Boolean(quiz));
    if (karaoke) renderKaraoke();
    if (quiz) renderQuiz(quiz);
    renderFilters(spinning || Boolean(duel));

    if (duel) $('#stageStatus').textContent = '';
    else if (!spinning) {
      $('#stageStatus').textContent = active.length < 2
        ? (state.eliminated.length && active.length === 1 ? 'Остался один фильм. Чтобы начать заново, верните выбывших.'
          : state.films.length ? 'Для прокрута нужно хотя бы два фильма' : '')
        : settings.mode === 'elimination' && state.eliminated.length ? `В колесе осталось ${active.length}`
        : locked ? 'Прокруты закрыты: крутить может только создатель комнаты'
        : settings.mode === 'duel' ? 'Нажмите на центр колеса, чтобы начать дуэль' : 'Нажмите на центр колеса или пробел';
    }
  }

  // ---- общая музыка из YouTube ----
  // Сервер хранит, когда трек был на нуле (startedAt) или на какой секунде пауза (pausedAt).
  // Каждый плеер считает ожидаемую позицию сам и подтягивается, если ушёл больше чем на 2,5 с.
  let yt = null, ytReady = false, ytVid = null, ytDucked = false, ytChanging = false;
  const ytBroken = new Set(); // видео, которые YouTube отказался играть: не пытаемся грузить снова
  let ytReloadAt = 0;
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
    // трек не повторяется: после конца сервер включит следующий или выключит музыку
    return Math.min(pos, d - 0.3);
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
  let ytHostCur = '#ytHost';
  function syncMusic() {
    if (vtBusy) return; // догоним после перехода
    const m = state?.music;
    const hostSel = state?.quiz ? '#qHost' : state?.karaoke ? '#kHost' : '#ytHost';
    if (yt && ytHostCur !== hostSel) { yt.destroy(); yt = null; ytReady = false; ytVid = null; $(ytHostCur).innerHTML = ''; }
    $('#ytCard').hidden = !m;
    $('#ytAdd').hidden = !ytChanging;
    renderQueue();
    $('#musicBtn').hidden = Boolean(m);
    const last = state?.lastTrack;
    $('#ytReplay').hidden = Boolean(m) || !last;
    if (last) $('#ytReplay').title = `Сыграть ещё раз: ${last.title}`;
    if (!m) {
      if (yt) { yt.destroy(); yt = null; ytReady = false; ytVid = null; $(ytHostCur).innerHTML = ''; }
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
        ytHostCur = hostSel;
        $(hostSel).innerHTML = '<div></div>';
        yt = new YT.Player($(hostSel).firstChild, {
          videoId: m.vid,
          playerVars: { autoplay: 1, controls: 0, disablekb: 1, rel: 0, playsinline: 1, iv_load_policy: 3, start: Math.floor(ytExpected(m)) },
          events: {
            onReady: () => { ytReady = true; ytVolume(); syncMusic(); },
            onStateChange: e => {
              // трек доиграл: сообщаем серверу, он включит следующий из очереди или выключит музыку
              if (e.data === 0 && state?.music) api(`/rooms/${roomId}/music/ended`, { method: 'POST', body: { vid: state.music.vid } }).catch(() => {});
              if (e.data === 1 && state?.music) reportDuration(state.music);
              if (e.data === 1) $$('#ytUnmute, #kUnmute, #qUnmute').forEach(el => (el.hidden = true));
            },
            onError: () => {
              const vid = state?.music?.vid;
              if (!vid || ytBroken.has(vid)) return;
              ytBroken.add(vid);
              api(`/rooms/${roomId}/music/failed`, { method: 'POST', body: { vid } }).catch(() => {});
            },
          },
        });
        return;
      }
      if (!ytReady) return;
      if (ytBroken.has(m.vid)) return;
      const playing = yt.getVideoData?.()?.video_id;
      // чужое видео (кликнули по подсказке YouTube) возвращаем не чаще раза в 8 секунд, чтобы не мигало
      if (ytVid !== m.vid || (playing && playing !== m.vid && Date.now() - ytReloadAt > 8000)) {
        ytVid = m.vid; ytReloadAt = Date.now();
        yt.loadVideoById({ videoId: m.vid, startSeconds: ytExpected(m) });
        return;
      }
      reportDuration(m);
      const exp = ytExpected(m), cur = yt.getCurrentTime(), st = yt.getPlayerState();
      if (m.pausedAt != null) {
        if (st === 1 || st === 3) yt.pauseVideo();
        if (Math.abs(cur - exp) > 1) yt.seekTo(exp, true);
        $$('#ytUnmute, #kUnmute, #qUnmute').forEach(el => (el.hidden = true));
      } else {
        const dur = m.duration || yt.getDuration() || 0;
        if (st === 0 && (!dur || exp >= dur - 1.5)) { $$('#ytUnmute, #kUnmute, #qUnmute').forEach(el => (el.hidden = true)); return; } // доиграл, ждём сервер
        if (Math.abs(cur - exp) > 2.5) yt.seekTo(exp, true);
        if (st !== 1 && st !== 3) yt.playVideo();
        // браузер не дал включить звук без клика: просим нажать
        $$('#ytUnmute, #kUnmute, #qUnmute').forEach(el => (el.hidden = st === 1 || st === 3));
      }
    });
  }
  setInterval(() => { if (state?.music) syncMusic(); }, 4000);
  $$('#ytUnmute, #kUnmute, #qUnmute').forEach(el => el.addEventListener('click', () => { Sfx.unlock(); if (ytReady) { yt.playVideo(); ytVolume(); } setTimeout(syncMusic, 600); }));

  // ---- караоке: сцена с большим плеером, очередь певцов, оценки выступлений ----
  function renderKaraoke() {
    const m = state.music;
    const q = state.queue || [];
    const perfs = state.perfs || [];
    $('#kEmpty').hidden = Boolean(m);
    $('#kLabel').textContent = m ? 'Сейчас поёт' : 'Сцена свободна';
    $('#kSinger').innerHTML = m ? nick(m.singerPid || '', m.singer || m.by) : '';
    $('#kSong').textContent = m ? m.title : '';
    $('#kToggle').disabled = $('#kNext').disabled = $('#kRestart').disabled = !m;
    const last = state.lastTrack;
    $('#kAgain').hidden = Boolean(m) || !last;
    if (last && !m) $('#kAgain').innerHTML = `<span class="ka-t">Спеть ещё раз</span><span class="ka-s">${esc(last.singer || last.by)}, ${esc(last.title)}</span>`;
    if (!m) { $('#kProg').style.width = '0'; $('#kTime').textContent = ''; } // прогресс прошлой песни не оставляем
    $('#kToggle').innerHTML = !m || m.pausedAt != null
      ? '<svg viewBox="0 0 24 24"><path d="M7 5v14l12-7z" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>';
    $('#kToggle').title = m?.pausedAt != null ? 'Продолжить у всех' : 'Пауза у всех';
    const nx = q[0];
    $('#kUpNext').innerHTML = nx ? `<span>Далее</span><b>${esc(nx.singer || nx.by)}</b>` : '';
    $('#kUpNext').title = nx ? `Далее: ${nx.singer || nx.by}, ${nx.title}` : '';
    $('#kEq').parentElement.classList.toggle('playing', Boolean(m) && m.pausedAt == null);
    renderLyrics(m);
    $('#kSingerIn').placeholder = `Кто поёт (по умолчанию ${me.name || 'вы'})`;

    const perf = m?.perfId && perfs.find(p => p.perfId === m.perfId);
    if (!perf) $('#kRate').innerHTML = '';
    else {
      const list = Object.values(perf.ratings || {});
      const avg = list.length ? list.reduce((a, r) => a + r.score, 0) / list.length : null;
      const mine = perf.ratings?.[myPid()]?.score || 0;
      const it = perf.items || {};
      const thrown = ['rose', 'tomato', 'egg', 'pie'].filter(k => it[k]).map(k => `<span class="k-items-i">${THROW[k].e} ${it[k]}</span>`).join('');
      $('#kRate').innerHTML = `<span class="label">Оценка выступления ${avg !== null ? `<b>${avg.toFixed(1).replace('.', ',')}</b>` : ''}</span>${thrown ? `<div class="k-items">${thrown}</div>` : ''}
        ${perf.singerPid && perf.singerPid === myPid() ? '<p class="note">Это ваше выступление, оценивают остальные.</p>'
          : `<div class="rate-scale">${Array.from({ length: 10 }, (_, i) => `<button class="${i + 1 === mine ? 'on' : ''} ${i + 1 < 5 ? 'low' : i + 1 < 8 ? 'mid' : 'high'}" data-kscore="${i + 1}">${i + 1}</button>`).join('')}</div>`}`;
    }

    $('#kQueue').innerHTML = `<span class="label">Дальше <span class="m">${q.length || ''}</span></span>` + (q.length
      ? q.map((t, i) => `<div class="q-item">
          <img src="https://i.ytimg.com/vi/${esc(t.vid)}/default.jpg" alt="">
          <div><b>${esc(t.singer || t.by)}</b><span>${esc(t.title)}</span></div>
          ${i ? `<button type="button" class="nav-icon" data-qup="${esc(t.qid)}" title="Следующей"><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>` : ''}
          <button type="button" class="nav-icon" data-qrm="${esc(t.qid)}" title="Убрать"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>`).join('')
      : '<p class="note">Очередь пуста.</p>');

    // звёзды вечера: средний балл певца по оценённым выступлениям
    const by = new Map();
    for (const p of perfs) {
      const sc = Object.values(p.ratings || {}).map(r => r.score);
      if (!sc.length) continue;
      const k = p.singer;
      const e = by.get(k) || { name: k, pid: p.singerPid || '', sum: 0, n: 0, songs: 0 };
      e.sum += sc.reduce((a, b) => a + b, 0) / sc.length; e.n++; e.songs++;
      by.set(k, e);
    }
    const top = [...by.values()].map(e => ({ ...e, avg: e.sum / e.n })).sort((a, b) => b.avg - a.avg).slice(0, 5);
    renderHits();
    $('#kBoard').innerHTML = top.length ? `<span class="label">Звёзды вечера</span>` + top.map((e, i) => `<div class="k-star"><i>${i + 1}</i><b>${nick(e.pid, e.name)}</b><span>${e.songs} ${plural(e.songs, 'песня', 'песни', 'песен')}</span><em>${e.avg.toFixed(1).replace('.', ',')}</em></div>`).join('') : '';
  }
  // ---- летающие сообщения: чат и версии в «Угадай мелодию» ----
  const laneFree = Array(7).fill(0);
  function flyMessage(msg) {
    const layer = $('#reactLayer');
    if (!layer || layer.childElementCount > 60) return;
    const now = performance.now();
    let lane = 0;
    for (let i = 1; i < laneFree.length; i++) if (laneFree[i] < laneFree[lane]) lane = i;
    const el = document.createElement('div');
    el.className = 'fly-msg' + (msg.win ? ' win' : msg.guess ? ' guess' : '') + (msg.close ? ' close' : '') + (msg.pid === myPid() ? ' mine' : '');
    el.style.top = `${6 + lane * 9}%`;
    el.innerHTML = `<span class="fm-n">${nick(msg.pid || '', msg.name || '')}</span><span class="fm-t">${esc(msg.text)}</span>`;
    layer.append(el);
    const dist = layer.clientWidth + el.offsetWidth + 40;
    const dur = Math.min(14, 7 + dist / 260);
    el.style.setProperty('--dist', `${dist}px`);
    el.style.animationDuration = `${dur}s`;
    laneFree[lane] = Math.max(now, laneFree[lane]) + (el.offsetWidth + 60) / dist * dur * 1000;
    el.addEventListener('animationend', () => el.remove());
  }
  function renderChatLog() {
    const list = (state?.chat || []).slice(-50);
    $('#chatLog').innerHTML = list.length
      ? list.map(m => `<div class="cl-item"><b>${nick(m.pid, m.name)}</b><span>${esc(m.text)}</span><time>${new Date(m.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time></div>`).join('')
      : '<p class="note">Сообщений пока нет.</p>';
    $('#chatLog').scrollTop = 1e6;
  }
  $('#chatForm').addEventListener('submit', async e => {
    e.preventDefault();
    const text = $('#chatInput').value.trim();
    if (!text) return;
    $('#chatInput').value = '';
    try { await api(`/rooms/${roomId}/chat`, { method: 'POST', body: { text, cid: me.cid, by: me.name } }); }
    catch (err) { toast(err.message, true); }
  });
  $('#chatLogBtn').addEventListener('click', () => { $('#chatLog').hidden = !$('#chatLog').hidden; if (!$('#chatLog').hidden) renderChatLog(); });
  document.addEventListener('click', e => { if (!$('#chatLog').hidden && !e.target.closest('#reactBar')) $('#chatLog').hidden = true; });

  // ---- «Угадай мелодию» ----
  const qzSettings = { rounds: 10, len: 15 };
  const segPick = (sel, key) => $(sel).addEventListener('click', e => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    qzSettings[key] = Number(b.dataset.v);
    $$(`${sel} button`).forEach(x => x.classList.toggle('on', x === b));
    placeSeg($(sel));
  });
  segPick('#qzRoundsSeg', 'rounds');
  segPick('#qzLenSeg', 'len');
  $('#quizBtn').addEventListener('click', () => {
    if (state?.quiz && state.quiz.state !== 'final') return toast('Игра уже идёт');
    const pool = new Set([...(state?.hits || []).map(h => h.vid), ...(state?.queue || []).map(q => q.vid)]).size;
    $('#qzPool').textContent = pool >= 3
      ? `В игре ${pool} ${plural(pool, 'трек', 'трека', 'треков')}: всё, что играло в комнате (радио и караоке), и то, что стоит в очереди.`
      : 'Нужно хотя бы 3 трека, которые играли в комнате или стоят в очереди. Включите пару песен в общей музыке.';
    $('#qzStart').disabled = pool < 3;
    openModal('#quizModal');
    requestAnimationFrame(() => { placeSeg($('#qzRoundsSeg')); placeSeg($('#qzLenSeg')); });
  });
  $('#qzStart').addEventListener('click', async () => {
    Sfx.unlock();
    try { await api(`/rooms/${roomId}/quiz/start`, { method: 'POST', body: { ...qzSettings, by: me.name } }); closeModal('#quizModal'); }
    catch (e) { toast(e.message, true); }
  });
  $('#qzSkip').addEventListener('click', () => api(`/rooms/${roomId}/quiz/skip`, { method: 'POST' }).catch(e => toast(e.message, true)));
  $('#qzStop').addEventListener('click', () => {
    if (state?.quiz?.state !== 'final' && !confirm('Закончить игру у всех?')) return;
    api(`/rooms/${roomId}/quiz/stop`, { method: 'POST' }).catch(e => toast(e.message, true));
  });
  $('#qzGuess').addEventListener('submit', async e => {
    e.preventDefault();
    const text = $('#qzInput').value.trim();
    if (!text) return;
    $('#qzInput').value = '';
    Sfx.unlock();
    try {
      const r = await api(`/rooms/${roomId}/quiz/guess`, { method: 'POST', body: { text, cid: me.cid, by: me.name } });
      if (r.correct) toast(`Верно! +${r.pts}`);
      else if (r.close) toast('Почти! Попробуйте точнее');
    } catch (err) { toast(err.message, true); }
  });
  $('#qzCover').addEventListener('click', e => {
    if (e.target.closest('[data-qagain]')) { $('#quizBtn').click(); }
    if (e.target.closest('[data-qexit]')) api(`/rooms/${roomId}/quiz/stop`, { method: 'POST' }).catch(() => {});
  });
  function renderQuiz(z) {
    const rd = z.round;
    const final = z.state === 'final', playing = z.state === 'playing', reveal = z.state === 'reveal';
    $('#qzRound').textContent = final ? 'Итоги' : `${rd?.n || 0} из ${z.rounds}`;
    $('#qzSkip').hidden = final;
    $('#qzStop').textContent = final ? 'Выйти' : 'Закончить';
    const mineGuessed = rd?.guessed?.some(g => g.pid === myPid());
    $('#qzInput').disabled = !playing || mineGuessed;
    $('#qzGuess').querySelector('button').disabled = !playing || mineGuessed;
    $('#qzInput').placeholder = mineGuessed ? 'Вы уже угадали, ждём остальных' : 'Название трека или исполнитель';
    const scores = Object.entries(z.scores || {}).sort((a, b) => b[1].pts - a[1].pts);
    $('#qzScores').innerHTML = scores.length
      ? scores.map(([pid, v], i) => `<div class="k-star"><i>${i + 1}</i><b>${nick(pid, v.name)}</b><span></span><em>${v.pts}</em></div>`).join('')
      : '<p class="note">Пока никто не угадал.</p>';
    const cover = $('#qzCover');
    cover.classList.toggle('open', reveal);
    if (final) {
      const w = z.winner && z.scores[z.winner];
      setHTML(cover, `<span class="eq big" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="qz-k">Игра окончена</span><b class="qz-title">${w ? nick(z.winner, w.name) : 'Никто не угадал'}</b>${w ? `<span class="qz-sub">победитель, ${w.pts} ${plural(w.pts, 'очко', 'очка', 'очков')}</span>` : ''}<div class="qz-actions"><button class="btn btn-primary" data-qagain>Ещё игра</button><button class="btn btn-ghost" data-qexit>Выйти</button></div>`);
    } else if (playing) {
      setHTML(cover, `<span class="eq big" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span><span class="qz-k">Что это за трек?</span><b class="qz-title">Угадай мелодию</b>${rd.hint ? `<span class="qz-hint">${esc(rd.hint)}</span>` : '<span class="qz-sub">Подсказка появится ближе к концу раунда</span>'}`);
    } // в момент ответа заглушка не меняется, а плавно уходит (класс open)
    const guessed = rd?.guessed || [];
    setHTML($('#qzStatus'), reveal && rd.reveal
      ? `<span class="qz-ans">Это было: <b>${esc(rd.reveal.title)}</b></span>${rd.reveal.note ? `<em>${esc(rd.reveal.note)}</em>` : ''}${guessed.length ? `<span>Угадали: ${guessed.map(g => `${nick(g.pid, g.name)} +${g.pts}`).join(', ')}</span>` : '<span>Никто не угадал</span>'}`
      : playing && guessed.length ? `<span>Угадали: ${guessed.map(g => `${nick(g.pid, g.name)} +${g.pts}`).join(', ')}</span>` : '');
  }
  (function quizFrame() {
    requestAnimationFrame(quizFrame);
    const z = state?.quiz;
    if (!z || z.state !== 'playing' || !z.round) { if (z) { $('#qzBar').style.width = z.state === 'reveal' ? '0' : '0'; $('#qzSecs').textContent = ''; } return; }
    const now = Date.now() + serverOffset;
    const total = z.round.endsAt - z.round.startsAt;
    const left = Math.max(0, z.round.endsAt - now);
    $('#qzBar').style.width = `${left / total * 100}%`;
    $('#qzSecs').textContent = `${Math.ceil(left / 1000)} с`;
  })();

  // ---- броски: летят по дуге в точку на сцене и шлёпаются ----
  const THROW = {
    tomato: { e: '🍅', main: '#D7261E', dark: '#8E1210', spots: '#F4C542', drips: true },
    egg: { e: '🥚', main: '#F6F1E2', dark: '#E2D9BF', yolk: '#FFB21C', drips: true },
    pie: { e: '🥧', main: '#FFF3DC', dark: '#E9D2A6', spots: '#B8742E', drips: true },
    rose: { e: '🌹', main: '#E11D48', dark: '#9F1239', petals: true },
  };
  let armed = null;
  function armThrow(item) {
    armed = armed === item ? null : item;
    $$('#reactBar [data-throw]').forEach(b => b.classList.toggle('armed', b.dataset.throw === armed));
    $('#throwLayer').hidden = !armed;
    if (armed) $('#throwLayer').dataset.item = THROW[armed].e;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && armed) armThrow(armed); });
  $('#reactBar').addEventListener('click', e => {
    const b = e.target.closest('[data-throw]');
    if (!b) return;
    Sfx.unlock();
    armThrow(b.dataset.throw);
  });
  // лимит проверяем сами: при перезарядке кнопка дёргается, а не сыплются уведомления
  const throwTimes = [];
  function canThrow() {
    const now = Date.now();
    while (throwTimes.length && now - throwTimes[0] > 3000) throwTimes.shift();
    if (throwTimes.length >= 5) {
      const b = $(`#reactBar [data-throw="${armed}"]`);
      b?.classList.remove('cooldown'); void b?.offsetWidth; b?.classList.add('cooldown');
      return false;
    }
    throwTimes.push(now);
    return true;
  }
  $('#throwLayer').addEventListener('click', e => {
    if (!armed || !canThrow()) return;
    const st = $('.layout > .stage').getBoundingClientRect();
    const x = (e.clientX - st.left) / st.width, y = (e.clientY - st.top) / st.height;
    // попадание в видео караоке засчитывается певцу
    const kv = $('#karaokeBox:not([hidden]) .k-video')?.getBoundingClientRect();
    const onStage = Boolean(kv && e.clientX >= kv.left && e.clientX <= kv.right && e.clientY >= kv.top && e.clientY <= kv.bottom);
    api(`/rooms/${roomId}/throw`, { method: 'POST', body: { item: armed, x, y, onStage, cid: me.cid, by: me.name } }).catch(() => {});
  });
  $('#throwLayer').addEventListener('mousemove', e => {
    const l = $('#throwLayer');
    l.style.setProperty('--cx', `${e.offsetX}px`);
    l.style.setProperty('--cy', `${e.offsetY}px`);
  });

  // детерминированный «случай» по seed с сервера: у всех одинаковые брызги
  function rng(seed) { let s = seed || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
  function splatSVG(item, seed) {
    const T = THROW[item], R = rng(seed);
    let out = '';
    if (T.petals) {
      for (let i = 0; i < 14; i++) {
        const a = R() * 6.283, d = 10 + R() * 60, w = 6 + R() * 7;
        out += `<ellipse cx="${(Math.cos(a) * d).toFixed(1)}" cy="${(Math.sin(a) * d).toFixed(1)}" rx="${w.toFixed(1)}" ry="${(w * .6).toFixed(1)}" fill="${i % 3 ? T.main : T.dark}" transform="rotate(${Math.round(R() * 180)} ${(Math.cos(a) * d).toFixed(1)} ${(Math.sin(a) * d).toFixed(1)})" opacity=".95"/>`;
      }
      return `<svg viewBox="-90 -90 180 180">${out}</svg>`;
    }
    // основное пятно — неровный многоугольник с капельками по краю
    const pts = [];
    for (let i = 0; i < 18; i++) { const a = i / 18 * 6.283, r = 26 + R() * 18; pts.push(`${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`); }
    out += `<polygon points="${pts.join(' ')}" fill="${T.main}" stroke="${T.dark}" stroke-width="2" stroke-linejoin="round"/>`;
    for (let i = 0; i < 12; i++) {
      const a = R() * 6.283, d = 40 + R() * 38, r = 2 + R() * 6;
      out += `<circle cx="${(Math.cos(a) * d).toFixed(1)}" cy="${(Math.sin(a) * d).toFixed(1)}" r="${r.toFixed(1)}" fill="${T.main}"/>`;
    }
    if (T.yolk) out += `<circle cx="${(R() * 8 - 4).toFixed(1)}" cy="${(R() * 8 - 4).toFixed(1)}" r="13" fill="${T.yolk}"/><circle cx="-4" cy="-5" r="4" fill="#fff" opacity=".55"/>`;
    if (T.spots) for (let i = 0; i < 7; i++) out += `<ellipse cx="${(R() * 40 - 20).toFixed(1)}" cy="${(R() * 40 - 20).toFixed(1)}" rx="${(1.5 + R() * 2).toFixed(1)}" ry="${(1 + R() * 1.5).toFixed(1)}" fill="${T.spots}" opacity=".9"/>`;
    // потёки вниз
    let drips = '';
    if (T.drips) for (let i = 0; i < 3; i++) {
      const x = (R() * 50 - 25).toFixed(1), w = (4 + R() * 5).toFixed(1);
      drips += `<rect class="drip" x="${x}" y="10" width="${w}" height="${(30 + R() * 40).toFixed(1)}" rx="${(w / 2).toFixed(1)}" fill="${T.main}" style="animation-delay:${(0.4 + R() * 0.8).toFixed(2)}s"/>`;
    }
    return `<svg viewBox="-90 -90 180 180">${drips}${out}</svg>`;
  }
  function throwItem(msg) {
    const layer = $('#reactLayer');
    const T = THROW[msg.item];
    if (!layer || !T) return;
    // на экране не больше 24 клякс: старые убираем
    const old = layer.querySelectorAll('.splat');
    for (let i = 0; i < old.length - 23; i++) old[i].remove();
    const W = layer.clientWidth, H = layer.clientHeight;
    const tx = msg.x * W, ty = msg.y * H;
    // летит снизу, со стороны, зависящей от того, кто бросил
    const sx = (hue(msg.name || '') % 2 ? 0.15 : 0.85) * W, sy = H + 60;
    const p = document.createElement('div');
    p.className = 'projectile';
    p.textContent = T.e;
    layer.append(p);
    const peak = Math.min(sy, ty) - 120;
    const anim = p.animate([
      { transform: `translate(${sx}px, ${sy}px) translate(-50%, -50%) rotate(0deg) scale(.7)` },
      { transform: `translate(${(sx + tx) / 2}px, ${peak}px) translate(-50%, -50%) rotate(${msg.item === 'rose' ? 200 : 360}deg) scale(1.1)`, offset: 0.55 },
      { transform: `translate(${tx}px, ${ty}px) translate(-50%, -50%) rotate(${msg.item === 'rose' ? 320 : 620}deg) scale(1.6)` },
    ], { duration: 620, easing: 'cubic-bezier(.3,.1,.5,1)', fill: 'forwards' });
    anim.onfinish = () => {
      p.remove();
      if (settings.sound) Sfx.splat(msg.item);
      const s = document.createElement('div');
      s.className = `splat splat-${msg.item}`;
      s.style.left = `${tx}px`; s.style.top = `${ty}px`;
      s.style.setProperty('--rot', `${(msg.seed % 360)}deg`);
      s.innerHTML = splatSVG(msg.item, msg.seed + 1) + `<span class="splat-n">${nick(msg.pid || '', msg.name || '')}</span>`;
      layer.append(s);
      setTimeout(() => s.remove(), 6000);
    };
  }

  // ---- реакции: всплывают у всех над сценой ----
  const RX = { clap: '👏', fire: '🔥', laugh: '😂', love: '😍', wow: '😮', skull: '💀', party: '🎉' };
  function crowFly(pid, name) {
    const layer = $('#reactLayer');
    if (!layer) return;
    const W = layer.clientWidth, H = layer.clientHeight;
    const ltr = Math.random() < 0.5;
    const y0 = H * (0.12 + Math.random() * 0.3);
    const el = document.createElement('div');
    el.className = 'crow-fly' + (ltr ? '' : ' rtl');
    el.innerHTML = `<div class="crow-bird"><svg viewBox="0 0 80 48"><path class="cw-wing back" d="M34 22c-2-9-9-17-19-20 4 7 6 15 9 21z"/><path d="M8 26c7-2 14 0 19 3l10-2c7-1 13 0 18-3l9-6-5 7 11 1-12 4c-5 5-14 8-22 7l-7 7h-5l4-7c-8-1-14-4-20-11z"/><circle cx="62" cy="21" r="1.7" fill="#fff"/><path class="cw-wing" d="M30 24c3-11 12-19 24-22-4 8-9 15-15 23z"/></svg></div><span class="crow-say">КАР!</span><span class="crow-n">${nick(pid || '', name || '')}</span>`;
    layer.append(el);
    const x0 = ltr ? -120 : W + 120, x1 = ltr ? W + 120 : -120;
    el.animate([
      { transform: `translate(${x0}px, ${y0}px)` },
      { transform: `translate(${x0 + (x1 - x0) * 0.25}px, ${y0 - 40}px)` },
      { transform: `translate(${x0 + (x1 - x0) * 0.5}px, ${y0 + 10}px)` },
      { transform: `translate(${x0 + (x1 - x0) * 0.75}px, ${y0 - 30}px)` },
      { transform: `translate(${x1}px, ${y0 - 10}px)` },
    ], { duration: 3400, easing: 'linear', fill: 'forwards' }).onfinish = () => el.remove();
    if (settings.sound) setTimeout(() => Sfx.caw(), 700);
    // перо падает с середины пути
    setTimeout(() => {
      const f = document.createElement('div');
      f.className = 'crow-feather';
      f.style.left = `${W * (0.35 + Math.random() * 0.3)}px`;
      f.style.top = `${y0 + 20}px`;
      layer.append(f);
      f.addEventListener('animationend', () => f.remove());
    }, 1500);
  }
  function spawnReaction(kind, pid, name) {
    if (kind === 'crow') return crowFly(pid, name);
    const layer = $('#reactLayer');
    if (!layer || !RX[kind] || layer.childElementCount > 40) return;
    const el = document.createElement('div');
    el.className = 'rx';
    el.style.left = `${8 + Math.random() * 84}%`;
    el.style.setProperty('--dx', `${Math.round(Math.random() * 90 - 45)}px`);
    el.style.setProperty('--rot', `${Math.round(Math.random() * 36 - 18)}deg`);
    el.style.animationDuration = `${(2.4 + Math.random() * 0.9).toFixed(2)}s`;
    el.innerHTML = `<span class="rx-e">${RX[kind]}</span><span class="rx-n">${nick(pid || '', name || '')}</span>`;
    layer.append(el);
    el.addEventListener('animationend', () => el.remove());
  }
  const rxTimes = [];
  $('#reactBar').addEventListener('click', e => {
    const b = e.target.closest('[data-rx]');
    if (!b) return;
    b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
    const now = Date.now();
    while (rxTimes.length && now - rxTimes[0] > 2500) rxTimes.shift();
    if (rxTimes.length >= 10) { b.classList.remove('cooldown'); void b.offsetWidth; b.classList.add('cooldown'); return; }
    rxTimes.push(now);
    api(`/rooms/${roomId}/react`, { method: 'POST', body: { kind: b.dataset.rx, cid: me.cid, by: me.name } }).catch(() => {});
  });

  // ---- «Наши хиты»: всё, что играло в комнате ----
  let kTab = ls.get('kTab', 'queue');
  function setKTab(tab) {
    kTab = tab; ls.set('kTab', tab);
    $$('#kTabs button').forEach(b => b.classList.toggle('on', b.dataset.ktab === tab));
    $('#kQueue').hidden = tab !== 'queue';
    $('#kHits').hidden = tab !== 'hits';
    $('#kBoard').hidden = tab !== 'stars';
    requestAnimationFrame(() => placeSeg($('#kTabs')));
  }
  $('#kTabs').addEventListener('click', e => { const b = e.target.closest('[data-ktab]'); if (b) setKTab(b.dataset.ktab); });
  setKTab(kTab);
  function renderHits() {
    const q = $('#kHitsQ').value.trim().toLowerCase();
    const perfs = state.perfs || [];
    const best = vid => {
      const sc = perfs.filter(p => p.vid === vid).map(p => Object.values(p.ratings || {}).map(r => r.score)).filter(a => a.length).map(a => a.reduce((s, v) => s + v, 0) / a.length);
      return sc.length ? Math.max(...sc) : null;
    };
    const list = (state.hits || [])
      .filter(h => !q || h.title.toLowerCase().includes(q) || (h.singers || []).join(' ').toLowerCase().includes(q))
      .sort((a, b) => b.plays - a.plays || (b.lastAt || 0) - (a.lastAt || 0));
    $('#kHitsList').innerHTML = list.length ? list.map(h => {
      const bs = best(h.vid);
      return `<div class="q-item hit">
        <img src="https://i.ytimg.com/vi/${esc(h.vid)}/default.jpg" alt="">
        <div><b title="${esc(h.title)}">${esc(h.title)}</b><span>${h.plays} ${plural(h.plays, 'раз', 'раза', 'раз')}${bs !== null ? `, лучший балл ${bs.toFixed(1).replace('.', ',')}` : ''}${h.singers?.length ? `, ${esc(h.singers.join(', '))}` : ''}</span></div>
        <button type="button" class="nav-icon" data-hadd="${esc(h.vid)}" title="В очередь, поёте вы"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
        ${isRoomOwner() ? `<button type="button" class="nav-icon" data-hrm="${esc(h.vid)}" title="Убрать из хитов"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` : ''}
      </div>`;
    }).join('') : `<p class="note">${q ? 'Ничего не нашлось.' : 'Здесь соберутся все песни, которые играли в комнате.'}</p>`;
  }
  $('#kHitsQ').addEventListener('input', renderHits);
  $('#kHitsList').addEventListener('click', async e => {
    const add = e.target.closest('[data-hadd]'), rm = e.target.closest('[data-hrm]');
    try {
      if (add) {
        const r = await api(`/rooms/${roomId}/music`, { method: 'POST', body: { url: add.dataset.hadd, by: me.name, cid: me.cid } });
        Sfx.unlock();
        toast(r.queued ? 'Песня в очереди' : 'Поехали!');
      }
      if (rm) await api(`/rooms/${roomId}/music/hits/remove`, { method: 'POST', body: { vid: rm.dataset.hrm, cid: me.cid } });
    } catch (err) { toast(err.message, true); }
  });

  // ---- текст песни: строки по таймингам, текущая заливается по мере пения ----
  let lyrKey = '', lyrIdx = -1, lyrLines = null, lyrSearching = false;
  function renderLyrics(m) {
    const L = m?.lyrics;
    const box = $('#kLyrics');
    const key = !m ? 'none' : !L || L.loading ? 'loading:' + m.vid : L.none ? 'nf:' + m.vid : `${m.vid}:${L.id}:${lyrSearching}`;
    // смещение меняется без перерисовки строк
    if (L?.synced && $('#kOffset')) $('#kOffset').textContent = `${L.offset > 0 ? '+' : ''}${String(L.offset || 0).replace('.', ',')} с`;
    if (key === lyrKey) return;
    lyrKey = key; lyrIdx = -2; lyrLines = null;
    if (!m) { box.innerHTML = '<p class="k-lyr-note k-lyr-idle">Здесь появится текст песни</p>'; return; }
    const head = L && !L.loading && !L.none ? `<div class="k-lyr-head">
        <span>${esc(L.artist)}${L.artist && L.track ? ', ' : ''}${esc(L.track)}${L.synced ? '' : ' <em>без таймингов</em>'}</span>
        ${L.synced ? `<span class="k-offset" title="Сдвиг текста относительно видео, общий для всей комнаты"><button type="button" class="nav-icon wide" data-loff="-5" title="Текст раньше на 5 с">−5</button><button type="button" class="nav-icon" data-loff="-0.5" title="Текст раньше на 0,5 с">−</button><b id="kOffset">${L.offset > 0 ? '+' : ''}${String(L.offset || 0).replace('.', ',')} с</b><button type="button" class="nav-icon" data-loff="0.5" title="Текст позже на 0,5 с">+</button><button type="button" class="nav-icon wide" data-loff="5" title="Текст позже на 5 с">+5</button></span>` : ''}
        <button type="button" class="link-btn" data-lfind>Не тот текст</button>
      </div>` : '';
    const search = `<form class="k-lyr-search" id="kLyrSearch"><input placeholder="Исполнитель и название" value="${esc(L?.none ? L.q : (L?.artist ? L.artist + ' ' : '') + (L?.track || ''))}"><button class="btn btn-ghost" type="submit">Найти текст</button></form><div class="k-lyr-results" id="kLyrResults"></div>`;
    if (lyrSearching || L?.none) {
      box.innerHTML = head + (L?.none && !lyrSearching ? '<p class="k-lyr-note">Текст не нашёлся автоматически. Уточните название:</p>' : '') + search;
    } else if (!L || L.loading) {
      box.innerHTML = '<p class="k-lyr-note">Ищем текст…</p>';
    } else if (L.synced?.length) {
      box.innerHTML = head + `<div class="k-lyr-view"><span class="k-intro" id="kIntro" hidden></span><div class="k-lines" id="kLines">${L.synced.map((l, i) => `<p data-i="${i}">${esc(l.text) || '<span class="k-dots">• • •</span>'}</p>`).join('')}</div></div>`;
      lyrLines = L.synced;
    } else {
      box.innerHTML = head + `<div class="k-lyr-plain">${esc(L.plain).replace(/\n/g, '<br>')}</div>`;
    }
  }
  function karaokeTime(m) {
    return ytReady && ytVid === m.vid && yt.getVideoData?.()?.video_id === m.vid ? yt.getCurrentTime() : ytExpected(m);
  }
  const fmtT = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  (function karaokeFrame() {
    requestAnimationFrame(karaokeFrame);
    const m = state?.music;
    if (!state?.karaoke || !m) return;
    const t = karaokeTime(m);
    const d = m.duration || (ytReady ? yt.getDuration() : 0);
    $('#kProg').style.width = d ? `${Math.min(100, t / d * 100)}%` : '0';
    $('#kTime').textContent = d ? `${fmtT(t)} / ${fmtT(d)}` : fmtT(t);
    if (!lyrLines) return;
    const lt = t + (m.lyrics?.offset || 0);
    let i = -1;
    for (let k = 0; k < lyrLines.length && lyrLines[k].t <= lt; k++) i = k;
    const view = $('.k-lyr-view'), lines = $('#kLines');
    if (!view || !lines) return;
    const intro = $('#kIntro');
    if (intro) {
      intro.hidden = i >= 0;
      if (i < 0) intro.textContent = `Вступление, ещё ${Math.max(0, Math.ceil(lyrLines[0].t - lt))} с`;
    }
    if (i !== lyrIdx) {
      const first = lyrIdx === -2; // первый кадр: ставим на место без анимации
      lines.querySelectorAll('p.on, p.past, p.next').forEach(p => p.classList.remove('on', 'past', 'next'));
      const p = lines.children[Math.max(0, i)];
      if (i >= 0) {
        p.classList.add('on');
        for (let k = Math.max(0, i - 3); k < i; k++) lines.children[k].classList.add('past');
      }
      lines.children[i + 1]?.classList.add('next');
      if (first) lines.classList.add('instant');
      lines.style.transform = `translateY(${view.clientHeight / 2 - p.offsetTop - p.offsetHeight / 2}px)`;
      if (first) requestAnimationFrame(() => lines.classList.remove('instant'));
      lyrIdx = i;
    }
    if (i >= 0) {
      const a = lyrLines[i].t, b = lyrLines[i + 1]?.t ?? a + 4;
      lines.children[i].style.setProperty('--p', Math.max(0, Math.min(1, (lt - a) / Math.max(0.3, b - a))).toFixed(3));
    }
  })();
  $('#kLyrics').addEventListener('click', async e => {
    const off = e.target.closest('[data-loff]');
    if (off) return api(`/rooms/${roomId}/music/lyrics/offset`, { method: 'POST', body: { delta: Number(off.dataset.loff) } }).catch(err => toast(err.message, true));
    if (e.target.closest('[data-lfind]')) { lyrSearching = !lyrSearching; lyrKey = ''; renderLyrics(state.music); return; }
    const pick = e.target.closest('[data-lid]');
    if (pick) {
      try { await api(`/rooms/${roomId}/music/lyrics/set`, { method: 'POST', body: { id: Number(pick.dataset.lid) } }); lyrSearching = false; lyrKey = ''; }
      catch (err) { toast(err.message, true); }
    }
  });
  $('#kLyrics').addEventListener('submit', async e => {
    e.preventDefault();
    const q = e.target.querySelector('input').value.trim();
    const out = $('#kLyrResults');
    out.innerHTML = '<p class="k-lyr-note">Ищем…</p>';
    try {
      const { results } = await api(`/rooms/${roomId}/music/lyrics/search`, { method: 'POST', body: { q } });
      out.innerHTML = results.length ? results.map(x => `<button type="button" class="k-lyr-item" data-lid="${x.id}"><b>${esc(x.track)}</b><span>${esc(x.artist)}, ${fmtT(x.duration)}${x.synced ? '' : ', без таймингов'}</span></button>`).join('') : '<p class="k-lyr-note">Ничего не нашлось.</p>';
    } catch (err) { out.innerHTML = ''; toast(err.message, true); }
  });

  $('#kRate').addEventListener('click', async e => {
    const b = e.target.closest('[data-kscore]');
    if (!b) return;
    const perfId = state.music?.perfId;
    const score = b.classList.contains('on') ? 0 : Number(b.dataset.kscore);
    try { await api(`/rooms/${roomId}/karaoke/rate`, { method: 'POST', body: { perfId, score, cid: me.cid, by: me.name } }); }
    catch (err) { toast(err.message, true); }
  });
  $('#kQueue').addEventListener('click', e => {
    const up = e.target.closest('[data-qup]'), rm = e.target.closest('[data-qrm]');
    if (up) api(`/rooms/${roomId}/music/up`, { method: 'POST', body: { qid: up.dataset.qup } }).catch(err => toast(err.message, true));
    if (rm) api(`/rooms/${roomId}/music/remove`, { method: 'POST', body: { qid: rm.dataset.qrm } }).catch(err => toast(err.message, true));
  });
  $('#kAdd').addEventListener('submit', async e => {
    e.preventDefault();
    const url = $('#kUrl').value.trim();
    if (!url) return;
    if (!/youtu\.?be|^[\w-]{11}$/.test(url)) { openKaraokeSearch(); return; } // не ссылка — ищем на YouTube
    try {
      const r = await api(`/rooms/${roomId}/music`, { method: 'POST', body: { url, singer: $('#kSingerIn').value.trim(), by: me.name, cid: me.cid } });
      $('#kUrl').value = ''; $('#kSingerIn').value = '';
      Sfx.unlock();
      toast(r.queued ? 'Песня в очереди' : 'Поехали!');
    } catch (err) { toast(err.message, true); }
  });
  function openKaraokeSearch() {
    const q = $('#kUrl').value.trim();
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent((q && !/youtu/.test(q) ? q + ' ' : '') + 'караоке')}`, '_blank', 'noopener');
  }
  $('#kFind').addEventListener('click', openKaraokeSearch);
  $('#kToggle').addEventListener('click', () => api(`/rooms/${roomId}/music/toggle`, { method: 'POST', body: { by: me.name } }).catch(e => toast(e.message, true)));
  $('#kNext').addEventListener('click', () => api(`/rooms/${roomId}/music/next`, { method: 'POST', body: { by: me.name } }).catch(e => toast(e.message, true)));
  const setKaraoke = on => api(`/rooms/${roomId}`, { method: 'PATCH', body: { karaoke: on } }).catch(e => toast(e.message, true));
  $('#kExit').addEventListener('click', () => setKaraoke(false));
  $('#karaokeBtn').addEventListener('click', () => { Sfx.unlock(); setKaraoke(!state?.karaoke); });
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
  const restartMusic = () => { Sfx.unlock(); api(`/rooms/${roomId}/music/restart`, { method: 'POST', body: { by: me.name } }).catch(e => toast(e.message, true)); };
  ['#ytRestart', '#kRestart', '#ytReplay', '#kAgain'].forEach(sel => $(sel).addEventListener('click', restartMusic));
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
  function setYtVol(v) {
    for (const el of [$('#ytVol'), $('#kVol'), $('#qVol')]) { el.value = v; el.style.setProperty('--f', v / 100); }
    ls.set('ytVol', v);
    ytVolume();
  }
  $('#ytVol').addEventListener('input', e => setYtVol(Number(e.target.value)));
  $('#kVol').addEventListener('input', e => setYtVol(Number(e.target.value)));
  setYtVol(ls.get('ytVol', 50));

  // ---- оценка последнего выбранного фильма ----
  function renderRate() {
    const h = state.history[0];
    const box = $('#rateBox');
    if (!h) { box.hidden = true; return; }
    box.hidden = false;
    const author = personOf(h.film);
    const isAuthor = author === myPid();
    const mine = h.ratings?.[myPid()]?.score || 0;
    const list = Object.entries(h.ratings || {}).filter(([pid]) => pid !== author);
    const who = `<button class="person" data-person="${esc(author)}" data-name="${esc(h.film.addedBy || '')}">${esc(h.film.addedBy || 'автора')}</button>`;
    const a = avgRating(h);
    const fct = a === null ? null : ratingFactor(a);
    const effect = !h.src ? `Бонус ${who} уже задаёт его более новый фильм.`
      : a === null ? `Средняя оценка даст фильмам ${who} бонус или штраф, который продержится, пока снова не выпадет его фильм.`
      : fct === 1 ? `Средняя ${a.toFixed(1).replace('.', ',')}: шанс фильмов ${who} не меняется.`
      : `Средняя ${a.toFixed(1).replace('.', ',')}: фильмы ${who} получают ${fmtFactor(fct)}, пока снова не выпадет его фильм.`;
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
  // ---- бейджи: зарабатываются сами по данным комнаты ----
  const BADGES = [
    { id: 'critic', name: 'Кинокритик', need: 'оценить 5 фильмов', icon: '<path d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.4 6.8 19.2l1-5.9L3.5 9.2l5.9-.8z"/>', test: x => x.ratedGiven >= 5, prog: x => `${Math.min(5, x.ratedGiven)}/5` },
    { id: 'hitmaker', name: 'Хитмейкер', need: 'чтобы его фильмы выбрали 3 раза', icon: '<path d="M4 7h16v12H4z"/><path d="M8 3l4 4 4-4"/>', test: x => x.wins >= 3, prog: x => `${Math.min(3, x.wins)}/3` },
    { id: 'taste', name: 'Тонкий вкус', need: 'средняя оценка его фильмов от 8 (минимум 2 фильма)', icon: '<path d="M8 3h8l-1 7a3 3 0 0 1-6 0zM12 13v6M8 21h8"/>', test: x => x.avgOfHis >= 8 && x.ratedN >= 2, prog: x => (x.avgOfHis ? x.avgOfHis.toFixed(1).replace('.', ',') : '—') },
    { id: 'collector', name: 'Коллекционер', need: 'добавить 20 фильмов', icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>', test: x => x.added >= 20, prog: x => `${Math.min(20, x.added)}/20` },
    { id: 'singer', name: 'Меломан', need: 'спеть 5 песен', icon: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>', test: x => x.perfs >= 5, prog: x => `${Math.min(5, x.perfs)}/5` },
    { id: 'star', name: 'Звезда сцены', need: 'средний балл выступлений от 8 (минимум 2)', icon: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7"/>', test: x => x.perfAvg >= 8 && x.perfRated >= 2, prog: x => (x.perfAvg ? x.perfAvg.toFixed(1).replace('.', ',') : '—') },
    { id: 'quiz', name: 'Знаток', need: 'выиграть «Угадай мелодию»', icon: '<path d="M9 18V5l11-2v8"/><circle cx="6" cy="18" r="3"/><path d="M14 17l2 2 4-4"/>', test: x => x.quizWins >= 1, prog: x => `${x.quizWins}/1` },
    { id: 'soul', name: 'Душа компании', need: 'отправить 50 реакций', icon: '<path d="M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3Z"/>', test: x => x.reacts >= 50, prog: x => `${Math.min(50, x.reacts)}/50` },
  ];

  const PROFILE_COLORS = ['', '#FF5A6E', '#FF9F45', '#FFD54A', '#3DDC97', '#38BDF8', '#7C6BFF', '#C084FC', '#F472B6', 'grad:sunset', 'grad:neon', 'grad:gold', 'grad:ice', 'grad:rainbow'];
  const PROFILE_EFFECTS = [['none', 'Без эффекта'], ['glow', 'Свечение'], ['shimmer', 'Перелив'], ['pulse', 'Пульс'], ['glitch', 'Глитч'], ['wave', 'Волна'], ['flicker', 'Неон'], ['rainbow', 'Радуга']];
  const PROFILE_FONTS = [['default', 'Обычный'], ['unbounded', 'Unbounded'], ['pixel', 'Пиксель'], ['pacifico', 'Pacifico'], ['russo', 'Russo']];
  const PROFILE_ICONS = ['', '👑', '🔥', '⭐', '🎤', '🎬', '💀', '👾', '🐸', '🌙', '⚡', '🍿', '🦄', '🎧'];
  const PROFILE_FRAMES = [['none', 'Без рамки'], ['accent', 'Акцент'], ['neon', 'Неон'], ['gold', 'Золото'], ['rainbow', 'Радуга'], ['fire', 'Огонь'], ['ice', 'Лёд'], ['toxic', 'Токсик'], ['holo', 'Голограмма']];
  const PROFILE_BANNERS = [['none', 'Без фона'], ['aurora', 'Сияние'], ['sunset', 'Закат'], ['ocean', 'Океан'], ['ember', 'Угли'], ['night', 'Ночь'], ['live', 'Живое сияние'], ['stars', 'Звёзды']];
  let profDraft = null, profEditing = false;

  function openProfile(pid, name) {
    if (!state) return;
    profEditing = false;
    profDraft = { ...{ color: '', effect: 'none', frame: 'none', banner: 'none', font: 'default', icon: '', badge: '', status: '' }, ...prof(pid) };
    renderProfile(pid, name);
    openModal('#profileModal');
  }

  function renderProfile(pid, name) {
    const mine = pid === myPid();
    const p = mine && profEditing ? profDraft : prof(pid);
    const online = people.find(x => x.pid === pid);
    const avatar = online?.avatar || state.films.flatMap(f => f.votes || []).find(v => v.id === pid && v.avatar)?.avatar || (account.user && mine ? account.user.avatar : '');
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
    const modNow = state.modifiers?.[pid]?.factor && state.modifiers[pid].factor !== 1 ? state.modifiers[pid] : null;
    const myPerfs = (state.perfs || []).filter(x => (x.singerPid ? x.singerPid === pid : x.singer === name));
    const perfScores = myPerfs.map(x => Object.values(x.ratings || {}).map(r => r.score)).filter(a => a.length).map(a => a.reduce((s, v) => s + v, 0) / a.length);
    const stats = {
      ratedGiven: state.history.filter(h => h.ratings?.[pid]).length, wins: wins.length, avgOfHis, ratedN: rated.length,
      added: added.length, perfs: myPerfs.length, perfRated: perfScores.length,
      perfAvg: perfScores.length ? perfScores.reduce((a, b) => a + b, 0) / perfScores.length : 0, reacts: state.reacts?.[pid] || 0, quizWins: state.quizWins?.[pid] || 0,
    };
    const earned = BADGES.filter(b => b.test(stats));
    const locked = BADGES.filter(b => !b.test(stats));
    const badge = (b, on) => `<span class="badge${on ? ' on' : ''}" title="${on ? b.name : `Ещё не получен: нужно ${b.need}. Сейчас ${b.prog(stats)}`}"><svg viewBox="0 0 24 24">${b.icon}</svg><b>${b.name}</b>${on ? '' : `<em>${b.prog(stats)}</em>`}</span>`;
    const row = list => `<div class="poster-row">${list.slice(0, 8).map(f => `<i title="${esc(f.title)}" style="${posterStyle(f)}">${f.poster ? '' : initial(f.title)}</i>`).join('')}${list.length > 8 ? `<span>+${list.length - 8}</span>` : ''}</div>`;
    const sec = (title, list) => (list.length ? `<div class="profile-sec"><h3>${title}</h3>${row(list)}</div>` : '');
    const card = $('#profileModal .profile-card');
    card.className = 'modal-card profile-card' + (p.banner && p.banner !== 'none' ? ` bn-${p.banner}` : '');

    const editor = mine && profEditing ? `
      <div class="pe">
        <div class="pe-row"><span class="label">Цвет ника</span><div class="pe-swatches">${PROFILE_COLORS.map(c => `<button type="button" class="sw${(p.color || '') === c ? ' on' : ''}" data-pc="${c}" title="${c ? (c.startsWith('grad:') ? 'Градиент' : c) : 'Обычный'}" style="background:${c ? (c.startsWith('grad:') ? GRADS[c.slice(5)][0] : c) : 'var(--s3)'}">${c ? '' : '×'}</button>`).join('')}</div></div>
        <div class="pe-row"><span class="label">Эффект ника</span><div class="chips">${PROFILE_EFFECTS.map(([k, t]) => `<button type="button" class="chip${p.effect === k ? ' on' : ''}" data-pe="${k}">${t}</button>`).join('')}</div></div>
        <div class="pe-row"><span class="label">Рамка аватара</span><div class="chips">${PROFILE_FRAMES.map(([k, t]) => `<button type="button" class="chip${p.frame === k ? ' on' : ''}" data-pf="${k}">${t}</button>`).join('')}</div></div>
        <div class="pe-row"><span class="label">Шрифт ника</span><div class="chips">${PROFILE_FONTS.map(([k, t]) => `<button type="button" class="chip nf-prev nf-${k}${(p.font || 'default') === k ? ' on' : ''}" data-pn="${k}">${t}</button>`).join('')}</div></div>
        <div class="pe-row"><span class="label">Значок у ника</span><div class="pe-swatches">${PROFILE_ICONS.map(ic => `<button type="button" class="sw ico${(p.icon || '') === ic ? ' on' : ''}" data-pi="${ic}">${ic || '×'}</button>`).join('')}</div></div>
        <div class="pe-row"><span class="label">Бейдж у ника <span class="m">из полученных в этой комнате</span></span><div class="chips"><button type="button" class="chip${!p.badge ? ' on' : ''}" data-pbadge="">Не показывать</button>${earned.map(b => `<button type="button" class="chip${p.badge === b.id ? ' on' : ''}" data-pbadge="${b.id}">${b.name}</button>`).join('') || '<span class="note">Пока нет бейджей</span>'}</div></div>
        <div class="pe-row"><span class="label">Фон профиля</span><div class="chips">${PROFILE_BANNERS.map(([k, t]) => `<button type="button" class="chip${p.banner === k ? ' on' : ''}" data-pb="${k}">${t}</button>`).join('')}</div></div>
        <label class="field"><span class="label">Статус</span><input id="peStatus" maxlength="60" placeholder="Например: сегодня пою Земфиру" value="${esc(p.status || '')}"></label>
        <div class="pe-actions"><button type="button" class="btn btn-primary" data-psave>Сохранить</button><button type="button" class="btn btn-ghost" data-pcancel>Отмена</button></div>
      </div>` : '';

    $('#profileBody').innerHTML = `
      <div class="profile-head">
        ${avatar ? `<img class="${frameCls(pid, p)}" style="${frameVars(pid, p)}" src="${esc(avatar)}" alt="">` : `<span class="profile-ava${frameCls(pid, p)}" style="background:hsl(${hue(name)} 55% 42%);${frameVars(pid, p)}">${initial(name)}</span>`}
        <div class="profile-id">
          <h2>${nick(pid, name, p)}</h2>
          ${p.status ? `<p class="profile-status">${esc(p.status)}</p>` : ''}
          <div class="profile-tags"><span>${pid.startsWith('d') ? 'Discord' : 'Гость'}</span>${online ? '<span class="online">в комнате</span>' : ''}${mine ? '<span>это вы</span>' : ''}${modNow ? `<span class="${modNow.factor < 1 ? 'down' : 'up'}">${fmtFactor(modNow.factor)} до выпадения его фильма</span>` : ''}</div>
        </div>
        ${mine && !profEditing ? '<button type="button" class="btn btn-ghost pe-open" data-pedit>Оформить</button>' : ''}
      </div>
      ${editor}
      <div class="profile-stats">
        <div><b>${added.length}</b><span>${plural(added.length, 'фильм', 'фильма', 'фильмов')} в колесе</span></div>
        <div><b>${wins.length}</b><span>${plural(wins.length, 'раз выбрали', 'раза выбрали', 'раз выбрали')} его фильм</span></div>
        <div><b>${avgOfHis !== null ? avgOfHis.toFixed(1).replace('.', ',') : '—'}</b><span>средняя оценка его фильмов</span></div>
      </div>
      <div class="profile-sec"><h3>Бейджи <span class="m">${earned.length} из ${BADGES.length}</span></h3><div class="badges">${earned.map(b => badge(b, true)).join('')}${locked.map(b => badge(b, false)).join('')}</div></div>
      ${genres.length ? `<div class="profile-sec"><h3>Любимые жанры</h3><div class="chips">${genres.map(g => `<span class="chip on-static">${esc(g)}</span>`).join('')}</div></div>` : ''}
      ${sec(`Хочет посмотреть (${voted.length} из ${rules().votes} голосов)`, voted)}
      ${sec('Выбирали его фильмы', wins)}
      ${sec('Добавил(а) в колесо', added)}`;
    $('#profileBody').dataset.pid = pid;
    $('#profileBody').dataset.name = name;
  }

  $('#profileBody').addEventListener('click', async e => {
    const body = $('#profileBody');
    const pid = body.dataset.pid, name = body.dataset.name;
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-pedit]')) { profEditing = true; return renderProfile(pid, name); }
    if (t.matches('[data-pcancel]')) { profEditing = false; profDraft = { ...prof(pid) }; return renderProfile(pid, name); }
    const st = $('#peStatus');
    if (st) profDraft.status = st.value;
    if (t.dataset.pc !== undefined) profDraft.color = t.dataset.pc;
    else if (t.dataset.pe) profDraft.effect = t.dataset.pe;
    else if (t.dataset.pf) profDraft.frame = t.dataset.pf;
    else if (t.dataset.pb) profDraft.banner = t.dataset.pb;
    else if (t.dataset.pn) profDraft.font = t.dataset.pn;
    else if (t.dataset.pi !== undefined) profDraft.icon = t.dataset.pi;
    else if (t.dataset.pbadge !== undefined) profDraft.badge = t.dataset.pbadge;
    else if (t.matches('[data-psave]')) {
      try {
        await api('/profile', { method: 'POST', body: { ...profDraft, cid: me.cid } });
        profilesMap[pid] = { ...profDraft };
        profEditing = false;
        toast('Профиль обновлён');
        render();
      } catch (err) { return toast(err.message, true); }
    } else return;
    renderProfile(pid, name);
  });

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
    $('#people').innerHTML = people_.slice(0, 6).map(p => `<span class="ava${frameCls(p.pid)}" style="background:hsl(${hue(p.name)} 55% 42%);${frameVars(p.pid)}" data-tip="${esc(p.name)}" data-person="${esc(p.pid || '')}" data-name="${esc(p.name)}">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : initial(p.name)}</span>`).join('')
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
          ${kpBtn(f)}
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
    if (state && !spinningSid && !state.spin) syncWheel();
    $('#modeHint').dataset.hint = m === 'normal'
      ? 'Один прокрут выбирает один фильм. Шанс фильма равен его доле в колесе.'
      : m === 'elimination' ? 'Каждый прокрут выбивает один фильм, последний оставшийся побеждает. Шанс победить тот же, что в обычном режиме, а колесо показывает шанс вылететь следующим: при равных шансах доли вылета у людей поровну.'
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
      await api(`/rooms/${roomId}/stop`, { method: 'POST', body: { by: me.name, cid: me.cid } });
      if (!counting) toast('Серия остановится после текущего прокрута');
    } catch (e) { toast(e.message, true); }
  });

  $('#addLockOn').addEventListener('change', e => {
    api(`/rooms/${roomId}`, { method: 'PATCH', body: { addLock: e.target.checked, cid: me.cid } })
      .then(() => toast(e.target.checked ? 'Добавлять фильмы теперь можете только вы' : 'Добавлять фильмы снова могут все'))
      .catch(err => { e.target.checked = !e.target.checked; toast(err.message, true); });
  });
  $('#showOutOn').checked = settings.showOut;
  $('#showOutOn').addEventListener('change', e => { settings.showOut = e.target.checked; ls.set('showOut', settings.showOut); });
  // ворона: наш трек, включается у всех сразу
  $('#crowBtn').addEventListener('click', async () => {
    if (state?.music?.vid === 'RnMVb0lJ8LI') return toast('Ворона уже летит');
    Sfx.unlock();
    try { await api(`/rooms/${roomId}/music`, { method: 'POST', body: { url: 'RnMVb0lJ8LI', now: true, by: me.name, cid: me.cid } }); toast('Включаю ворону'); }
    catch (err) { toast(err.message, true); }
  });
  $('#spinLockOn').addEventListener('change', e => {
    api(`/rooms/${roomId}`, { method: 'PATCH', body: { spinLock: e.target.checked, cid: me.cid } })
      .then(() => toast(e.target.checked ? 'Теперь крутить можете только вы' : 'Крутить снова могут все'))
      .catch(err => { e.target.checked = !e.target.checked; toast(err.message, true); });
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
    if ($('#spinBtn').disabled || state?.karaoke || state?.quiz) return;
    Sfx.unlock(); // браузер разрешает звук только после клика
    if (settings.mode === 'duel') {
      try { await api(`/rooms/${roomId}/duel/start`, { method: 'POST', body: { by: me.name, cid: me.cid } }); }
      catch (e) { toast(e.message, true); }
      return;
    }
    try {
      await api(`/rooms/${roomId}/spin`, { method: 'POST', body: { mode: settings.mode, duration: settings.duration, auto: settings.auto, delay: settings.delay, by: me.name, cid: me.cid } });
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
