// Обход сайта: главная, комната, окна, прокрут, победитель, 1024/2K, iPhone. P=префикс node tools/shots/tour.js
const { chromium, devices } = require('playwright');
const base = process.env.BASE || 'http://localhost:3000';
const out = __dirname + '/out/' + (process.env.P || 'c') + '-';
(async () => {
  const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
  const { id } = await post('/api/rooms', { name: 'Киновечер' });
  const titles = ['Достать ножи', 'Начало', 'Паразиты', 'Интерстеллар', 'Однажды в Голливуде', 'Бегущий по лезвию 2049', 'Дюна: Часть вторая', 'Оппенгеймер'];
  await post(`/api/rooms/${id}/films`, { films: titles.map(t => ({ title: t, year: '2019', runtime: 140, genres: ['драма'] })), name: 'Аня', cid: 'c1' });
  const b = await chromium.launch();
  const logs = [];
  const shoot = async (pg, name) => pg.screenshot({ path: out + name + '.png' });
  // главная
  const dctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  await dctx.addInitScript(() => { localStorage.setItem('kk_name', '"Аня"'); localStorage.setItem('kk_cid', '"c1"'); });
  let pg = await dctx.newPage();
  pg.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') logs.push('[desk] ' + m.text()); });
  pg.on('pageerror', e => logs.push('[desk pageerror] ' + e.message));
  await pg.goto(base + '/'); await pg.waitForTimeout(1200); await shoot(pg, 'home');
  await pg.goto(`${base}/r/${id}`); await pg.waitForTimeout(1800); await shoot(pg, 'room');
  // кнопки шапки: пробуем открыть настройки и прочие окна по очереди
  const btns = await pg.$$eval('button[id], [data-open]', els => els.filter(e => e.offsetParent).map(e => ({ id: e.id, t: (e.getAttribute('aria-label') || e.title || e.textContent).trim().slice(0, 40) })));
  logs.push('buttons: ' + JSON.stringify(btns));
  for (const sel of ['#settingsBtn', '#addBtn', '#funBtn', '#musicBtn', '#peopleBtn']) {
    const el = await pg.$(sel); if (!el) continue;
    await el.evaluate(e => e.click()); await pg.waitForTimeout(700); await shoot(pg, 'modal-' + sel.slice(1));
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(500);
  }
  // таб «Выпадало»
  // обычный прокрут до результата
  await post(`/api/rooms/${id}/spin`, { mode: 'normal', duration: 3, name: 'Аня', cid: 'c1' });
  await pg.waitForTimeout(1500); await shoot(pg, 'spin');
  await pg.waitForTimeout(4500); await shoot(pg, 'winner');
  await pg.keyboard.press('Escape'); await pg.waitForTimeout(800); await shoot(pg, 'after');
  // 2K
  await pg.setViewportSize({ width: 2560, height: 1440 }); await pg.waitForTimeout(800); await shoot(pg, 'room-2k');
  await pg.setViewportSize({ width: 1024, height: 768 }); await pg.waitForTimeout(800); await shoot(pg, 'room-1024');
  // телефон
  const ctx = await b.newContext({ ...devices['iPhone 13'] });
  await ctx.addInitScript(() => { localStorage.setItem('kk_name', '"Боря"'); localStorage.setItem('kk_cid', '"c2"'); });
  const ph = await ctx.newPage();
  ph.on('pageerror', e => logs.push('[phone pageerror] ' + e.message));
  await ph.goto(base + '/'); await ph.waitForTimeout(1000); await shoot(ph, 'phone-home');
  await ph.goto(`${base}/r/${id}`); await ph.waitForTimeout(1800); await shoot(ph, 'phone-room');
  await ph.screenshot({ path: out + 'phone-room-full.png', fullPage: true });
  const ov = await ph.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  logs.push('phone scrollWidth/innerWidth ' + ov);
  console.log(logs.join('\n'));
  await b.close();
})();
