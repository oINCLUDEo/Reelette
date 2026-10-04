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
  el._t = setTimeout(() => { el.hidden = true; }, 300);
}
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
      const { id } = await api('/rooms', { method: 'POST', body: { name: $('#roomName').value } });
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
  const settings = { mode: ls.get('mode', 'normal'), duration: ls.get('dur', 12), auto: ls.get('auto', false), sound: ls.get('sound', true), delay: ls.get('delay', 0) };
  let countdown = null; // секунд до старта, пока идёт отсчёт
  let countdownTimer = null;

  // ---- звук щелчка ----
  let actx = null;
  let lastTick = 0;
  function tick() {
    const p = $('#pointer');
    p.classList.remove('tick'); void p.offsetWidth; p.classList.add('tick');
    if (!settings.sound) return;
    const now = performance.now();
    if (now - lastTick < 35) return;
    lastTick = now;
    try {
      actx ||= new AudioContext();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle'; o.frequency.value = 1800 + Math.random() * 300;
      g.gain.setValueAtTime(0.08, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + 0.05);
      o.connect(g).connect(actx.destination);
      o.start(); o.stop(actx.currentTime + 0.06);
    } catch {}
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
    if (!settings.sound) return;
    try {
      actx ||= new AudioContext();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'sine'; o.frequency.value = go ? 1046 : 660;
      g.gain.setValueAtTime(0.12, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + (go ? 0.35 : 0.15));
      o.connect(g).connect(actx.destination);
      o.start(); o.stop(actx.currentTime + 0.4);
    } catch {}
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
    } else if (msg.type === 'spin') {
      runSpin(msg.spin);
    } else if (msg.type === 'presence') {
      renderPeople(msg.people);
    } else if (msg.type === 'result') {
      showResult(msg);
    } else if (msg.type === 'cancel') {
      stopCountdown();
      wheel.anim = null;
      spinningSid = null;
      wheel.setAngle(state.angle);
      syncWheel();
      toast(msg.by ? `${msg.by} отменил(а) прокрут` : 'Прокрут отменён');
      render();
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

  function activeFilms() {
    return state ? state.films.filter(f => !state.eliminated.includes(f.id)) : [];
  }
  function syncWheel() { wheel.setItems(activeFilms()); }

  function runSpin(spin) {
    spinningSid = spin.sid;
    const byId = new Map(state.films.map(f => [f.id, f]));
    wheel.setItems(spin.snapshot.map(s => ({ ...byId.get(s.id), weight: s.weight })).filter(f => f.id), { snap: true });
    const elapsed = Date.now() + serverOffset - spin.startedAt;
    $$('.modal.winner').forEach(closeModal);
    stopCountdown();
    if (elapsed < 0) startCountdown(spin);
    else window.setBackdropActive?.(true);
    wheel.spin(spin, state.angle, elapsed, () => {
      spinningSid = null;
      window.setBackdropActive?.(false);
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
        window.setBackdropActive?.(true);
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
    if (msg.mode === 'elimination') {
      showWin(f, 'out', msg.left);
      if (msg.left > 1) setTimeout(() => { if ($('#winDetail').dataset.id === f.id) closeModal('#winModal'); }, 2300);
    } else if (msg.mode === 'final') {
      clearTimeout(finalTimer);
      finalTimer = setTimeout(() => showWin(f, 'win'), 1700);
    } else showWin(f, 'win');
  }

  function showWin(f, kind, left) {
    const card = $('#winModal .win-card');
    card.classList.toggle('out', kind === 'out');
    $('#winDetail').dataset.id = f.id;
    const label = kind === 'out' ? `Выбывает${left > 1 ? `, осталось ${left}` : ''}` : 'Сегодня смотрим';
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
            ${state.films.some(x => x.id === f.id) ? `<button class="btn btn-ghost" data-remove="${esc(f.id)}">Убрать из колеса</button>` : ''}
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
    if (f.rating) parts.push(`<span>Рейтинг <b>${esc(f.rating)}</b></span>`);
    if (f.genres?.length) parts.push(`<span>${esc(f.genres.join(', '))}</span>`);
    if (f.addedBy) parts.push(`<span>Добавил(а) <b>${esc(f.addedBy)}</b></span>`);
    return parts.length ? `<div class="facts">${parts.join('')}</div>` : '';
  }

  // ---- отрисовка ----
  function render() {
    if (!state) return;
    $('#roomTitle').textContent = state.name;
    const spinning = Boolean(spinningSid || state.spin);
    const active = activeFilms();
    const total = active.reduce((s, f) => s + f.weight, 0);
    const out = new Set(state.eliminated);

    $('#filmCount').textContent = state.films.length ? String(state.films.length) : '';
    $('#filmEmpty').hidden = state.films.length > 0;
    $('#filmList').innerHTML = state.films.map(f => {
      const pct = out.has(f.id) || !total ? '—' : `${(f.weight / total * 100).toFixed(f.weight / total < 0.1 ? 1 : 0)}%`;
      return `<div class="film${out.has(f.id) ? ' out' : ''}${wheel.curId === f.id ? ' hot' : ''}" data-id="${esc(f.id)}">
        <div class="film-poster" style="${posterStyle(f)}">${f.poster ? '' : initial(f.title)}</div>
        <div class="film-main">
          <div class="film-title">${esc(f.title)}</div>
          <div class="film-meta">${[f.year, f.addedBy].filter(Boolean).map(esc).join(', ')}</div>
        </div>
        <div class="film-side">
          <span class="film-pct">${pct}</span>
          <div class="stepper"><button data-w="-1" title="Меньше">${ICON.minus}</button><b>${f.weight}</b><button data-w="1" title="Больше">${ICON.plus}</button></div>
        </div>
        <button class="film-del" data-del title="Удалить">${ICON.x}</button>
      </div>`;
    }).join('');

    $('#historyList').innerHTML = state.history.length
      ? state.history.slice(0, 20).map((h, i) => `<div class="hist" data-h="${i}"><i style="${posterStyle(h.film)}"></i><div><b>${esc(h.film.title)}</b><span>${timeAgo(h.at)}</span></div></div>`).join('')
      : '<p class="note">Пока ничего. Победители будут появляться здесь.</p>';

    const btn = $('#spinBtn');
    const counting = countdown !== null;
    btn.disabled = spinning || active.length < 2;
    btn.classList.toggle('busy', spinning && !counting);
    btn.classList.toggle('count', counting);
    $('#spinBtn .hub-label').textContent = counting ? String(countdown) : spinning ? 'Крутится' : settings.mode === 'elimination' && state.eliminated.length ? 'Дальше' : 'Крутить';
    $('#hubSub').textContent = counting || spinning ? '' : active.length < 2 ? 'нужно 2 фильма' : `${active.length} ${plural(active.length, 'фильм', 'фильма', 'фильмов')}`;

    $('#stopBtn').hidden = !counting && !state.series;
    $('#stopBtn').textContent = counting ? 'Отменить прокрут' : 'Остановить серию';
    if (spinning) {
      const by = state.spin?.by || '';
      $('#stageStatus').textContent = counting ? (by ? `${by} запускает колесо` : 'Колесо сейчас запустится')
        : state.series ? `Серия до победителя, осталось ${active.length}` : by ? `Крутит ${by}` : 'Колесо крутится';
    }
    $('#resetBtn').hidden = !state.eliminated.length || spinning;
    $('#addBtn').disabled = spinning;

    if (!spinning) {
      $('#stageStatus').textContent = active.length < 2
        ? (state.eliminated.length && active.length === 1 ? 'Остался один фильм. Чтобы начать заново, верните выбывших.'
          : state.films.length ? 'Для прокрута нужно хотя бы два фильма' : '')
        : settings.mode === 'elimination' && state.eliminated.length ? `В колесе осталось ${active.length}` : 'Нажмите на центр колеса или пробел';
    }
  }

  function renderPeople(people) {
    $('#people').innerHTML = people.slice(0, 6).map(p => `<span class="ava" style="background:hsl(${hue(p.name)} 55% 42%)" data-tip="${esc(p.name)}">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : initial(p.name)}</span>`).join('')
      + (people.length > 6 ? `<span class="ava" style="background:#333">+${people.length - 6}</span>` : '');
  }

  // ---- действия с фильмами ----
  async function removeFilm(id) {
    try { await api(`/rooms/${roomId}/films/${id}`, { method: 'DELETE' }); }
    catch (e) { toast(e.message, true); }
  }

  $('#filmList').addEventListener('click', async e => {
    const row = e.target.closest('.film');
    if (!row) return;
    const id = row.dataset.id;
    const w = e.target.closest('[data-w]');
    if (w) {
      try { await api(`/rooms/${roomId}/films/${id}`, { method: 'PATCH', body: { delta: Number(w.dataset.w) } }); }
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
    const total = active.reduce((s, x) => s + x.weight, 0);
    const inWheel = !fromHistory && active.some(x => x.id === f.id);
    $('#filmDetail').innerHTML = `<div class="detail">
      ${f.poster ? `<img src="${esc(f.poster)}" alt="">` : `<div class="noposter" style="${posterStyle(f)}"></div>`}
      <div>
        <h2>${esc(f.title)}</h2>
        ${f.original ? `<div class="orig">${esc(f.original)}</div>` : ''}
        ${facts(f)}
        ${inWheel ? `<div class="facts"><span>Вес <b>${f.weight}</b></span><span>Шанс <b>${(f.weight / total * 100).toFixed(1)}%</b></span></div>` : ''}
        <p>${f.overview ? esc(f.overview) : '<span class="muted">Описания нет.</span>'}</p>
        <div class="detail-actions">
          ${f.url ? `<a class="btn btn-primary" href="${esc(f.url)}" target="_blank" rel="noopener">Страница фильма</a>` : ''}
          ${!fromHistory ? `<button class="btn btn-ghost" data-rm>Удалить из колеса</button>` : ''}
        </div>
      </div></div>`;
    $('#filmDetail [data-rm]')?.addEventListener('click', async () => { await removeFilm(f.id); closeModal('#filmModal'); });
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
      const r = await api(`/rooms/${roomId}/films`, { method: 'POST', body: { ...film, by: me.name } });
      b.classList.add('added');
      b.querySelector('.plus').innerHTML = ICON.check;
      toast(r.merged.length ? `«${film.title}» уже был, вес увеличен` : `«${film.title}» добавлен`);
    } catch (err) { toast(err.message, true); }
  });

  // ---- добавление списком: поиск по каждой строке, затем проверка ----
  // choice: индекс найденного варианта, 'raw' (как есть) или 'skip' (не добавлять)
  let bulk = [];

  async function addFilms(films) {
    const r = await api(`/rooms/${roomId}/films`, { method: 'POST', body: { films, by: me.name } });
    toast(`Добавлено: ${r.added.length}${r.merged.length ? `, уже были: ${r.merged.length}` : ''}`);
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
      : 'Каждый прокрут убирает один фильм, последний оставшийся побеждает. Шансы на победу такие же, как в обычном режиме.';
    $('#autoWrap').hidden = m !== 'elimination';
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
    settings.delay = v; ls.set('delay', v);
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
  $('#soundOn').checked = settings.sound;
  $('#soundOn').addEventListener('change', e => { settings.sound = e.target.checked; ls.set('sound', settings.sound); });

  async function spin() {
    if ($('#spinBtn').disabled) return;
    actx ||= new AudioContext(); // разблокировать звук по клику
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
    $('#deleteRoom').hidden = Boolean(state?.owner && state.owner !== account.user?.id);
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
    await api(`/rooms/${roomId}/clear`, { method: 'POST', body: { what: 'history' } }).catch(e => toast(e.message, true));
  });
  $('#deleteRoom').addEventListener('click', async () => {
    if (!confirm(`Удалить комнату «${state.name}» вместе со всеми фильмами и историей? Это нельзя отменить.`)) return;
    try {
      await api(`/rooms/${roomId}`, { method: 'DELETE' });
      ls.set('rooms', ls.get('rooms', []).filter(r => r.id !== roomId));
      location.href = '/';
    } catch (e) { toast(e.message, true); }
  });
  $('#clearFilms').addEventListener('click', async () => {
    if (!confirm('Удалить все фильмы из колеса?')) return;
    await api(`/rooms/${roomId}/clear`, { method: 'POST', body: { what: 'films' } }).catch(e => toast(e.message, true));
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
