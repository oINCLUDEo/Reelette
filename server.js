// Reelette — сервер без зависимостей: статика, JSON API, SSE для синхронизации комнат.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

loadEnv(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'rooms.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const KP_KEY = process.env.KINOPOISK_API_KEY || '';
const TMDB_KEY = process.env.TMDB_API_KEY || '';
const PROVIDER = (process.env.MOVIE_PROVIDER || (KP_KEY ? 'kinopoisk' : TMDB_KEY ? 'tmdb' : 'none')).toLowerCase();

// Docker env_file не снимает кавычки и пробелы, чистим сами
const envClean = k => (process.env[k] || '').trim().replace(/^["']|["']$/g, '').trim();
// ---------- оформление профилей: общее для всех комнат, data/profiles.json ----------
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
let profiles = {};
try { profiles = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8')); } catch { profiles = {}; }
let profilesTimer = null;
function saveProfiles() {
  clearTimeout(profilesTimer);
  profilesTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(PROFILES_FILE + '.tmp', JSON.stringify(profiles));
      fs.renameSync(PROFILES_FILE + '.tmp', PROFILES_FILE);
    } catch (e) { console.error(`Не удалось сохранить ${PROFILES_FILE}: ${e.message}`); }
  }, 300);
}
const PROFILE_GRADS = ['sunset', 'neon', 'gold', 'ice', 'rainbow'];
const PROFILE_EFFECTS = ['none', 'glow', 'shimmer', 'pulse', 'glitch', 'wave', 'flicker', 'rainbow'];
const PROFILE_FRAMES = ['none', 'accent', 'neon', 'gold', 'rainbow', 'fire', 'ice', 'toxic', 'holo'];
const PROFILE_BANNERS = ['none', 'aurora', 'sunset', 'ocean', 'ember', 'night', 'live', 'stars'];
const PROFILE_FONTS = ['default', 'unbounded', 'pixel', 'pacifico', 'russo'];
const PROFILE_ICONS = ['', '👑', '🔥', '⭐', '🎤', '🎬', '💀', '👾', '🐸', '🌙', '⚡', '🍿', '🦄', '🎧'];
const PROFILE_BADGES = ['', 'critic', 'hitmaker', 'taste', 'collector', 'singer', 'star', 'soul', 'quiz'];
function cleanProfile(b) {
  const c = String(b.color || '');
  return {
    color: /^#[0-9a-f]{6}$/i.test(c) || (c.startsWith('grad:') && PROFILE_GRADS.includes(c.slice(5))) ? c : '',
    effect: PROFILE_EFFECTS.includes(b.effect) ? b.effect : 'none',
    frame: PROFILE_FRAMES.includes(b.frame) ? b.frame : 'none',
    banner: PROFILE_BANNERS.includes(b.banner) ? b.banner : 'none',
    font: PROFILE_FONTS.includes(b.font) ? b.font : 'default',
    icon: PROFILE_ICONS.includes(b.icon) ? b.icon : '',
    badge: PROFILE_BADGES.includes(b.badge) ? b.badge : '',
    status: typeof b.status === 'string' ? b.status.trim().slice(0, 60) : '',
  };
}
const REACTIONS = ['clap', 'fire', 'laugh', 'love', 'wow', 'skull', 'party', 'crow'];

const auth = require('./auth')({
  dataDir: DATA_DIR,
  clientId: envClean('DISCORD_CLIENT_ID'),
  clientSecret: envClean('DISCORD_CLIENT_SECRET'),
  publicUrl: envClean('PUBLIC_URL'),
});

const MAX_FILMS = 200;
const MAX_HISTORY = 50;

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ---------- хранилище ----------
let rooms = {};
try { rooms = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { rooms = {}; }
for (const r of Object.values(rooms)) {
  r.spin = null; r.plan = null; r.duel = null; r.quiz = null;
  if (r.music?.quiz) r.music = null;
  for (const h of r.history || []) { h.hid ||= crypto.randomBytes(4).toString('hex'); h.ratings ||= {}; }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DATA_FILE + '.tmp';
      const out = {};
      for (const [id, r] of Object.entries(rooms)) out[id] = { ...r, spin: null, plan: null, duel: null, quiz: null };
      fs.writeFileSync(tmp, JSON.stringify(out));
      fs.renameSync(tmp, DATA_FILE);
    } catch (e) {
      // не роняем сервер: комнаты живут в памяти, пишем в лог причину
      console.error(`Не удалось сохранить ${DATA_FILE}: ${e.message}`);
    }
  }, 300);
}

const id = (n = 8) => crypto.randomBytes(16).toString('base64url').replace(/[-_]/g, '').slice(0, n);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

// Таймеры и флаг серии живут только в памяти, в файл не пишутся.
const runtimes = new Map();
function runtime(r) {
  if (!runtimes.has(r.id)) runtimes.set(r.id, { finish: null, next: null, series: false });
  return runtimes.get(r.id);
}

function publicState(r) {
  return {
    id: r.id, name: r.name, createdAt: r.createdAt, owner: ownerKey(r),
    films: r.films, history: r.history, eliminated: r.eliminated,
    angle: r.angle, hasWebhook: Boolean(r.webhook), spin: r.spin, series: runtime(r).series,
    filters: r.filters || cleanFilters({}), duel: r.duel || null,
    rules: { votes: VOTES_PER_PERSON, points: VOTE_POINTS, cap: VOTE_CAP },
    fair: r.fair !== false, modifiers: r.mods || {},
    // во время раунда «Угадай мелодию» название трека не отдаём
    music: r.music?.quiz && r.quiz?.state === 'playing' ? { ...r.music, title: 'Угадай мелодию', author: '' } : r.music || null,
    quiz: publicQuiz(r), quizWins: r.quizWins || {}, chat: r.chat || [], queue: r.queue || [], lastTrack: r.music ? null : r.lastTrack || null,
    spinLock: Boolean(r.spinLock), addLock: Boolean(r.addLock),
    // идёт выбывание: есть выбывшие или серия — новые фильмы сломали бы колесо посреди серии
    elimActive: r.eliminated.length > 0 || runtime(r).series,
    karaoke: Boolean(r.karaoke), perfs: (r.perfs || []).slice(0, 40),
    hits: r.hits || [], reacts: r.reacts || {}, profiles,
  };
}

// ---------- голоса ----------
// У каждого 3 голоса, на фильм не больше одного своего. Голос даёт +25% к шансу, засчитывается до 4 голосов (максимум ×2).
const VOTES_PER_PERSON = 3;
// голоса от оценки последнего выпавшего фильма: 8–9,9 → +2, 10 → +4, ниже 6 → −2 (остаётся 1)
// держатся вместе с бонусом или штрафом к шансам — пока снова не выпадет фильм этого человека
const bonusVotes = factor => (factor >= 2 ? 4 : factor > 1 ? 2 : factor < 1 ? -2 : 0);
const votesFor = (r, pid) => VOTES_PER_PERSON + bonusVotes(r.mods?.[pid]?.factor || 1);
const VOTE_BONUS = 0.25;
// Голос добавляет фильму фиксированные 4 пункта к колесу (колесо = 100 пунктов + голоса),
// поэтому весит одинаково, сколько бы фильмов ни было у автора.
const VOTE_POINTS = 4;
const RATE_EDIT_MS = 60000; // сколько можно менять свою оценку
const votePoints = f => VOTE_POINTS * Math.min(VOTE_CAP, (f.votes || []).length);
const VOTE_CAP = 4;
const voteMul = f => 1 + VOTE_BONUS * Math.min(VOTE_CAP, (f.votes || []).length);
const effWeight = f => f.weight * voteMul(f);
// Автор фильма: Discord-пользователь (d…), гость (g…), у старых фильмов только имя (n:…)
const personOf = f => (f.addedById ? (/^\d+$/.test(f.addedById) ? 'd' + f.addedById : f.addedById) : 'n:' + (f.addedBy || ''));

// ---------- оценка после просмотра: разовый бонус или штраф автору на следующий выбор ----------
// Средняя оценка остальных (без автора): <6 → ×0.5, 6–7.9 → ×1, 8–9.9 → ×1.5, 10 → ×2.
// Действует, пока снова не выпадет фильм этого автора.
function ratingFactor(avg) {
  if (avg < 6) return 0.5;
  if (avg < 8) return 1;
  if (avg < 10) return 1.5;
  return 2;
}
// Бонус или штраф автору считается по оценкам его последнего выпавшего фильма (без оценки самого автора)
// и действует, пока снова не выпадет его фильм — тогда сгорает, а новый фильм оценивают заново.
function modFromEntry(h) {
  const author = personOf(h.film);
  const scores = Object.entries(h.ratings || {}).filter(([pid]) => pid !== author).map(([, v]) => v.score);
  if (!scores.length) return null;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { pid: author, name: h.film.addedBy || '', title: h.film.title, avg: Math.round(avg * 10) / 10, count: scores.length, factor: ratingFactor(avg) };
}
// множители могли поменяться: действующие бонусы пересчитываются по текущим правилам
for (const r of Object.values(rooms)) {
  if (!r.mods) continue;
  r.mods = {};
  for (const h of r.history || []) {
    if (!h.src) continue;
    const mm = modFromEntry(h);
    if (mm && mm.factor !== 1) r.mods[personOf(h.film)] = mm;
  }
}
// старые комнаты: бонусы по последнему выпавшему фильму каждого автора
for (const r of Object.values(rooms)) {
  if (!r.mods) {
    r.mods = {};
    const seen = new Set();
    for (const h of r.history || []) {
      const a = personOf(h.film);
      if (seen.has(a)) continue;
      seen.add(a);
      h.src = true; // последний выпавший фильм автора задаёт его бонус
      const m = modFromEntry(h);
      if (m && m.factor !== 1) r.mods[a] = m;
    }
  }
}

// Шансы на колесе. Основа — 100 пунктов: с «равными шансами» поровну между авторами,
// внутри доли автора между его фильмами по весу. Каждый голос добавляет фильму VOTE_POINTS пунктов.
// Бонус или штраф за оценку умножает всё, что приходится на фильмы автора.
function chanceWeights(r, list) {
  const modOf = pid => r.mods?.[pid]?.factor || 1;
  const w = new Map();
  if (r.fair !== false) {
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
// Кто действует: Discord-пользователь или гость с id браузера
const personKey = (me, b) => (me ? 'd' + me.id : str(b.cid, 32) ? 'g' + str(b.cid, 32) : '');
// Создатель комнаты. В старых комнатах хранился голый id Discord, приводим к тому же виду.
const ownerKey = r => (r.owner ? (/^\d+$/.test(r.owner) ? 'd' + r.owner : r.owner) : '');
const isOwner = (r, me, b) => Boolean(ownerKey(r)) && ownerKey(r) === personKey(me, b);

// ---------- фильтры ----------
const RUNTIMES = [0, 105, 120, 150];
const YEARS = [0, 2000, 2010, 2020];
function cleanFilters(b) {
  return {
    on: Boolean(b?.on),
    maxRuntime: RUNTIMES.includes(Number(b?.maxRuntime)) ? Number(b.maxRuntime) : 0,
    minYear: YEARS.includes(Number(b?.minYear)) ? Number(b.minYear) : 0,
    genres: Array.isArray(b?.genres) ? [...new Set(b.genres.map(g => str(g, 30).toLowerCase()).filter(Boolean))].slice(0, 12) : [],
  };
}
// Неизвестная длина или год фильтр не режет; при выборе жанров фильм без жанров не проходит.
function matchesFilters(r, f) {
  const F = r.filters;
  if (!F?.on) return true;
  if (F.maxRuntime && f.runtime && f.runtime > F.maxRuntime) return false;
  if (F.minYear && f.year && Number(f.year) < F.minYear) return false;
  if (F.genres.length && !(f.genres || []).some(g => F.genres.includes(g.toLowerCase()))) return false;
  return true;
}

// ---------- SSE ----------
const clients = new Map(); // roomId -> Set<{res, name, cid}>

function send(res, msg) { res.write(`data: ${JSON.stringify(msg)}\n\n`); }
function broadcast(roomId, msg) {
  for (const c of clients.get(roomId) || []) send(c.res, msg);
}
function presence(roomId) {
  const seen = new Map();
  for (const c of clients.get(roomId) || []) if (!seen.has(c.cid)) seen.set(c.cid, { name: c.name, avatar: c.avatar, pid: c.pid });
  broadcast(roomId, { type: 'presence', people: [...seen.values()] });
}
function pushState(r) { save(); broadcast(r.id, { type: 'state', state: publicState(r) }); }

setInterval(() => {
  for (const set of clients.values()) for (const c of set) c.res.write(': ping\n\n');
}, 25000);

// ---------- колесо ----------
// уже выпадавшие фильмы на колесо не попадают; создатель может убрать фильм из истории, и он вернётся
const watchedIds = r => new Set(r.history.map(h => h.film.id));
function activeFilms(r) {
  const watched = watchedIds(r);
  return r.films.filter(f => !r.eliminated.includes(f.id) && !watched.has(f.id) && f.weight > 0 && matchesFilters(r, f));
}
// Шанс вылететь на выбывании: по каждому фильму на всём колесе, обратно его шансу выиграть.
// Фавориты (голоса, вес, бонус) получают узкие секторы, фильмы с маленьким шансом вылетают первыми.
function elimWeights(r, list, W) {
  const out = new Map();
  const inv = f => 1 / Math.max(1e-6, W.get(f.id) || 0);
  const sum = list.reduce((a, f) => a + inv(f), 0) || 1;
  for (const f of list) out.set(f.id, (inv(f) / sum) * 100);
  return out;
}
function pickWeighted(list, weights) {
  const wOf = f => (weights ? weights.get(f.id) || 0 : effWeight(f));
  const total = list.reduce((s, f) => s + wOf(f), 0);
  let x = crypto.randomInt(0, 1e9) / 1e9 * total;
  for (const f of list) { x -= wOf(f); if (x < 0) return f; }
  return list[list.length - 1];
}

function startSpin(r, { mode, duration, auto, by, delay }) {
  const list = activeFilms(r);
  if (list.length < 2) return 'Нужно хотя бы два фильма в колесе';
  mode = mode === 'elimination' ? 'elimination' : 'normal';
  duration = Math.min(60, Math.max(0, num(duration, 12))); // 0 — сразу результат, без вращения
  delay = Math.min(15, Math.max(0, Math.round(num(delay, 0))));
  const rt = runtime(r);
  // обычный режим: сектор = шанс победить; выбывание: сектор = шанс вылететь, стрелка выбивает именно по нему
  let W = chanceWeights(r, list);
  let landed;
  if (mode === 'normal') {
    landed = pickWeighted(list, W);
  } else {
    // победитель серии — заранее и по тем же шансам, что в обычном режиме, поэтому равные шансы сохраняются;
    // колесо показывает шанс вылететь, и выбиваются остальные именно по нему
    if (!r.plan || !list.some(f => f.id === r.plan.winner)) r.plan = { winner: pickWeighted(list, W).id };
    const E = elimWeights(r, list, W);
    landed = pickWeighted(list.filter(f => f.id !== r.plan.winner), E);
    W = E;
  }

  r.spin = {
    sid: id(6), mode, duration, auto: Boolean(auto) && mode === 'elimination', by: str(by, 32),
    startedAt: Date.now() + delay * 1000, delay,
    snapshot: list.map(f => ({ id: f.id, weight: Math.round(W.get(f.id) * 1000) / 1000 })),
    filmId: landed.id,
    offset: 0.12 + (crypto.randomInt(0, 1000) / 1000) * 0.76,
    turns: duration ? Math.max(2, Math.round(duration * 0.9)) : 0,
  };
  rt.series = r.spin.auto;
  broadcast(r.id, { type: 'spin', spin: r.spin, now: Date.now() });
  pushState(r);

  const sid = r.spin.sid;
  rt.finish = setTimeout(() => finishSpin(r, sid), (delay + duration) * 1000 + 150);
  return null;
}

function finishSpin(r, sid) {
  if (!r.spin || r.spin.sid !== sid) return;
  const s = r.spin;
  const rt = runtime(r);
  rt.finish = null;
  r.angle = endAngle(s);
  r.spin = null;
  const film = r.films.find(f => f.id === s.filmId);

  if (s.mode === 'normal') {
    rt.series = false;
    recordWin(r, film, 'normal');
    broadcast(r.id, { type: 'result', mode: 'normal', film });
  } else {
    r.eliminated.push(s.filmId);
    const left = activeFilms(r);
    broadcast(r.id, { type: 'result', mode: 'elimination', film, left: left.length });
    if (left.length === 1) {
      recordWin(r, left[0], 'elimination');
      r.plan = null;
      rt.series = false;
      broadcast(r.id, { type: 'result', mode: 'final', film: left[0] });
    } else if (rt.series) {
      rt.next = setTimeout(() => {
        rt.next = null;
        if (rooms[r.id] && !r.spin && rt.series) startSpin(r, { mode: 'elimination', duration: s.duration, auto: true, by: s.by });
      }, 2600);
    }
  }
  pushState(r);
}

// ---------- дуэль: пары, голосование, проигравший вылетает ----------
function shuffle(a) {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function pairUp(ids) {
  const matches = [];
  for (let i = 0; i + 1 < ids.length; i += 2) matches.push([ids[i], ids[i + 1]]);
  return { matches, bye: ids.length % 2 ? ids[ids.length - 1] : null };
}
function startDuel(r, by) {
  const list = activeFilms(r);
  if (list.length < 2) return 'Для дуэли нужно хотя бы два фильма';
  const { matches, bye } = pairUp(shuffle(list.map(f => f.id)));
  r.duel = { did: id(6), by, round: 1, matches, idx: 0, next: bye ? [bye] : [], votes: {}, reveal: null, left: list.length };
  pushState(r);
  return null;
}
function presentVoters(r) {
  const set = new Set();
  for (const c of clients.get(r.id) || []) set.add(c.cid);
  return set;
}
function voteDuel(r, voter, name, filmId) {
  const d = r.duel;
  if (!d || d.reveal) return 'Голосование за эту пару уже закрыто';
  if (!d.matches[d.idx].includes(filmId)) return 'Этого фильма нет в паре';
  d.votes[voter] = { film: filmId, name };
  pushState(r);
  // проголосовали все, кто сейчас в комнате: подводим итог сами
  const present = presentVoters(r);
  if (present.size && [...present].every(v => d.votes[v])) {
    const rt = runtime(r);
    clearTimeout(rt.duelAuto);
    rt.duelAuto = setTimeout(() => resolveDuel(r, d.did), 900);
  }
  return null;
}
function resolveDuel(r, did) {
  const d = r.duel;
  if (!d || d.did !== did || d.reveal) return;
  const [a, b] = d.matches[d.idx];
  const count = fid => Object.values(d.votes).filter(v => v.film === fid).length;
  const ca = count(a), cb = count(b);
  let winner;
  if (ca !== cb) winner = ca > cb ? a : b;
  else {
    // ничья: жребий с теми же шансами, что на колесе
    const pair = [a, b].map(x => r.films.find(f => f.id === x)).filter(Boolean);
    winner = pickWeighted(pair, chanceWeights(r, activeFilms(r)))?.id || a;
  }
  d.reveal = { winner, loser: winner === a ? b : a, counts: { [a]: ca, [b]: cb }, tie: ca === cb };
  pushState(r);
  runtime(r).duelNext = setTimeout(() => advanceDuel(r, did), 2400);
}
function advanceDuel(r, did) {
  const d = r.duel;
  if (!d || d.did !== did || !d.reveal) return;
  d.next.push(d.reveal.winner);
  d.left--;
  d.reveal = null;
  d.votes = {};
  d.idx++;
  if (d.idx >= d.matches.length) {
    if (d.next.length === 1) {
      const film = r.films.find(f => f.id === d.next[0]);
      r.duel = null;
      recordWin(r, film, 'duel');
      broadcast(r.id, { type: 'result', mode: 'duel', film });
      pushState(r);
      return;
    }
    const { matches, bye } = pairUp(shuffle(d.next));
    d.round++;
    d.matches = matches;
    d.idx = 0;
    d.next = bye ? [bye] : [];
  }
  pushState(r);
}
function stopDuel(r) {
  const rt = runtime(r);
  clearTimeout(rt.duelAuto); clearTimeout(rt.duelNext);
  r.duel = null;
}

// Угол хранится как доля оборота, считается так же, как на клиенте.
function endAngle(s) {
  const total = s.snapshot.reduce((a, f) => a + f.weight, 0);
  let acc = 0;
  for (const f of s.snapshot) {
    if (f.id === s.filmId) { acc += f.weight * s.offset; break; }
    acc += f.weight;
  }
  return ((1 - acc / total) % 1 + 1) % 1;
}

function recordWin(r, film, mode) {
  if (!film) return;
  // фильм автора снова выпал: его прошлый бонус или штраф сгорает, новый фильм теперь задаёт бонус
  const author = personOf(film);
  r.mods ||= {};
  delete r.mods[author];
  for (const h of r.history) if (personOf(h.film) === author) h.src = false;
  r.history.unshift({ hid: crypto.randomBytes(4).toString('hex'), at: Date.now(), mode, film: { ...film }, ratings: {}, src: true });
  // фильм выбран: голоса за него возвращаются людям (в истории остаётся, кто его хотел)
  const live = r.films.find(x => x.id === film.id);
  if (live) live.votes = [];
  r.history = r.history.slice(0, MAX_HISTORY);
  if (r.webhook) postWebhook(r, film).catch(e => console.warn('webhook:', e.message));
}

async function postWebhook(r, film) {
  const embed = {
    title: `${film.title}${film.year ? ` (${film.year})` : ''}`,
    description: (film.overview || '').slice(0, 600) || undefined,
    url: film.url || undefined,
    color: 0xf59e0b,
    footer: { text: `Reelette · ${r.name}` },
  };
  if (film.poster) embed.thumbnail = { url: film.poster };
  embed.fields = [
    film.rating && { name: 'Рейтинг', value: String(film.rating), inline: true },
    film.runtime && { name: 'Длительность', value: fmtRuntime(film.runtime), inline: true },
  ].filter(Boolean);
  await fetch(r.webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Reelette', content: 'Сегодня смотрим', embeds: [embed] }),
  });
}

// ---------- поиск фильмов ----------
async function searchMovies(q) {
  if (PROVIDER === 'kinopoisk' && KP_KEY) {
    const u = `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(q)}&page=1`;
    const j = await getJson(u, { 'X-API-KEY': KP_KEY });
    return (j.films || []).slice(0, 12).map(f => ({
      source: 'kinopoisk', sourceId: String(f.filmId),
      title: f.nameRu || f.nameEn || 'Без названия',
      original: f.nameRu && f.nameEn ? f.nameEn : '',
      year: /^\d{4}/.test(f.year || '') ? f.year.slice(0, 4) : '',
      poster: f.posterUrlPreview || f.posterUrl || '',
      rating: f.rating && f.rating !== 'null' && !String(f.rating).includes('%') ? f.rating : '',
      overview: '', genres: (f.genres || []).map(g => g.genre).slice(0, 3),
      url: `https://www.kinopoisk.ru/film/${f.filmId}/`,
    }));
  }
  if (PROVIDER === 'tmdb' && TMDB_KEY) {
    const bearer = TMDB_KEY.length > 40;
    const u = `https://api.themoviedb.org/3/search/multi?language=ru-RU&include_adult=false&query=${encodeURIComponent(q)}${bearer ? '' : `&api_key=${TMDB_KEY}`}`;
    const j = await getJson(u, bearer ? { Authorization: `Bearer ${TMDB_KEY}` } : {});
    return (j.results || []).filter(f => f.media_type === 'movie' || f.media_type === 'tv').slice(0, 12).map(f => {
      const title = f.title || f.name || 'Без названия';
      const orig = f.original_title || f.original_name || '';
      return {
        source: 'tmdb', sourceId: `${f.media_type}/${f.id}`,
        title, original: orig !== title ? orig : '',
        year: (f.release_date || f.first_air_date || '').slice(0, 4),
        poster: f.poster_path ? `https://image.tmdb.org/t/p/w342${f.poster_path}` : '',
        rating: f.vote_average ? f.vote_average.toFixed(1) : '',
        overview: f.overview || '', genres: [],
        url: `https://www.themoviedb.org/${f.media_type}/${f.id}`,
      };
    });
  }
  return [];
}

const fmtRuntime = m => (m >= 60 ? `${Math.floor(m / 60)} ч ${m % 60} мин` : `${m} мин`);
// Трек по ссылке: проверяем через oEmbed, что видео существует и его можно встраивать.
async function fetchTrack(url) {
  if (/youtube\.com\/jam|music\.youtube\.com\/.*jam/i.test(String(url || ''))) return { error: 'Джемы YouTube Music открываются только в приложении. Добавляйте треки сюда по ссылкам, очередь общая для всех' };
  const vid = ytKey(url);
  if (!vid) return { error: /list=/.test(String(url || '')) ? 'Это ссылка на плейлист без трека. Откройте нужный трек и скопируйте его ссылку' : 'Не похоже на ссылку на YouTube' };
  let meta = {};
  try {
    const o = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + vid)}`, { signal: AbortSignal.timeout(6000) });
    if (o.status === 401 || o.status === 403) return { error: 'Автор запретил встраивать это видео, возьмите другое' };
    if (o.status === 404 || o.status === 400) return { error: 'Видео не найдено или оно приватное' };
    if (o.ok) meta = await o.json();
  } catch { /* YouTube не ответил: включаем без названия */ }
  return { vid, title: str(meta.title || '', 160) || 'Трек с YouTube', author: str(meta.author_name || '', 80) };
}
function playTrack(r, track) {
  r.music = {
    vid: track.vid, title: track.title, author: track.author, by: track.by,
    singer: track.singer || '', singerPid: track.singerPid || '',
    startedAt: Date.now(), pausedAt: null, duration: track.duration || 0,
  };
  // в караоке каждая спетая песня — выступление, его можно оценить
  if (r.karaoke && track.singer) {
    r.perfs ||= [];
    const perf = { perfId: id(6), vid: track.vid, title: track.title, singer: track.singer, singerPid: track.singerPid || '', at: Date.now(), ratings: {} };
    r.perfs.unshift(perf);
    r.perfs = r.perfs.slice(0, 60);
    r.music.perfId = perf.perfId;
  }
  // «Наши хиты»: что играло в комнате, сколько раз и кто пел
  r.hits ||= [];
  let hit = r.hits.find(x => x.vid === track.vid);
  if (!hit) { hit = { vid: track.vid, title: track.title, author: track.author || '', plays: 0, singers: [] }; r.hits.unshift(hit); }
  hit.plays++;
  hit.lastAt = Date.now();
  const singer = track.singer || track.by;
  if (singer && !hit.singers.includes(singer)) hit.singers = [...hit.singers, singer].slice(-6);
  r.hits = r.hits.slice(0, 200);
  if (r.karaoke) loadLyrics(r);
  scheduleMusic(r);
}

// ---------- «Угадай мелодию» ----------
const QUIZ_ROUNDS = [5, 10, 15];
const QUIZ_LENS = [10, 15, 20];
const qnorm = x => String(x || '').toLowerCase().replace(/ё/g, 'е')
  .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/\b(feat|ft)\b.*$/, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b) {
  a = a.slice(0, 80); b = b.slice(0, 80);
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}
const similar = (a, b) => (a && b ? 1 - lev(a, b) / Math.max(a.length, b.length) : 0);
// кириллицу переводим в латиницу, чтобы «данза кудуро» засчитывалось за «Danza Kuduro»
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const translit = x => [...x].map(ch => TR[ch] ?? ch).join('');
const similarAny = (a, b) => Math.max(similar(a, b), similar(translit(a), translit(b)));
// Ответ: название песни и исполнитель. «Исполнитель - Песня» в названии видео разбиваем на части.
function quizAnswers(t) {
  const { q, artist } = songQuery(t.title, t.author);
  const parts = q.split(/\s+[-–—]\s+/);
  const song = parts.length > 1 ? parts.slice(1).join(' ') : q;
  return { song: qnorm(song), artist: qnorm(parts.length > 1 ? parts[0] : artist), full: qnorm(q) };
}
// Насколько версия похожа на ответ: 1 — точно, от 0,78 считаем верной (опечатки прощаем).
function quizScore(guess, ans) {
  const g = qnorm(guess);
  if (g.length < 2) return 0;
  let best = 0;
  for (const c of [ans.song, ans.full, ans.artist && ans.song ? `${ans.artist} ${ans.song}` : '']) {
    if (!c) continue;
    best = Math.max(best, similarAny(g, c));
    if (c.length >= 4 && g.length >= Math.max(3, c.length * 0.6) && c.includes(g)) best = Math.max(best, 0.9);
  }
  if (ans.artist && ans.artist.length >= 3) best = Math.max(best, similarAny(g, ans.artist) >= 0.85 ? 0.85 : 0);
  return best;
}
const quizHint = ans => ans.song.split(' ').filter(Boolean).map(w => w[0].toUpperCase() + '•'.repeat(Math.max(0, Math.min(w.length - 1, 8)))).join(' ');
function publicQuiz(r) {
  const z = r.quiz;
  if (!z) return null;
  const rd = z.round;
  return {
    qid: z.qid, by: z.by, rounds: z.order.length, len: z.len, state: z.state, scores: z.scores, winner: z.winner || '',
    round: rd ? {
      n: rd.n, startsAt: rd.startsAt, endsAt: rd.endsAt, guessed: rd.guessed, reveal: rd.reveal,
      hint: z.state !== 'playing' || Date.now() >= rd.hintAt ? quizHint(rd.answer) : '',
    } : null,
  };
}
function quizClear(r) {
  const rt = runtime(r);
  clearTimeout(rt.quizT); clearTimeout(rt.quizHintT);
}
function startQuiz(r, b, who) {
  const pool = new Map();
  for (const h of r.hits || []) pool.set(h.vid, { vid: h.vid, title: h.title, author: h.author || '' });
  for (const q of r.queue || []) pool.set(q.vid, { vid: q.vid, title: q.title, author: q.author || '' });
  if (pool.size < 3) return 'Нужно хотя бы 3 трека, которые играли в комнате или стоят в очереди';
  const rounds = Math.min(QUIZ_ROUNDS.includes(Number(b.rounds)) ? Number(b.rounds) : 10, pool.size);
  r.quiz = {
    qid: id(6), by: who, len: QUIZ_LENS.includes(Number(b.len)) ? Number(b.len) : 15,
    order: shuffle([...pool.values()]).slice(0, rounds), idx: -1, scores: {}, state: 'between', round: null,
  };
  clearTimeout(runtime(r).musicT);
  quizNext(r);
  return null;
}
function quizNext(r) {
  const z = r.quiz;
  if (!z) return;
  quizClear(r);
  z.idx++;
  if (z.idx >= z.order.length) return quizFinish(r);
  const t = z.order[z.idx];
  const now = Date.now();
  const offset = 25 + crypto.randomInt(0, 40); // фрагмент из середины, а не вступление
  r.music = { vid: t.vid, title: t.title, author: t.author, by: 'Угадай мелодию', startedAt: now - offset * 1000, pausedAt: null, duration: 0, quiz: true };
  z.state = 'playing';
  z.round = {
    n: z.idx + 1, startsAt: now, endsAt: now + (z.len + 2) * 1000, hintAt: now + Math.round(z.len * 0.65 * 1000) + 1000,
    guessed: [], tries: {}, answer: quizAnswers(t), reveal: null,
  };
  const rt = runtime(r), qid = z.qid, n = z.round.n;
  rt.quizT = setTimeout(() => quizReveal(r, qid, n), (z.len + 2) * 1000);
  rt.quizHintT = setTimeout(() => { if (r.quiz?.qid === qid && r.quiz.state === 'playing') pushState(r); }, z.round.hintAt - now + 50);
  pushState(r);
}
function quizReveal(r, qid, n, note) {
  const z = r.quiz;
  if (!z || z.qid !== qid || z.state !== 'playing' || z.round.n !== n) return;
  quizClear(r);
  const t = z.order[z.idx];
  z.state = 'reveal';
  z.round.reveal = { vid: t.vid, title: t.title, author: t.author, note: note || '' };
  pushState(r);
  runtime(r).quizT = setTimeout(() => { if (r.quiz?.qid === qid) quizNext(r); }, 7000);
}
function quizFinish(r) {
  const z = r.quiz;
  quizClear(r);
  if (r.music?.quiz) r.music = null;
  z.state = 'final';
  const top = Object.entries(z.scores).sort((a, b) => b[1].pts - a[1].pts)[0];
  if (top && top[1].pts > 0) {
    z.winner = top[0];
    r.quizWins ||= {};
    r.quizWins[top[0]] = (r.quizWins[top[0]] || 0) + 1;
  }
  pushState(r);
}

// ---------- тексты песен для караоке: LRCLIB (открытая база текстов с таймингами) ----------
const LRC_UA = { 'User-Agent': 'Reelette karaoke (https://github.com/oINCLUDEo/Reelette)' };
// Название с YouTube чистим от «(Karaoke Version)», «[Official Video]» и т. п., канал «… - Topic» — это исполнитель.
function songQuery(title, author) {
  const noise = /(karaoke|караоке|lyrics?|текст|official|video|клип|audio|минус|instrumental|version|remaster|hd|4k|mv)/i;
  let t = String(title || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\(([^)]*)\)/g, (all, inner) => (noise.test(inner) ? ' ' : all))
    .replace(/\b(karaoke|караоке|lyrics|official (music )?video|минус|instrumental)\b/gi, ' ')
    .replace(/[|•]+/g, ' ').replace(/\s+/g, ' ').trim();
  let artist = String(author || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '').trim();
  if (/sing king|karaoke|караоке|zzang|stingray|singstar/i.test(author || '')) {
    // у караоке-каналов в начале названия часто стоит имя канала: «Sing King - Song»
    const ch = String(author || '').trim();
    if (ch && t.toLowerCase().startsWith(ch.toLowerCase())) t = t.slice(ch.length).replace(/^\s*[-–—:|]\s*/, '');
    artist = '';
  }
  return { q: t, artist };
}
function parseLrc(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const times = [...line.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!times.length) continue;
    const words = line.replace(/\[[^\]]*\]/g, '').trim();
    for (const tm of times) out.push({ t: Math.round((Number(tm[1]) * 60 + Number(tm[2])) * 100) / 100, text: words.slice(0, 200) });
  }
  return out.sort((a, b) => a.t - b.t).slice(0, 600);
}
const toLyrics = x => ({
  id: x.id, track: str(x.trackName || '', 120), artist: str(x.artistName || '', 120), duration: Number(x.duration) || 0,
  synced: x.syncedLyrics ? parseLrc(x.syncedLyrics) : null,
  plain: x.syncedLyrics ? '' : str(x.plainLyrics || '', 8000),
  offset: 0,
});
const lrcSearch = q => getJson(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, LRC_UA).then(a => (Array.isArray(a) ? a : []));
async function loadLyrics(r) {
  const mu = r.music;
  if (!mu || mu.lyrics) return;
  mu.lyrics = { loading: true };
  const { q, artist } = songQuery(mu.title, mu.author);
  let list = [];
  try {
    list = await lrcSearch(artist ? `${artist} ${q}` : q);
    if (!list.length && artist) list = await lrcSearch(q);
  } catch (e) { console.warn('Текст песни:', e.message); }
  if (r.music !== mu) return;
  const pick = bestLyrics(list, { q, artist, duration: mu.duration || 0 });
  mu.lyrics = pick ? { ...toLyrics(pick), auto: true, withDuration: Boolean(mu.duration) } : { none: true, q: artist ? `${artist} ${q}` : q };
  pushState(r);
}
// Выбираем лучший вариант: совпадение исполнителя и названия, тайминги, близкая длительность;
// live, ремиксы и каверы штрафуются, если их не было в запросе.
function bestLyrics(list, { q, artist, duration }) {
  const n = x => String(x || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const query = n(q), art = n(artist);
  const extra = /\b(live|remix|cover|acoustic|version|instrumental|karaoke|sped up|slowed)\b/i;
  let best = null, bestScore = -Infinity;
  for (const x of list) {
    if (!x.syncedLyrics && !x.plainLyrics) continue;
    const track = n(x.trackName), who = n(x.artistName);
    let sc = x.syncedLyrics ? 3 : 0;
    if (art && (who.includes(art) || art.includes(who))) sc += 3;
    if (track && (query.includes(track) || track.includes(query))) sc += 3;
    if (query.split(' ').some(w => w.length > 2 && who.includes(w))) sc += 1;
    if (extra.test(x.trackName || '') && !extra.test(q)) sc -= 3;
    if (duration && x.duration) sc += Math.abs(x.duration - duration) < 4 ? 3 : Math.abs(x.duration - duration) < 12 ? 1 : -2;
    if (sc > bestScore) { bestScore = sc; best = x; }
  }
  return best;
}
// Трек закончился или его пропустили: следующий из очереди, а если очередь пуста — текущий по кругу.
function advanceMusic(r) {
  if (!rooms[r.id] || !r.music || r.music.quiz) return;
  r.queue ||= [];
  if (r.queue.length) playTrack(r, r.queue.shift());
  else {
    const mu = r.music;
    r.lastTrack = { vid: mu.vid, title: mu.title, author: mu.author, by: mu.by, singer: mu.singer, singerPid: mu.singerPid, duration: mu.duration || 0 };
    r.music = null;
    clearTimeout(runtime(r).musicT);
  }
  pushState(r);
}
function scheduleMusic(r) {
  const rt = runtime(r);
  clearTimeout(rt.musicT);
  const mu = r.music;
  if (!mu || mu.pausedAt != null || !mu.duration) return;
  const left = mu.duration * 1000 - (Date.now() - mu.startedAt);
  rt.musicT = setTimeout(() => advanceMusic(r), Math.max(0, left) + 400);
}

function ytKey(u) {
  const s = String(u || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : '';
}

// Длительность, жанры и трейлер. Поиск их не отдаёт, поэтому догружаем в фоне после добавления.
async function fetchDetails(f) {
  if (f.source === 'tmdb' && TMDB_KEY) {
    const [type, tid] = f.sourceId.split('/');
    if (!/^(movie|tv)$/.test(type) || !/^\d+$/.test(tid)) return;
    const bearer = TMDB_KEY.length > 40;
    const u = `https://api.themoviedb.org/3/${type}/${tid}?language=ru-RU&append_to_response=videos,external_ids&include_video_language=ru,en,null${bearer ? '' : `&api_key=${TMDB_KEY}`}`;
    const j = await getJson(u, bearer ? { Authorization: `Bearer ${TMDB_KEY}` } : {});
    f.runtime = Number(j.runtime || j.episode_run_time?.[0] || 0) || 0;
    if (j.genres?.length) f.genres = j.genres.map(g => str(g.name, 30).toLowerCase()).slice(0, 3);
    if (!f.overview && j.overview) f.overview = str(j.overview, 2000);
    const vids = (j.videos?.results || []).filter(v => v.site === 'YouTube');
    const pick = ['Trailer', 'Teaser'].flatMap(t => [vids.find(v => v.type === t && v.iso_639_1 === 'ru'), vids.find(v => v.type === t)]).find(Boolean) || vids[0];
    f.trailer = pick ? str(pick.key, 20) : '';
    if (/^tt\d+$/.test(j.external_ids?.imdb_id || '')) f.imdbId = j.external_ids.imdb_id;
  } else if (f.source === 'kinopoisk' && KP_KEY) {
    const base = `https://kinopoiskapiunofficial.tech/api/v2.2/films/${encodeURIComponent(f.sourceId)}`;
    const j = await getJson(base, { 'X-API-KEY': KP_KEY });
    f.runtime = Number(j.filmLength) || 0;
    if (!f.overview) f.overview = str(j.description || j.shortDescription || '', 2000);
    if (j.ratingKinopoisk) f.rating = String(j.ratingKinopoisk);
    if (j.posterUrlPreview) f.poster = j.posterUrlPreview;
    if (j.genres?.length) f.genres = j.genres.map(g => str(g.genre, 30).toLowerCase()).slice(0, 3);
    try {
      const v = await getJson(base + '/videos', { 'X-API-KEY': KP_KEY });
      f.trailer = (v.items || []).map(x => ytKey(x.url)).find(Boolean) || '';
    } catch { f.trailer = ''; }
    f.kpId = String(f.sourceId);
    if (/^tt\d+$/.test(j.imdbId || '')) f.imdbId = String(j.imdbId);
  } else return;
  f.detailsAt = Date.now();
}

const needsDetails = f => !f.detailsAt;

// ---------- Kodik: плеер для выпавшего фильма ----------
// Что есть в базе Kodik, спрашиваем через kodikwrapper (нужен свой токен, KODIK_TOKEN).
// Сам плеер встраивается страницей find-player: она подписывает домен сама, поэтому
// работает и без токена — ей нужен только id фильма на Кинопоиске или IMDb.
const KODIK_TOKEN = envClean('KODIK_TOKEN');
const KODIK_API_URL = envClean('KODIK_API_URL');
const KODIK_TTL = 6 * 3600_000;

let kodikLib; // false, если пакет не установлен
let kodikClient = null;
let kodikClientAt = 0;
function kodikModule() {
  if (kodikLib === undefined) {
    try { kodikLib = require('kodikwrapper'); }
    catch { kodikLib = false; console.warn('kodikwrapper не установлен (npm i): плеер будет искать фильм сам, без списка озвучек'); }
  }
  return kodikLib;
}
// Клиент живёт 12 часов: публичный токен Kodik иногда меняется
async function kodikApi() {
  const lib = kodikModule();
  if (!lib) return null;
  if (kodikClient && Date.now() - kodikClientAt < 12 * 3600_000) return kodikClient;
  const token = KODIK_TOKEN || await lib.getPublicToken();
  kodikClient = lib.Client.fromToken(token, KODIK_API_URL ? { kodikApiUrl: KODIK_API_URL } : undefined);
  kodikClientAt = Date.now();
  return kodikClient;
}

const qRank = s => (/2160|4k/i.test(s) ? 4 : /1080/.test(s) ? 3 : /720/.test(s) ? 2 : 1);
// Одна озвучка — одна строка: из нескольких качеств оставляем лучшее
function kodikItems(list) {
  const by = new Map();
  for (const mat of list) {
    if (!mat.link) continue;
    const item = {
      translation: str(mat.translation?.title, 60) || 'Озвучка',
      subs: mat.translation?.type === 'subtitles',
      quality: str(mat.quality, 40),
      camrip: Boolean(mat.camrip),
      serial: /serial|multi-part/.test(String(mat.type || '')),
      seasons: Math.max(0, num(mat.last_season, 0)),
      episodes: Math.max(0, num(mat.last_episode, 0) || num(mat.episodes_count, 0)),
    };
    const key = String(mat.translation?.id || mat.id);
    const cur = by.get(key);
    if (!cur || qRank(item.quality) > qRank(cur.quality)) by.set(key, item);
  }
  return [...by.values()]
    .sort((a, b) => a.camrip - b.camrip || a.subs - b.subs || qRank(b.quality) - qRank(a.quality))
    .slice(0, 12);
}

const kodikIds = f => {
  const kp = f.kpId || (f.source === 'kinopoisk' ? f.sourceId : '');
  if (/^\d+$/.test(String(kp))) return { kinopoiskID: String(kp) };
  if (/^tt\d+$/.test(String(f.imdbId || ''))) return { imdbID: String(f.imdbId) };
  return null;
};

async function kodikLookup(f) {
  const out = { find: kodikIds(f), items: [], api: false };
  const client = await kodikApi();
  if (!client) return out;
  // по id точнее всего, по названию — если id нет или в базе фильм лежит под другим id
  const tries = [];
  if (out.find?.kinopoiskID) tries.push({ kinopoisk_id: Number(out.find.kinopoiskID) });
  if (out.find?.imdbID) tries.push({ imdb_id: out.find.imdbID });
  tries.push({ title: f.title, ...(/^\d{4}$/.test(f.year || '') ? { year: Number(f.year) } : {}) });
  for (const q of tries) {
    let found;
    try {
      found = await client.search({ ...q, limit: 40, with_seasons: true });
    } catch (e) {
      // чаще всего «неверный токен»: у публичного токена поиска нет, остаётся встроить плеер как есть
      console.warn(`Kodik: поиск не ответил (${e.message})`);
      return out;
    }
    out.api = true;
    out.items = kodikItems(found.results || []);
    if (!out.items.length) continue;
    if (!out.find) {
      const m = (found.results || []).find(x => x.kinopoisk_id || x.imdb_id || x.shikimori_id);
      if (m?.kinopoisk_id) out.find = { kinopoiskID: String(m.kinopoisk_id) };
      else if (m?.imdb_id) out.find = { imdbID: String(m.imdb_id) };
      else if (m?.shikimori_id) out.find = { shikimoriID: String(m.shikimori_id) };
    }
    return out;
  }
  return out;
}

const kodikCache = new Map(); // id фильма → что нашли, на 6 часов
async function kodikFor(f) {
  const hit = kodikCache.get(f.id);
  if (hit && Date.now() - hit.at < KODIK_TTL) return hit.data;
  const data = await kodikLookup(f);
  if (kodikCache.size > 400) kodikCache.clear();
  kodikCache.set(f.id, { at: Date.now(), data });
  return data;
}

const enrichQueue = [];
const enrichQueued = new Set();
const enrichFailed = new Set(); // не повторяем до перезапуска, чтобы не долбить API
let enrichActive = 0;
function queueEnrich(r) {
  for (const f of r.films) {
    if (!f.source || !f.sourceId || !needsDetails(f) || enrichQueued.has(f.id) || enrichFailed.has(f.id)) continue;
    if ((f.source === 'tmdb' && !TMDB_KEY) || (f.source === 'kinopoisk' && !KP_KEY)) continue;
    enrichQueued.add(f.id);
    enrichQueue.push([r, f]);
  }
  pumpEnrich();
}
function pumpEnrich() {
  while (enrichActive < 3 && enrichQueue.length) {
    const [r, f] = enrichQueue.shift();
    enrichActive++;
    fetchDetails(f)
      .catch(e => { enrichFailed.add(f.id); console.warn(`Детали «${f.title}»: ${e.message}`); })
      .finally(() => {
        enrichActive--;
        enrichQueued.delete(f.id);
        if (rooms[r.id] && r.films.includes(f)) schedulePush(r);
        pumpEnrich();
      });
  }
}
const pushTimers = new Map();
function schedulePush(r) {
  if (pushTimers.has(r.id)) return;
  pushTimers.set(r.id, setTimeout(() => { pushTimers.delete(r.id); if (rooms[r.id]) pushState(r); }, 500));
}

async function getJson(url, headers) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 200_000) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { reject(new Error('bad json')); } });
  });
}
function serveStatic(res, file) {
  const p = path.join(PUBLIC_DIR, file);
  if (!p.startsWith(PUBLIC_DIR) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(p).pipe(res);
  return true;
}

function makeFilm(b, addedBy, addedById) {
  return {
    id: id(8),
    title: str(b.title, 160) || 'Без названия',
    original: str(b.original, 160), year: str(String(b.year || ''), 4),
    poster: /^https:\/\//.test(b.poster || '') ? str(b.poster, 500) : '',
    overview: str(b.overview, 2000), rating: str(String(b.rating || ''), 6),
    genres: Array.isArray(b.genres) ? b.genres.slice(0, 3).map(g => str(g, 30).toLowerCase()) : [],
    runtime: Math.max(0, Math.round(num(b.runtime, 0))),
    trailer: /^[\w-]{11}$/.test(b.trailer || '') ? b.trailer : '',
    url: /^https:\/\//.test(b.url || '') ? str(b.url, 500) : '',
    source: str(b.source, 20), sourceId: str(b.sourceId, 40),
    weight: 1,
    addedBy, addedById: addedById || '', addedAt: Date.now(), votes: [],
  };
}
const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // без "api"
  const m = req.method;

  const me = auth.user(req);
  if (parts[0] === 'me') return json(res, 200, { user: me, discord: auth.enabled });

  if (parts[0] === 'config') return json(res, 200, { provider: PROVIDER === 'none' || (!KP_KEY && !TMDB_KEY) ? 'none' : PROVIDER });

  if (parts[0] === 'profile' && m === 'POST') {
    const b = await readBody(req);
    const pid = personKey(me, b);
    if (!pid) return json(res, 400, { error: 'Не понятно, чей профиль' });
    profiles[pid] = { ...cleanProfile(b), at: Date.now() };
    saveProfiles();
    for (const set of clients.values()) for (const c of set) send(c.res, { type: 'profiles', profiles });
    return json(res, 200, { ok: true });
  }

  if (parts[0] === 'search' && m === 'GET') {
    const q = str(url.searchParams.get('q'), 100);
    if (q.length < 2) return json(res, 200, { results: [] });
    try { return json(res, 200, { results: await searchMovies(q) }); }
    catch (e) { return json(res, 502, { error: `Сервис фильмов не ответил (${e.message})` }); }
  }

  if (parts[0] !== 'rooms') return json(res, 404, { error: 'Нет такого метода' });

  if (parts.length === 1 && m === 'POST') {
    const b = await readBody(req);
    const r = { id: id(8), name: str(b.name, 60) || 'Киновечер', owner: personKey(me, b), createdAt: Date.now(), films: [], history: [], eliminated: [], angle: 0, webhook: '', spin: null, plan: null };
    rooms[r.id] = r; save();
    return json(res, 201, { id: r.id });
  }

  const r = rooms[parts[1]];
  if (!r) return json(res, 404, { error: 'Комната не найдена' });
  const sub = parts[2];

  if (!sub && m === 'GET') { queueEnrich(r); return json(res, 200, publicState(r)); }

  if (sub === 'events' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const c = me
      ? { res, name: me.name, avatar: me.avatar, cid: 'd' + me.id, pid: 'd' + me.id }
      : { res, name: str(url.searchParams.get('name'), 32) || 'Гость', avatar: '', cid: str(url.searchParams.get('cid'), 32) || id(6) };
    if (!c.pid) c.pid = 'g' + c.cid;
    if (!clients.has(r.id)) clients.set(r.id, new Set());
    clients.get(r.id).add(c);
    queueEnrich(r);
    send(res, { type: 'state', state: publicState(r), now: Date.now() });
    presence(r.id);
    req.on('close', () => { clients.get(r.id)?.delete(c); presence(r.id); });
    return;
  }

  const b = m === 'GET' || m === 'DELETE' ? { cid: url.searchParams.get('cid') || '' } : await readBody(req);
  const who = me?.name || str(b.by, 32) || 'Гость';
  b.by = who;

  if (!sub && m === 'PATCH') {
    if (b.addLock !== undefined) {
      if (!isOwner(r, me, b)) return json(res, 403, { error: 'Закрыть добавление может только создатель комнаты' });
      r.addLock = Boolean(b.addLock);
    }
    if (b.spinLock !== undefined) {
      if (!isOwner(r, me, b)) return json(res, 403, { error: 'Закрыть прокруты может только создатель комнаты' });
      r.spinLock = Boolean(b.spinLock);
    }
    if (b.karaoke !== undefined) {
      if (r.spin || r.duel) return json(res, 409, { error: 'Дождитесь конца прокрута или дуэли' });
      r.karaoke = Boolean(b.karaoke);
      if (r.karaoke && r.music) loadLyrics(r);
    }
    if (b.fair !== undefined) {
      if (r.spin || r.duel) return json(res, 409, { error: 'Это можно менять, когда колесо стоит' });
      r.fair = Boolean(b.fair);
      r.plan = null;
    }
    if (b.filters !== undefined) {
      if (r.spin || r.duel) return json(res, 409, { error: 'Фильтры можно менять, когда колесо стоит' });
      r.filters = cleanFilters(b.filters);
      // набор фильмов изменился, серия на выбывание начинается заново
      r.eliminated = []; r.plan = null;
      const rt = runtime(r);
      rt.series = false; clearTimeout(rt.next); rt.next = null;
    }
    if (b.name !== undefined) r.name = str(b.name, 60) || r.name;
    if (b.webhook !== undefined) {
      const w = str(b.webhook, 300);
      if (w && !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(w)) return json(res, 400, { error: 'Это не похоже на вебхук Discord' });
      r.webhook = w;
    }
    pushState(r); return json(res, 200, { ok: true });
  }

  if (!sub && m === 'DELETE') {
    if (ownerKey(r) && !isOwner(r, me, b)) return json(res, 403, { error: 'Удалить комнату может только тот, кто её создал' });
    const rt = runtime(r);
    clearTimeout(rt.finish); clearTimeout(rt.next); clearTimeout(rt.duelAuto); clearTimeout(rt.duelNext); clearTimeout(rt.musicT);
    runtimes.delete(r.id);
    delete rooms[r.id];
    save();
    broadcast(r.id, { type: 'deleted' });
    for (const c of clients.get(r.id) || []) c.res.end();
    clients.delete(r.id);
    return json(res, 200, { ok: true });
  }

  // Отменяет отсчёт перед прокрутом или останавливает серию после текущего прокрута.
  if (sub === 'stop' && m === 'POST') {
    if (r.spinLock && !isOwner(r, me, b)) return json(res, 403, { error: 'Крутить сейчас может только создатель комнаты' });
    const rt = runtime(r);
    rt.series = false;
    clearTimeout(rt.next); rt.next = null;
    if (r.spin && Date.now() < r.spin.startedAt) {
      clearTimeout(rt.finish); rt.finish = null;
      r.spin = null;
      broadcast(r.id, { type: 'cancel', by: who });
    }
    pushState(r); return json(res, 200, { ok: true });
  }

  if (sub === 'claim' && m === 'POST') {
    if (ownerKey(r)) return json(res, 409, { error: 'У комнаты уже есть создатель' });
    const pid = personKey(me, b);
    if (!pid) return json(res, 400, { error: 'Не понятно, кто вы' });
    r.owner = pid;
    pushState(r); return json(res, 200, { ok: true });
  }

  // ---- общая музыка из YouTube: у всех один трек и одна позиция, общая очередь ----
  // startedAt — момент, когда трек был на нуле; pausedAt — позиция в секундах, если на паузе.
  // чат комнаты: сообщения пролетают по сцене, последние 50 хранятся
  if (sub === 'chat' && m === 'POST') {
    const text = str(b.text, 200).replace(/\s+/g, ' ');
    if (!text) return json(res, 400, { error: 'Пустое сообщение' });
    const pid = personKey(me, b) || 'anon';
    const rt = runtime(r);
    rt.chatRx ||= new Map();
    const now = Date.now();
    const recent = (rt.chatRx.get(pid) || []).filter(t => now - t < 5000);
    if (recent.length >= 5) return json(res, 429, { error: 'Не так быстро' });
    recent.push(now); rt.chatRx.set(pid, recent);
    const msg = { id: id(6), pid, name: who, avatar: me?.avatar || '', text, at: now };
    r.chat ||= [];
    r.chat.push(msg);
    r.chat = r.chat.slice(-50);
    save();
    broadcast(r.id, { type: 'chat', msg });
    return json(res, 200, { ok: true });
  }

  // «Угадай мелодию»
  if (sub === 'quiz' && m === 'POST') {
    const action = parts[3];
    if (action === 'start') {
      if (r.spin || r.duel) return json(res, 409, { error: 'Дождитесь конца прокрута или дуэли' });
      if (r.quiz && r.quiz.state !== 'final') return json(res, 409, { error: 'Игра уже идёт' });
      const err = startQuiz(r, b, who);
      return err ? json(res, 400, { error: err }) : json(res, 200, { ok: true });
    }
    const z = r.quiz;
    if (!z) return json(res, 409, { error: 'Игра не идёт' });
    if (action === 'stop') {
      quizClear(r);
      r.quiz = null;
      if (r.music?.quiz) r.music = null;
      pushState(r); return json(res, 200, { ok: true });
    }
    if (action === 'skip') {
      if (z.state === 'playing') quizReveal(r, z.qid, z.round.n);
      else if (z.state === 'reveal') quizNext(r);
      return json(res, 200, { ok: true });
    }
    if (action === 'guess') {
      if (z.state !== 'playing') return json(res, 200, { ok: true, late: true });
      const rd = z.round;
      const pid = personKey(me, b) || 'anon';
      if (rd.guessed.some(g => g.pid === pid)) return json(res, 200, { ok: true, already: true });
      rd.tries[pid] = (rd.tries[pid] || 0) + 1;
      if (rd.tries[pid] > 25) return json(res, 429, { error: 'Слишком много попыток' });
      const text = str(b.text, 80);
      const score = quizScore(text, rd.answer);
      if (score >= 0.78) {
        const pts = [3, 2][rd.guessed.length] || 1;
        rd.guessed.push({ pid, name: who, pts });
        z.scores[pid] ||= { name: who, pts: 0 };
        z.scores[pid].pts += pts;
        z.scores[pid].name = who;
        broadcast(r.id, { type: 'quiz-guess', ok: true, pid, name: who, pts });
        // угадали все, кто в комнате, — раунд заканчиваем раньше
        const present = new Set([...(clients.get(r.id) || [])].map(c => c.pid));
        if (present.size && [...present].every(p => rd.guessed.some(g => g.pid === p))) {
          const qid = z.qid, n = rd.n;
          setTimeout(() => quizReveal(r, qid, n), 900);
        }
        pushState(r);
        return json(res, 200, { ok: true, correct: true, pts });
      }
      // неверная версия пролетает по сцене как сообщение
      broadcast(r.id, { type: 'chat', msg: { id: id(6), pid, name: who, text, at: Date.now(), guess: true, close: score >= 0.55 } });
      return json(res, 200, { ok: true, correct: false, close: score >= 0.55 });
    }
  }

  // броски: помидор, яйцо, торт, роза — летят в точку на сцене у всех.
  // В караоке попадание в видео засчитывается певцу текущего выступления.
  if (sub === 'throw' && m === 'POST') {
    const item = str(b.item, 10);
    if (!['tomato', 'egg', 'pie', 'rose'].includes(item)) return json(res, 400, { error: 'Этим не бросить' });
    const x = Math.min(1, Math.max(0, num(b.x, 0.5))), y = Math.min(1, Math.max(0, num(b.y, 0.5)));
    const pid = personKey(me, b) || 'anon';
    const rt = runtime(r);
    rt.throwRx ||= new Map();
    const now = Date.now();
    const recent = (rt.throwRx.get(pid) || []).filter(t => now - t < 3000);
    if (recent.length >= 5) return json(res, 429, { error: 'Перезаряжаемся' });
    recent.push(now); rt.throwRx.set(pid, recent);
    let scored = false;
    if (b.onStage && r.karaoke && r.music?.perfId) {
      const perf = (r.perfs || []).find(p => p.perfId === r.music.perfId);
      if (perf && !(perf.singerPid && perf.singerPid === pid)) {
        perf.items ||= {};
        perf.items[item] = (perf.items[item] || 0) + 1;
        scored = true;
      }
    }
    broadcast(r.id, { type: 'throw', item, x, y, pid, name: who, seed: crypto.randomInt(0, 1e6) });
    if (scored) pushState(r);
    return json(res, 200, { ok: true });
  }

  // реакции: летят у всех, не хранятся; у каждого лимит, считаем для бейджа
  // Kodik: что есть в базе для этого фильма (озвучки, качество, сериал ли)
  if (sub === 'kodik' && m === 'GET') {
    const f = r.films.find(x => x.id === parts[3]) || r.history.find(h => h.film.id === parts[3])?.film;
    if (!f) return json(res, 404, { error: 'Фильм не найден' });
    try { return json(res, 200, await kodikFor(f)); }
    catch (e) { return json(res, 502, { error: `Kodik не ответил (${e.message})` }); }
  }

  // «Включить всем»: у всех в комнате открывается плеер с этим фильмом
  if (sub === 'kodik' && m === 'POST') {
    const f = r.films.find(x => x.id === parts[3]) || r.history.find(h => h.film.id === parts[3])?.film;
    if (!f) return json(res, 404, { error: 'Фильм не найден' });
    broadcast(r.id, { type: 'watch', filmId: f.id, title: f.title, by: who, pid: personKey(me, b) });
    return json(res, 200, { ok: true });
  }

  if (sub === 'react' && m === 'POST') {
    const kind = str(b.kind, 12);
    if (!REACTIONS.includes(kind)) return json(res, 400, { error: 'Нет такой реакции' });
    const pid = personKey(me, b) || 'anon';
    const rt = runtime(r);
    rt.rx ||= new Map();
    const now = Date.now();
    const recent = (rt.rx.get(pid) || []).filter(t => now - t < 2500);
    if (recent.length >= 10) return json(res, 429, { error: 'Слишком часто' });
    recent.push(now);
    rt.rx.set(pid, recent);
    r.reacts ||= {};
    r.reacts[pid] = (r.reacts[pid] || 0) + 1;
    save();
    broadcast(r.id, { type: 'react', kind, name: who, pid });
    return json(res, 200, { ok: true });
  }

  // оценка выступления в караоке, себя оценить нельзя
  if (sub === 'karaoke' && parts[3] === 'rate' && m === 'POST') {
    const perf = (r.perfs || []).find(p => p.perfId === str(b.perfId, 12));
    if (!perf) return json(res, 404, { error: 'Выступление не найдено' });
    const pid = personKey(me, b);
    if (!pid) return json(res, 400, { error: 'Не понятно, кто оценивает' });
    if (perf.singerPid && perf.singerPid === pid) return json(res, 400, { error: 'Себя оценивают остальные' });
    const score = Math.round(num(b.score, 0));
    if (score >= 1 && score <= 10) perf.ratings[pid] = { score, name: who };
    else delete perf.ratings[pid];
    pushState(r); return json(res, 200, { ok: true });
  }

  if (sub === 'music' && m === 'POST') {
    const action = parts[3];
    r.queue ||= [];
    if (r.quiz && r.music?.quiz && ['next', 'restart', 'toggle'].includes(action)) return json(res, 409, { error: 'Идёт «Угадай мелодию»' });
    if (!action) {
      if (b.now && r.quiz && r.music?.quiz) return json(res, 409, { error: 'Идёт «Угадай мелодию»' });
      const t = await fetchTrack(b.url);
      if (t.error) return json(res, 400, { error: t.error });
      if (t.vid === 'RnMVb0lJ8LI') broadcast(r.id, { type: 'react', kind: 'crow', name: who, pid: personKey(me, b) });
      // кто поёт (для караоке): по умолчанию тот, кто добавил
      const singer = str(b.singer, 32);
      const track = { ...t, by: who, singer: singer || who, singerPid: !singer || singer === who ? personKey(me, b) : '' };
      if (!r.music || b.now) playTrack(r, track);
      else {
        if (r.queue.length >= 50) return json(res, 400, { error: 'В очереди уже 50 треков' });
        r.queue.push({ ...track, qid: id(6) });
      }
      pushState(r); return json(res, 200, { ok: true, queued: Boolean(r.music && r.music.vid !== track.vid) && !b.now });
    }
    if (action === 'remove') { r.queue = r.queue.filter(q => q.qid !== str(b.qid, 12)); pushState(r); return json(res, 200, { ok: true }); }
    if (action === 'up') {
      const i = r.queue.findIndex(q => q.qid === str(b.qid, 12));
      if (i > 0) r.queue.unshift(...r.queue.splice(i, 1));
      pushState(r); return json(res, 200, { ok: true });
    }
    // ручной поиск текста, если подобрался не тот
    if (action === 'lyrics' && parts[4] === 'search') {
      const q = str(b.q, 120);
      if (q.length < 2) return json(res, 200, { results: [] });
      try {
        const list = await lrcSearch(q);
        return json(res, 200, { results: list.slice(0, 8).map(x => ({ id: x.id, track: x.trackName, artist: x.artistName, duration: Math.round(x.duration || 0), synced: Boolean(x.syncedLyrics) })) });
      } catch (e) { return json(res, 502, { error: 'База текстов не ответила' }); }
    }
    if (action === 'hits' && parts[4] === 'remove') {
      if (!isOwner(r, me, b)) return json(res, 403, { error: 'Убирать из хитов может создатель комнаты' });
      r.hits = (r.hits || []).filter(h => h.vid !== str(b.vid, 11));
      pushState(r); return json(res, 200, { ok: true });
    }
    // перезапуск: текущий трек с начала, а если музыка уже остановилась — последний трек ещё раз
    if (action === 'restart') {
      if (r.music) {
        r.music.startedAt = Date.now();
        if (r.music.pausedAt != null) r.music.pausedAt = 0;
        r.music.by = who;
        scheduleMusic(r);
      } else if (r.lastTrack) {
        playTrack(r, { ...r.lastTrack, by: who });
      } else return json(res, 409, { error: 'Нечего перезапускать' });
      pushState(r); return json(res, 200, { ok: true });
    }
    if (!r.music) return json(res, 409, { error: 'Музыка не играет' });
    if (action === 'lyrics' && parts[4] === 'set') {
      try {
        const x = await getJson(`https://lrclib.net/api/get/${Number(b.id) || 0}`, LRC_UA);
        r.music.lyrics = toLyrics(x);
      } catch (e) { return json(res, 502, { error: 'Не удалось загрузить текст' }); }
      pushState(r); return json(res, 200, { ok: true });
    }
    if (action === 'lyrics' && parts[4] === 'offset') {
      if (r.music.lyrics?.synced) r.music.lyrics.offset = Math.max(-60, Math.min(60, Math.round(((r.music.lyrics.offset || 0) + num(b.delta, 0)) * 10) / 10));
      pushState(r); return json(res, 200, { ok: true });
    }
    if (action === 'next') { advanceMusic(r); return json(res, 200, { ok: true }); }
    if (r.music.quiz && r.quiz) {
      if (action === 'failed' && r.music.vid === str(b.vid, 11) && r.quiz.state === 'playing') quizReveal(r, r.quiz.qid, r.quiz.round.n, 'Этот трек не играет на сайте, раунд пропущен');
      if (['ended', 'failed', 'duration'].includes(action)) return json(res, 200, { ok: true });
      if (['next', 'restart', 'toggle'].includes(action)) return json(res, 409, { error: 'Идёт «Угадай мелодию»' });
    }
    if (action === 'ended' || action === 'failed') {
      const same = r.music.vid === str(b.vid, 11) && r.music.pausedAt == null;
      if (same && (action === 'failed' || Date.now() - r.music.startedAt > 5000)) {
        if (action === 'failed') broadcast(r.id, { type: 'music-skip', title: r.music.title });
        advanceMusic(r);
      }
      return json(res, 200, { ok: true });
    }
    if (action === 'duration') {
      // длительность знает только плеер: первый, кто загрузил трек, сообщает её серверу
      const d = num(b.duration, 0);
      if (r.music.vid === str(b.vid, 11) && !r.music.duration && d > 1 && d < 6 * 3600) {
        r.music.duration = d;
        scheduleMusic(r);
        if (r.karaoke && r.music.lyrics?.auto && !r.music.lyrics.withDuration) { r.music.lyrics = null; loadLyrics(r); }
        save();
      }
      return json(res, 200, { ok: true });
    }
    if (action === 'toggle') {
      if (r.music.pausedAt != null) { r.music.startedAt = Date.now() - r.music.pausedAt * 1000; r.music.pausedAt = null; }
      else r.music.pausedAt = Math.max(0, (Date.now() - r.music.startedAt) / 1000);
      r.music.by = who;
      scheduleMusic(r);
      pushState(r); return json(res, 200, { ok: true });
    }
    if (action === 'stop') {
      r.music = null; r.queue = [];
      clearTimeout(runtime(r).musicT);
      pushState(r); return json(res, 200, { ok: true });
    }
  }

  // создатель убирает фильм из выпавших: он возвращается на колесо
  if (sub === 'history' && parts[3] && m === 'DELETE') {
    if (!isOwner(r, me, b)) return json(res, 403, { error: 'Убирать фильмы из истории может только создатель комнаты' });
    const h = r.history.find(x => x.hid === parts[3]);
    if (!h) return json(res, 404, { error: 'Этого фильма нет в истории' });
    r.history = r.history.filter(x => x !== h);
    if (h.src) {
      // бонус автора теперь задаёт его предыдущий выпавший фильм
      const a = personOf(h.film);
      r.mods ||= {};
      delete r.mods[a];
      const prev = r.history.find(x => personOf(x.film) === a);
      if (prev) {
        prev.src = true;
        const mm = modFromEntry(prev);
        if (mm && mm.factor !== 1) r.mods[a] = mm;
      }
    }
    pushState(r); return json(res, 200, { ok: true });
  }

  // оценка фильма после просмотра: свою оценку можно поменять в течение минуты
  if (sub === 'rate' && m === 'POST') {
    const h = r.history.find(x => x.hid === str(b.hid, 16));
    if (!h) return json(res, 404, { error: 'Этого фильма нет в истории' });
    const pid = personKey(me, b);
    if (!pid) return json(res, 400, { error: 'Не понятно, кто оценивает' });
    if (pid === personOf(h.film)) return json(res, 400, { error: 'Свой фильм оценивают остальные' });
    const score = Math.round(num(b.score, 0));
    h.ratings ||= {};
    const old = h.ratings[pid];
    if (old && Date.now() - (old.at || 0) > RATE_EDIT_MS) return json(res, 403, { error: 'Оценку можно менять только в первую минуту' });
    if (score >= 1 && score <= 10) h.ratings[pid] = { score, name: who, avatar: me?.avatar || '', at: old?.at || Date.now() };
    else delete h.ratings[pid];
    // оценка последнего выпавшего фильма автора обновляет его бонус
    if (h.src) {
      const a = personOf(h.film);
      const mm = modFromEntry(h);
      r.mods ||= {};
      if (mm && mm.factor !== 1) r.mods[a] = mm; else delete r.mods[a];
    }
    pushState(r); return json(res, 200, { ok: true });
  }

  if (sub === 'duel' && m === 'POST') {
    const action = parts[3];
    if (r.spinLock && !isOwner(r, me, b) && ['start', 'next', 'stop'].includes(action)) return json(res, 403, { error: 'Крутить сейчас может только создатель комнаты' });
    if (action === 'start') {
      if (r.spin || r.duel) return json(res, 409, { error: 'Сначала дождитесь конца прокрута или дуэли' });
      const err = startDuel(r, who);
      return err ? json(res, 400, { error: err }) : json(res, 200, { ok: true });
    }
    if (!r.duel) return json(res, 409, { error: 'Дуэль не идёт' });
    if (action === 'vote') {
      const voter = me ? 'd' + me.id : str(b.cid, 32);
      if (!voter) return json(res, 400, { error: 'Не понятно, кто голосует' });
      const err = voteDuel(r, voter, who, str(b.filmId, 20));
      return err ? json(res, 400, { error: err }) : json(res, 200, { ok: true });
    }
    if (action === 'next') { resolveDuel(r, r.duel.did); return json(res, 200, { ok: true }); }
    if (action === 'stop') {
      stopDuel(r);
      broadcast(r.id, { type: 'duel-stop', by: who });
      pushState(r); return json(res, 200, { ok: true });
    }
  }

  if (r.duel && sub !== 'duel') return json(res, 409, { error: 'Идёт дуэль, подождите' });
  if (r.spin && sub !== 'spin') return json(res, 409, { error: 'Колесо крутится, подождите' });

  if (sub === 'films' && !parts[3] && m === 'POST') {
    if (r.addLock && !isOwner(r, me, b)) return json(res, 403, { error: 'Создатель комнаты закрыл добавление фильмов' });
    if (r.eliminated.length || runtime(r).series) return json(res, 409, { error: 'Идёт выбывание: добавлять фильмы можно после него или после «Вернуть выбывших»' });
    const list = Array.isArray(b.films) ? b.films : [b];
    const added = [], merged = [], voted = [];
    for (const raw of list.slice(0, 100)) {
      if (r.films.length >= MAX_FILMS) break;
      const f = makeFilm(raw, who, personKey(me, b));
      const dup = r.films.find(x => (f.sourceId && x.sourceId === f.sourceId) || norm(x.title) === norm(f.title) && (x.year || '') === (f.year || ''));
      if (dup) {
        merged.push(dup.title);
        const pid = personKey(me, b);
        dup.votes ||= [];
        const used = r.films.reduce((n, x) => n + (x.votes || []).filter(v => v.id === pid).length, 0);
        if (pid && !dup.votes.some(v => v.id === pid) && used < votesFor(r, pid)) {
          dup.votes.push({ id: pid, name: who, avatar: me?.avatar || '' });
          voted.push(dup.title);
        }
        continue;
      }
      r.films.push(f); added.push(f.title);
    }
    queueEnrich(r);
    pushState(r); return json(res, 200, { added, merged, voted });
  }

  if (sub === 'films' && parts[3]) {
    const f = r.films.find(x => x.id === parts[3]);
    if (!f) return json(res, 404, { error: 'Фильм не найден' });
    if (parts[4] === 'vote' && m === 'POST') {
      const pid = personKey(me, b);
      if (!pid) return json(res, 400, { error: 'Не понятно, кто голосует' });
      f.votes ||= [];
      const i = f.votes.findIndex(v => v.id === pid);
      if (i >= 0) f.votes.splice(i, 1);
      else {
        const used = r.films.reduce((n, x) => n + (x.votes || []).filter(v => v.id === pid).length, 0);
        const max = votesFor(r, pid);
        if (used >= max) return json(res, 400, { error: `Все голоса (${max}) уже отданы. Снимите голос с другого фильма.` });
        f.votes.push({ id: pid, name: who, avatar: me?.avatar || '' });
      }
      pushState(r); return json(res, 200, { ok: true });
    }
    if (m === 'PATCH') {
      if (!isOwner(r, me, b)) return json(res, 403, { error: 'Менять вес может только создатель комнаты' });
      if (b.delta !== undefined) f.weight += Math.round(num(b.delta, 0));
      if (b.weight !== undefined) f.weight = Math.round(num(b.weight, f.weight));
      f.weight = Math.min(1000, Math.max(1, f.weight));
      pushState(r); return json(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      if (!isOwner(r, me, b) && personOf(f) !== personKey(me, b)) return json(res, 403, { error: 'Удалять чужие фильмы может только создатель комнаты' });
      r.films = r.films.filter(x => x !== f);
      r.eliminated = r.eliminated.filter(x => x !== f.id);
      if (r.plan?.winner === f.id) r.plan = null;
      pushState(r); return json(res, 200, { ok: true });
    }
  }

  if (sub === 'spin' && m === 'POST') {
    if (r.spinLock && !isOwner(r, me, b)) return json(res, 403, { error: 'Крутить сейчас может только создатель комнаты' });
    if (r.spin) return json(res, 409, { error: 'Колесо уже крутится' });
    const err = startSpin(r, b);
    return err ? json(res, 400, { error: err }) : json(res, 200, { ok: true });
  }

  if (sub === 'reset' && m === 'POST') {
    r.eliminated = []; r.plan = null;
    const rt = runtime(r);
    rt.series = false; clearTimeout(rt.next); rt.next = null;
    pushState(r); return json(res, 200, { ok: true });
  }

  if (sub === 'clear' && m === 'POST') {
    if (!isOwner(r, me, b)) return json(res, 403, { error: 'Это может только создатель комнаты' });
    if (b.what === 'history') { r.history = []; r.mods = {}; }
    else { r.films = []; r.eliminated = []; r.plan = null; }
    pushState(r); return json(res, 200, { ok: true });
  }

  return json(res, 404, { error: 'Нет такого метода' });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/auth/') && await auth.handle(req, res, url)) return;
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname === '/' || /^\/r\/[A-Za-z0-9]+\/?$/.test(url.pathname)) return serveStatic(res, 'index.html');
    // список изменений: сайт показывает новые пункты тем, кто заходил раньше
    if (url.pathname === '/changelog.md') {
      fs.readFile(path.join(__dirname, 'CHANGELOG.md'), (err, buf) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(buf);
      });
      return;
    }
    if (!serveStatic(res, decodeURIComponent(url.pathname))) { res.writeHead(404); res.end('Not found'); }
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 400, { error: e.message });
  }
}).listen(PORT, () => {
  for (const r of Object.values(rooms)) scheduleMusic(r);
  console.log(`Reelette: http://localhost:${PORT}  (поиск фильмов: ${PROVIDER}, вход через Discord: ${auth.enabled ? 'да' : 'нет'})`);
});
