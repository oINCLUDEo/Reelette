// Колесо у всех одинаковое: три браузера в одной комнате проходят через голоса, добавление и удаление фильма,
// отключение человека и серию выбывания. После каждого шага их колесо сверяется попиксельно
// с только что открытым браузером (он рисует всё с нуля), а список фильмов — со свежим браузером того же человека
// (строки списка не пересоздаются, а правятся точечно — они не должны разойтись с отрисовкой с нуля).
// Запуск: сервер на 3000, node tools/shots/sync.js
const { chromium } = require('playwright');
const base = process.env.BASE || 'http://localhost:3000';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const post = (p, b, m = 'POST') => fetch(base + p, { method: m, headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
const room = id => fetch(`${base}/api/rooms/${id}`).then(r => r.json());
const KP = n => `https://kinopoiskapiunofficial.tech/images/posters/kp_small/${n}.jpg`;
let fails = 0;
(async () => {
  const { id } = await post('/api/rooms', { name: 'Синхрон', cid: 's0', by: 'Аня' });
  const add = (who, cid, list) => post(`/api/rooms/${id}/films`, { films: list.map(([t, kp]) => ({ title: t, year: '2001', poster: kp ? KP(kp) : '' })), by: who, cid });
  await add('Аня', 's0', [['Психо', 301], ['Престиж', 302], ['Легенда', 303], ['Без постера длинное название фильма', 0]]);
  await add('Борис', 's1', [['Чужой', 304], ['Евротур', 305], ['72 метра', 306]]);
  await add('Вика', 's2', [['Пианист', 307], ['Бронсон', 308]]);
  const b = await chromium.launch();
  const open = async (name, cid) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(([n, c]) => { localStorage.setItem('kk_name', JSON.stringify(n)); localStorage.setItem('kk_cid', JSON.stringify(c)); localStorage.setItem('kk_newsSeen', '"9999"'); }, [name, cid]);
    const pg = await ctx.newPage(); pg.on('pageerror', e => { console.log('pageerror', e.message); fails++; });
    await pg.goto(`${base}/r/${id}`); return pg;
  };
  const who = [['Аня', 's0'], ['Борис', 's1'], ['Вика', 's2']];
  const users = [];
  for (const [n, c] of who) users.push(await open(n, c));
  // список: шапки групп и строки по порядку — тексты, классы (кроме «под стрелкой» и «новый»), сердечко
  const listSig = pg => pg.evaluate(() => [...document.querySelectorAll('#filmList .film-group')].map(g => {
    const h = g.querySelector('.gh'), t = s => h.querySelector(s).textContent;
    return [g.className, h.dataset.group, t('.l1'), t('.l2 .i'), t('.n1'), t('.n2'), h.querySelector('.own').innerHTML,
      ...[...g.querySelectorAll('.film')].map(r => [r.dataset.id, r.className.replace(/ ?\b(hot|fresh)\b/g, ''), r.querySelector('.l1').textContent, r.querySelector('.l2').innerHTML, r.querySelector('.n1').textContent, r.querySelector('.vt').className, r.querySelector('.vt').textContent, r.querySelector('.po').innerHTML].join('|'))].join('\n');
  }).join('\n\n') + '\n' + document.querySelector('#shareBar').innerHTML);
  await sleep(4000);
  // снимок колеса: пиксели холста, уменьшенные до 160×160 (сглаживание прячет разницу в долю пикселя)
  const snap = pg => pg.evaluate(() => {
    const cv = document.querySelector('#wheel'); const s = document.createElement('canvas'); s.width = s.height = 160;
    s.getContext('2d').drawImage(cv, 0, 0, 160, 160); return Array.from(s.getContext('2d').getImageData(0, 0, 160, 160).data);
  });
  const diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++; return n; };
  const check = async (step, wait = 3000) => {
    await sleep(wait); // перетекание секторов и догрузка постеров
    const fresh = await open('Гость', 'sx'); await sleep(4000);
    // разошлось — ещё раз через 4 с: постер мог догрузиться у одной стороны позже. Держится — значит, настоящее расхождение
    let ds, tries = [];
    for (let k = 0; k < 2; k++) {
      if (k) await sleep(4000);
      const ref = await snap(fresh);
      ds = [];
      for (const u of users) ds.push(diff(ref, await snap(u)));
      tries.push(ds.join(', '));
      if (ds.every(d => d <= 40)) break;
    }
    await fresh.context().close();
    const ok = ds.every(d => d <= 40); // ≤40 из 25 600 пикселей — сглаживание краёв
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${step}: отличия от свежего браузера (пикселей из 25600) — ${tries.join(' → ')}`);
    if (!ok) fails++;
    for (let i = 0; i < users.length; i++) {
      const same = await open(...who[i]); await sleep(3000);
      const [a, b2] = [await listSig(same), await listSig(users[i])];
      await same.context().close();
      if (a !== b2) { fails++; const la = a.split('\n'), lb = b2.split('\n'), k = la.findIndex((x, j) => x !== lb[j]); console.log(`FAIL ${step}: список у ${who[i][0]} не совпал со свежим: «${lb[k]}» вместо «${la[k]}»`); }
    }
  };
  await check('открыли комнату');
  let st = await room(id);
  await post(`/api/rooms/${id}/films/${st.films[4].id}/vote`, { cid: 's0', by: 'Аня' });
  await post(`/api/rooms/${id}/films/${st.films[7].id}/vote`, { cid: 's1', by: 'Борис' });
  await check('два голоса');
  await add('Вика', 's2', [['Майкл', 309], ['Разрушение', 310]]);
  await check('добавили два фильма');
  await fetch(`${base}/api/rooms/${id}/films/${st.films[1].id}?cid=s0`, { method: 'DELETE' });
  await check('удалили фильм');
  await post(`/api/rooms/${id}/person`, { pid: 'gs1', off: true, cid: 's0' });
  await check('отключили Бориса');
  await post(`/api/rooms/${id}/person`, { pid: 'gs1', off: false, cid: 's0' });
  await check('вернули Бориса');
  await post('/api/profile', { cid: 's2', color: '#ff5a6e' });
  await check('Вика сменила цвет ника (кромка её секторов)');
  // серия выбывания до конца: колесо у всех после каждого выбывания
  await post(`/api/rooms/${id}/spin`, { mode: 'elimination', auto: true, by: 'Аня', cid: 's0' });
  for (let i = 0; i < 400; i++) { st = await room(id); if (st.history.length && !st.spin && !st.series) break; await sleep(500); }
  for (const u of users) await u.keyboard.press('Escape');
  // после серии последние выбывшие тают ещё несколько секунд (на это время занимают весь круг, под окном победителя)
  await check('серия выбывания до победителя', 8000);
  await post(`/api/rooms/${id}/reset`, { cid: 's0' });
  await check('вернули выбывших');
  console.log(fails ? `ИТОГ: ${fails} провал(ов)` : 'ИТОГ: колесо у всех совпадает со свежим браузером');
  await b.close();
})();
