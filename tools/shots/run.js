// Скриншоты комнаты по ходу прокрута: node tools/shots/run.js 1,3,6 (секунды от старта). Сервер: PORT=3000 node server.js
const { chromium } = require('playwright');
const base = process.env.BASE || 'http://localhost:3000';
(async () => {
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
  const { id } = await post('/api/rooms', { name: 'Тест' });
  const titles = (process.env.T || 'Достать ножи,Начало,Паразиты,Интерстеллар,Однажды в Голливуде,Бегущий по лезвию 2049').split(',');
  await post(`/api/rooms/${id}/films`, { films: titles.map(t => ({ title: t, year: '2019' })), name: 'Тест', cid: 'c1' });
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await pg.goto(`${base}/r/${id}`);
  await pg.waitForTimeout(1500);
  // закрыть возможный ввод имени
  const nm = await pg.$('input[name=name], #nameInput'); if (nm) { await nm.fill('Тест'); await pg.keyboard.press('Enter'); }
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: __dirname + '/out/00.png' });
  await post(`/api/rooms/${id}/spin`, { mode: 'elimination', auto: true, name: 'Тест', cid: 'c1' });
  const t0 = Date.now(); let i = 0;
  const plan = (process.argv[2] || '').split(',').map(Number);
  for (const s of plan) { const w = s * 1000 - (Date.now() - t0); if (w > 0) await pg.waitForTimeout(w); await pg.screenshot({ path: `${__dirname}/out/${process.env.P||''}${String(++i).padStart(2,'0')}-${s}.png` }); }
  await b.close();
})();
