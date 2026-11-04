// серия выбывания; посреди парада сервер перезапускается — у клиента всё должно сброситься
const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const base = process.env.BASE || 'http://localhost:3000';
const out = __dirname + '/out/r-';
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
  const { id } = await post('/api/rooms', { name: 'Тест' });
  const titles = ['Достать ножи', 'Начало', 'Паразиты', 'Интерстеллар', 'Однажды в Голливуде', 'Бегущий по лезвию 2049'];
  await post(`/api/rooms/${id}/films`, { films: titles.map(t => ({ title: t, year: '2019' })), by: 'Аня', cid: 'c1' });
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { localStorage.setItem('kk_name', '"Аня"'); localStorage.setItem('kk_cid', '"c1"'); });
  const pg = await ctx.newPage();
  const logs = [];
  pg.on('pageerror', e => logs.push('pageerror ' + e.message)); pg.on('console', m => { if (/EventSource|events/.test(m.text())) logs.push('console ' + m.text().slice(0, 120)); });
  await pg.goto(`${base}/r/${id}`); await sleep(1500);
  await post(`/api/rooms/${id}/spin`, { mode: 'elimination', auto: true, by: 'Аня', cid: 'c1' });
  await sleep(12000); // идёт парад
  await pg.screenshot({ path: out + '1-parade.png' });
  execSync('fuser -k 3000/tcp; sleep 0.5');
  spawn('node', ['server.js'], { cwd: require('path').resolve(__dirname, '../..'), env: { ...process.env, PORT: '3000' }, detached: true, stdio: 'ignore' }).unref();
  await sleep(9000); logs.push('room ' + id + ' ' + (await fetch(base + '/api/rooms/' + id + '/recap').then(r => r.status)));
  await pg.screenshot({ path: out + '2-after.png' });
  const st = await pg.evaluate(() => ({ stage: document.body.dataset.stage || null, parade: !document.querySelector('#parade').hidden, cine: document.body.classList.contains('cine'), hub: document.querySelector('#spinBtn .hub-label').textContent }));
  logs.push('after restart: ' + JSON.stringify(st));
  // пробел на шапке группы не крутит
  await pg.focus('.group-head'); await pg.keyboard.press('Space'); await sleep(600);
  logs.push('after space on group: hub=' + await pg.$eval('#spinBtn .hub-label', e => e.textContent));
  console.log(logs.join('\n'));
  await b.close();
})();
