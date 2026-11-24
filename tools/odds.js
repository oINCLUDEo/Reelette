// Честность шансов: 10 000 прокрутов кодом сервера (chanceWeights + pickWeighted) против формулы из README.
// Сценарий — оценки и их снятие: тролль ставит единицы и десятки, создатель запрещает ему оценивать и снимает его оценки,
// бонусы авторов пересчитываются. Запуск: node tools/odds.js (сам поднимает сервер на 3100 с временной папкой данных).
'use strict';
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');
const ROOT = path.resolve(__dirname, '..'), SERVER = path.join(ROOT, 'server.js');
const PORT = 3100, base = `http://localhost:${PORT}`, N = 10000;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reelette-odds-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails++; };

// комната «как старая»: mods нет, сервер при запуске сам посчитает бонусы по последнему выпавшему фильму автора
const film = (id, who, extra = {}) => ({ id, title: id, weight: 1, votes: [], addedBy: who, addedById: 'g' + who, ...extra });
const rate = score => ({ score, name: 'x', at: 1 });
fs.writeFileSync(path.join(dir, 'rooms.json'), JSON.stringify({
  room1: {
    id: 'room1', name: 'Тест', owner: 'gOWN', createdAt: 1, eliminated: [], angle: 0, webhook: '', spin: null, plan: null, fair: true,
    films: [film('A1', 'A'), film('A2', 'A'), film('B1', 'B', { votes: ['gX'] }), film('C1', 'C'), film('C2', 'C'), film('C3', 'C'),
      film('Aw', 'A'), film('Bw', 'B')],
    // у A троллю не нравится (1), остальным да: средняя (1+9+9)/3 = 6,3 → ×1; у B только тролль: 10 → ×2
    history: [
      { hid: 'h1', at: 2, mode: 'normal', film: film('Aw', 'A'), ratings: { gT: rate(1), gX: rate(9), gY: rate(9) } },
      { hid: 'h2', at: 1, mode: 'normal', film: film('Bw', 'B'), ratings: { gT: rate(10) } },
    ],
  },
}));

// функции сервера без HTTP: тот же файл, http заглушен, данные из временной папки
function serverFns() {
  const req = createRequire(SERVER);
  const fake = { createServer: () => ({ listen() { return this; }, on() { return this; } }) };
  const wrap = vm.runInThisContext(`(function (require, module, exports, __dirname, __filename) {${fs.readFileSync(SERVER, 'utf8')}
;return { rooms, chanceWeights, pickWeighted, activeFilms };})`);
  process.env.DATA_DIR = dir;
  return wrap(id => (id === 'node:http' || id === 'http' ? fake : req(id)), {}, {}, ROOT, SERVER);
}

// ожидание по README: колесо поровну между авторами, доля автора — между его фильмами, голос +4 пункта, бонус умножает всё
function expected(r, list) {
  const authors = new Map();
  for (const f of list) authors.set(f.addedById, (authors.get(f.addedById) || 0) + 1);
  const w = list.map(f => ((100 / authors.size) / authors.get(f.addedById) + 4 * f.votes.length) * (r.mods?.['g' + f.addedBy]?.factor || 1));
  const s = w.reduce((a, b) => a + b, 0);
  return new Map(list.map((f, i) => [f.id, w[i] / s]));
}

function sample(label, factors) {
  const S = serverFns();
  const r = S.rooms.room1;
  for (const [pid, f] of Object.entries(factors)) check((r.mods?.[pid]?.factor || 1) === f, `${label}: множитель ${pid} = ×${f} (на сервере ×${r.mods?.[pid]?.factor || 1})`);
  const list = S.activeFilms(r), W = S.chanceWeights(r, list), exp = expected(r, list);
  const hits = new Map(list.map(f => [f.id, 0]));
  for (let i = 0; i < N; i++) { const f = S.pickWeighted(list, W); hits.set(f.id, hits.get(f.id) + 1); }
  console.log(`\n${label}: ${N} прокрутов, ${list.length} фильмов`);
  console.log('фильм  ждём    вышло   откл.');
  for (const f of list) {
    const p = exp.get(f.id), got = hits.get(f.id) / N, sd = Math.sqrt(p * (1 - p) / N);
    const ok = Math.abs(got - p) < 4 * sd;
    console.log(`${f.id.padEnd(6)} ${(p * 100).toFixed(2).padStart(5)}%  ${(got * 100).toFixed(2).padStart(5)}%  ${((got - p) / sd).toFixed(1).padStart(5)}σ ${ok ? '' : '← FAIL'}`);
    if (!ok) fails++;
  }
  console.log('');
}

async function server(fn) {
  const p = spawn(process.execPath, [SERVER], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), DATA_DIR: dir }, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/'); break; } catch { await sleep(100); } }
  try { await fn(); } finally { await sleep(800); p.kill(); await sleep(300); } // save() пишет файл через 300 мс
}
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, body: await r.json() }));

(async () => {
  sample('До снятия (тролль поставил A единицу, B десятку)', { gA: 1, gB: 2 });

  await server(async () => {
    let x = await post('/api/rooms/room1/person', { pid: 'gT', noRate: true, cid: 'X' });
    check(x.status === 403, `не создатель запретить не может (${x.status})`);
    x = await post('/api/rooms/room1/person', { pid: 'gT', noRate: true, cid: 'OWN' });
    check(x.status === 200, `создатель запретил троллю оценивать (${x.status})`);
    x = await post('/api/rooms/room1/rate', { hid: 'h1', score: 2, cid: 'T', by: 'T' });
    check(x.status === 403, `тролль с запретом не может поменять оценку (${x.status}: ${x.body.error})`);
    x = await post('/api/rooms/room1/rate', { hid: 'h2', score: 7, cid: 'Z', by: 'Z' });
    check(x.status === 200, `остальные оценивают как раньше (${x.status})`);
    x = await post('/api/rooms/room1/rate', { hid: 'h2', score: 0, cid: 'Z', by: 'Z' });
    check(x.status === 200, `и снимают свою оценку (${x.status})`);
    let st = await fetch(base + '/api/rooms/room1').then(r => r.json());
    check(JSON.stringify(st.noRate) === '["gT"]', `запрет виден всем в состоянии комнаты: noRate = ${JSON.stringify(st.noRate)}`);
    check(st.history[0].ratings.gT?.score === 1, 'запрет сам по себе оценки не снимает');
    x = await post('/api/rooms/room1/person', { pid: 'gT', clearRatings: true, cid: 'OWN' });
    check(x.status === 200, `создатель снял оценки тролля (${x.status})`);
    st = await fetch(base + '/api/rooms/room1').then(r => r.json());
    check(st.history.every(h => !h.ratings.gT), 'у тролля не осталось ни одной оценки');
    check(st.history[0].ratings.gX?.score === 9 && st.history[0].ratings.gY?.score === 9, 'оценки остальных на месте');
    // пересчёт делает сам обработчик, без перезапуска сервера (при запуске бонусы пересобираются, это его не проверяет)
    const live = pid => st.modifiers[pid]?.factor || 1;
    check(live('gA') === 1.5 && live('gB') === 1, `живой сервер сразу пересчитал бонусы: A ×${live('gA')}, B ×${live('gB')}`);
  });

  sample('После снятия (у A средняя 9 → ×1,5, у B оценок нет → ×1)', { gA: 1.5, gB: 1 });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(fails ? `ИТОГ: ${fails} провал(ов)` : 'ИТОГ: всё сходится');
  process.exit(fails ? 1 : 0);
})();
