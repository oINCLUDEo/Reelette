// Вся серия выбывания до окна победителя, ловит ошибки в консоли: node tools/shots/full.js
const { chromium } = require('playwright');
const base = process.env.BASE || 'http://localhost:3000';
(async () => {
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
  const { id } = await post('/api/rooms', { name: 'Тест' });
  await post(`/api/rooms/${id}/films`, { films: ['А1','Б2','В3','Г4','Д5','Е6'].map(t => ({ title: t, year: '2019' })), by: 'Аня', cid: 'c1' });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem('kk_name', '"Аня"'); localStorage.setItem('kk_cid', '"c1"'); localStorage.setItem('kk_newsSeen', '"9999"'); });
  const pg = await ctx.newPage(); const logs = [];
  pg.on('pageerror', e => logs.push('pageerror ' + e.message));
  await pg.goto(`${base}/r/${id}`); await pg.waitForTimeout(1500);
  await post(`/api/rooms/${id}/spin`, { mode: 'elimination', auto: true, by: 'Аня', cid: 'c1' });
  await pg.waitForSelector('#winModal.full.open', { timeout: 150000 });
  await pg.waitForTimeout(1200);
  await pg.screenshot({ path: __dirname + '/out/w-final.png' });
  logs.push('winner: ' + await pg.$eval('#winDetail', e => e.textContent.trim().slice(0, 60)));
  logs.push('roll-old leftovers: ' + await pg.$$eval('.roll-old', a => a.length));
  console.log(logs.join('\n')); await b.close();
})();
