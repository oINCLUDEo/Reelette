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

const auth = require('./auth')({
  dataDir: DATA_DIR,
  clientId: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  publicUrl: process.env.PUBLIC_URL,
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
for (const r of Object.values(rooms)) { r.spin = null; r.plan = null; }

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DATA_FILE + '.tmp';
      const out = {};
      for (const [id, r] of Object.entries(rooms)) out[id] = { ...r, spin: null, plan: null };
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
    id: r.id, name: r.name, createdAt: r.createdAt, owner: r.owner || '',
    films: r.films, history: r.history, eliminated: r.eliminated,
    angle: r.angle, hasWebhook: Boolean(r.webhook), spin: r.spin, series: runtime(r).series,
  };
}

// ---------- SSE ----------
const clients = new Map(); // roomId -> Set<{res, name, cid}>

function send(res, msg) { res.write(`data: ${JSON.stringify(msg)}\n\n`); }
function broadcast(roomId, msg) {
  for (const c of clients.get(roomId) || []) send(c.res, msg);
}
function presence(roomId) {
  const seen = new Map();
  for (const c of clients.get(roomId) || []) if (!seen.has(c.cid)) seen.set(c.cid, { name: c.name, avatar: c.avatar });
  broadcast(roomId, { type: 'presence', people: [...seen.values()] });
}
function pushState(r) { save(); broadcast(r.id, { type: 'state', state: publicState(r) }); }

setInterval(() => {
  for (const set of clients.values()) for (const c of set) c.res.write(': ping\n\n');
}, 25000);

// ---------- колесо ----------
function activeFilms(r) {
  return r.films.filter(f => !r.eliminated.includes(f.id) && f.weight > 0);
}
function pickWeighted(list) {
  const total = list.reduce((s, f) => s + f.weight, 0);
  let x = crypto.randomInt(0, 1e9) / 1e9 * total;
  for (const f of list) { x -= f.weight; if (x < 0) return f; }
  return list[list.length - 1];
}

function startSpin(r, { mode, duration, auto, by, delay }) {
  const list = activeFilms(r);
  if (list.length < 2) return 'Нужно хотя бы два фильма в колесе';
  mode = mode === 'elimination' ? 'elimination' : 'normal';
  duration = Math.min(60, Math.max(3, num(duration, 12)));
  delay = Math.min(15, Math.max(0, Math.round(num(delay, 0))));
  const rt = runtime(r);

  let landed;
  if (mode === 'normal') {
    landed = pickWeighted(list);
  } else {
    // Победитель выбирается сразу пропорционально весу, порядок выбывания — случайный.
    if (!r.plan || !list.some(f => f.id === r.plan.winner)) r.plan = { winner: pickWeighted(list).id };
    const losers = list.filter(f => f.id !== r.plan.winner);
    landed = losers[crypto.randomInt(0, losers.length)];
  }

  r.spin = {
    sid: id(6), mode, duration, auto: Boolean(auto) && mode === 'elimination', by: str(by, 32),
    startedAt: Date.now() + delay * 1000, delay,
    snapshot: list.map(f => ({ id: f.id, weight: f.weight })),
    filmId: landed.id,
    offset: 0.12 + (crypto.randomInt(0, 1000) / 1000) * 0.76,
    turns: Math.max(3, Math.round(duration * 0.9)),
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
  r.history.unshift({ at: Date.now(), mode, film: { ...film } });
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
  if (film.rating) embed.fields = [{ name: 'Рейтинг', value: String(film.rating), inline: true }];
  await fetch(r.webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Reelette', content: 'Колесо выбрало фильм', embeds: [embed] }),
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

async function enrich(film) {
  if (film.source !== 'kinopoisk' || !KP_KEY || film.overview) return film;
  try {
    const j = await getJson(`https://kinopoiskapiunofficial.tech/api/v2.2/films/${encodeURIComponent(film.sourceId)}`, { 'X-API-KEY': KP_KEY });
    film.overview = str(j.description || j.shortDescription || '', 2000);
    if (j.ratingKinopoisk) film.rating = String(j.ratingKinopoisk);
    if (j.posterUrlPreview) film.poster = j.posterUrlPreview;
    if (!film.genres?.length && j.genres) film.genres = j.genres.map(g => g.genre).slice(0, 3);
  } catch (e) { console.warn('enrich:', e.message); }
  return film;
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
    genres: Array.isArray(b.genres) ? b.genres.slice(0, 3).map(g => str(g, 30)) : [],
    url: /^https:\/\//.test(b.url || '') ? str(b.url, 500) : '',
    source: str(b.source, 20), sourceId: str(b.sourceId, 40),
    weight: Math.min(1000, Math.max(1, Math.round(num(b.weight, 1)))),
    addedBy, addedById: addedById || '', addedAt: Date.now(),
  };
}
const norm = s => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, '');

async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // без "api"
  const m = req.method;

  const me = auth.user(req);
  if (parts[0] === 'me') return json(res, 200, { user: me, discord: auth.enabled });

  if (parts[0] === 'config') return json(res, 200, { provider: PROVIDER === 'none' || (!KP_KEY && !TMDB_KEY) ? 'none' : PROVIDER });

  if (parts[0] === 'search' && m === 'GET') {
    const q = str(url.searchParams.get('q'), 100);
    if (q.length < 2) return json(res, 200, { results: [] });
    try { return json(res, 200, { results: await searchMovies(q) }); }
    catch (e) { return json(res, 502, { error: `Сервис фильмов не ответил (${e.message})` }); }
  }

  if (parts[0] !== 'rooms') return json(res, 404, { error: 'Нет такого метода' });

  if (parts.length === 1 && m === 'POST') {
    const b = await readBody(req);
    const r = { id: id(8), name: str(b.name, 60) || 'Киновечер', owner: me?.id || '', createdAt: Date.now(), films: [], history: [], eliminated: [], angle: 0, webhook: '', spin: null, plan: null };
    rooms[r.id] = r; save();
    return json(res, 201, { id: r.id });
  }

  const r = rooms[parts[1]];
  if (!r) return json(res, 404, { error: 'Комната не найдена' });
  const sub = parts[2];

  if (!sub && m === 'GET') return json(res, 200, publicState(r));

  if (sub === 'events' && m === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const c = me
      ? { res, name: me.name, avatar: me.avatar, cid: 'd' + me.id }
      : { res, name: str(url.searchParams.get('name'), 32) || 'Гость', avatar: '', cid: str(url.searchParams.get('cid'), 32) || id(6) };
    if (!clients.has(r.id)) clients.set(r.id, new Set());
    clients.get(r.id).add(c);
    send(res, { type: 'state', state: publicState(r), now: Date.now() });
    presence(r.id);
    req.on('close', () => { clients.get(r.id)?.delete(c); presence(r.id); });
    return;
  }

  const b = m === 'GET' || m === 'DELETE' ? {} : await readBody(req);
  const who = me?.name || str(b.by, 32) || 'Гость';
  b.by = who;

  if (!sub && m === 'PATCH') {
    if (b.name !== undefined) r.name = str(b.name, 60) || r.name;
    if (b.webhook !== undefined) {
      const w = str(b.webhook, 300);
      if (w && !/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(w)) return json(res, 400, { error: 'Это не похоже на вебхук Discord' });
      r.webhook = w;
    }
    pushState(r); return json(res, 200, { ok: true });
  }

  if (!sub && m === 'DELETE') {
    if (r.owner && r.owner !== me?.id) return json(res, 403, { error: 'Удалить комнату может только тот, кто её создал' });
    const rt = runtime(r);
    clearTimeout(rt.finish); clearTimeout(rt.next);
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

  if (r.spin && sub !== 'spin') return json(res, 409, { error: 'Колесо крутится, подождите' });

  if (sub === 'films' && !parts[3] && m === 'POST') {
    const list = Array.isArray(b.films) ? b.films : [b];
    const added = [], merged = [];
    for (const raw of list.slice(0, 100)) {
      if (r.films.length >= MAX_FILMS) break;
      const f = makeFilm(raw, who, me?.id);
      const dup = r.films.find(x => (f.sourceId && x.sourceId === f.sourceId) || norm(x.title) === norm(f.title) && (x.year || '') === (f.year || ''));
      if (dup) { dup.weight = Math.min(1000, dup.weight + 1); merged.push(dup.title); continue; }
      r.films.push(await enrich(f)); added.push(f.title);
    }
    pushState(r); return json(res, 200, { added, merged });
  }

  if (sub === 'films' && parts[3]) {
    const f = r.films.find(x => x.id === parts[3]);
    if (!f) return json(res, 404, { error: 'Фильм не найден' });
    if (m === 'PATCH') {
      if (b.delta !== undefined) f.weight += Math.round(num(b.delta, 0));
      if (b.weight !== undefined) f.weight = Math.round(num(b.weight, f.weight));
      f.weight = Math.min(1000, Math.max(1, f.weight));
      pushState(r); return json(res, 200, { ok: true });
    }
    if (m === 'DELETE') {
      r.films = r.films.filter(x => x !== f);
      r.eliminated = r.eliminated.filter(x => x !== f.id);
      if (r.plan?.winner === f.id) r.plan = null;
      pushState(r); return json(res, 200, { ok: true });
    }
  }

  if (sub === 'spin' && m === 'POST') {
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
    if (b.what === 'history') r.history = [];
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
    if (!serveStatic(res, decodeURIComponent(url.pathname))) { res.writeHead(404); res.end('Not found'); }
  } catch (e) {
    console.error(e);
    if (!res.headersSent) json(res, 400, { error: e.message });
  }
}).listen(PORT, () => console.log(`Reelette: http://localhost:${PORT}  (поиск фильмов: ${PROVIDER}, вход через Discord: ${auth.enabled ? 'да' : 'нет'})`));
