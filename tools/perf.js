// Замер плавности комнаты: кадры, длинные задачи, время скрипта/стилей/раскладки и самые тяжёлые функции.
// Комната как у компании: 77 фильмов с постерами, 9 человек с эффектами ников и рамками, голоса, выпавший фильм.
// Сценарии: покой, наведение по кнопкам, обновления комнаты (чужие голоса), наведение + обновления, прокрут.
// Потом подозреваемых выключают по одному и меряют «наведение + обновления» и прокрут снова.
// Запуск: сервер на 3000 (node server.js), затем node tools/perf.js [метка] [--throttle=4] [--quick]
// Открывается настоящее окно Chrome (с видеокартой): headless рисует программно и врёт про стекло и размытие.
'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const base = process.env.BASE || 'http://localhost:3000';
const label = process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]) || 'now';
const throttle = Number((process.argv.find(a => a.startsWith('--throttle=')) || '=1').split('=')[1]);
const quick = process.argv.includes('--quick');
const outDir = path.join(__dirname, 'shots', 'out');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
const room = id => fetch(`${base}/api/rooms/${id}`).then(r => r.json());

// постеры Кинопоиска: id с 300, у которых картинка точно есть (проверено), отдаются через /img сайта
const KP = [300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 320, 321, 322, 323, 324, 325, 326, 327, 328, 329, 330, 331, 332, 333, 334, 335, 336, 337, 338, 339, 340, 341, 342, 343, 344, 345, 346, 347, 348, 349, 350, 351, 352, 353, 354, 355, 356, 357, 358, 359, 360, 361, 362, 363, 364, 365, 366, 367, 368, 369, 370, 371, 372, 373, 374, 375, 376];
const PEOPLE = [
  { name: 'МС Дымка', n: 12, effect: 'rainbow', frame: 'holo', font: 'pixel', icon: '👑', color: 'grad:rainbow' },
  { name: 'GLENN', n: 11, effect: 'glitch', frame: 'fire', font: 'russo', icon: '', color: '#e2e2e2' },
  { name: 'soundcloud hero', n: 5, effect: 'shimmer', frame: 'neon', font: 'unbounded', icon: '🎧', color: '#ff5a6e', off: true },
  { name: 'тоха', n: 10, effect: 'wave', frame: 'toxic', font: 'default', icon: '🐸', color: '#3ddc97' },
  { name: 'nisshokuryu', n: 10, effect: 'flicker', frame: 'rainbow', font: 'pixel', icon: '🎬', color: '#c084fc' },
  { name: 'tipoya', n: 4, effect: 'pulse', frame: 'ice', font: 'default', icon: '💀', color: '#38bdf8', off: true },
  { name: 'Сыра Гойда', n: 7, effect: 'glow', frame: 'neon', font: 'pacifico', icon: '🍿', color: '#ffd54a' },
  { name: 'Serhio', n: 8, effect: 'none', frame: 'accent', font: 'default', icon: '', color: '' },
  { name: 'Marcellus', n: 5, effect: 'rainbow', frame: 'gold', font: 'unbounded', icon: '', color: 'grad:gold', off: true },
  { name: 'Игра', n: 5, effect: 'shimmer', frame: 'holo', font: 'default', icon: '🦄', color: 'grad:neon' },
];
const GENRES = [['ужасы', 'триллер'], ['драма'], ['комедия'], ['фантастика', 'боевик'], ['криминал', 'драма']];

async function setup() {
  const owner = { cid: 'pf0', name: PEOPLE[0].name };
  const { id } = await post('/api/rooms', { name: 'Лудка колесо', cid: owner.cid, by: owner.name });
  let k = 0;
  for (const [i, p] of PEOPLE.entries()) {
    const cid = 'pf' + i;
    await post('/api/profile', { cid, color: p.color, effect: p.effect, frame: p.frame, font: p.font, icon: p.icon });
    const films = Array.from({ length: p.n }, () => {
      const kp = KP[k++ % KP.length];
      return { title: 'Фильм ' + kp, year: String(1960 + (kp % 60)), runtime: 90 + (kp % 70), genres: GENRES[kp % 5], poster: `https://kinopoiskapiunofficial.tech/images/posters/kp_small/${kp}.jpg` };
    });
    await post(`/api/rooms/${id}/films`, { films, by: p.name, cid });
  }
  let st = await room(id);
  // голоса: у каждого активного по 3 за чужие фильмы
  for (const [i, p] of PEOPLE.entries()) {
    if (p.off) continue;
    const others = st.films.filter(f => f.addedById !== 'gpf' + i);
    for (let v = 0; v < 3; v++) await post(`/api/rooms/${id}/films/${others[(i * 7 + v * 13) % others.length].id}/vote`, { cid: 'pf' + i, by: p.name });
  }
  // один выпавший фильм — сверху блок «Оцените фильм», как на вечере
  await post(`/api/rooms/${id}/spin`, { mode: 'normal', duration: 3, by: owner.name, cid: owner.cid });
  for (let i = 0; i < 60; i++) { st = await room(id); if (st.history.length && !st.spin) break; await sleep(500); }
  for (const [i, p] of PEOPLE.entries()) if (p.off) await post(`/api/rooms/${id}/person`, { pid: 'gpf' + i, off: true, cid: owner.cid });
  return { id, owner };
}

// подозреваемые: что выключаем, чтобы увидеть их цену
const ABLATE = {
  'без стекла (backdrop-filter)': '*, *::before, *::after { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }',
  'без фона-постера (.room-bg)': '.room-bg { display: none !important; }',
  'без анимаций ников и рамок': '.nick, .nick *, [class*="frame-"], [class*="frame-"]::before, [class*="frame-"]::after { animation: none !important; }',
  'без бесконечных анимаций вообще': '*, *::before, *::after { animation-iteration-count: 1 !important; }',
  'без света вокруг колеса (canvas.backdrop)': '#room canvas.backdrop { display: none !important; }',
};

(async () => {
  const { id, owner } = await setup();
  // обычный Chrome, как у людей на вечере (чистый временный профиль); PW_CHANNEL=chromium — встроенный Playwright
  const b = await chromium.launch({ headless: false, channel: process.env.PW_CHANNEL || 'chrome', args: ['--window-size=1940,1180', '--disable-features=CalculateNativeWinOcclusion', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(([n, c]) => {
    localStorage.setItem('kk_name', JSON.stringify(n)); localStorage.setItem('kk_cid', JSON.stringify(c)); localStorage.setItem('kk_newsSeen', '"9999"');
    // счётчик кадров и длинных задач живёт со страницей
    window.__pf = { frames: [], long: [] };
    const loop = t => { window.__pf.frames.push(t); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
    new PerformanceObserver(l => { for (const e of l.getEntries()) window.__pf.long.push(e.duration); }).observe({ type: 'longtask', buffered: true });
  }, [owner.name, owner.cid]);
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  const cdp = await ctx.newCDPSession(pg);
  await cdp.send('Performance.enable');
  if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const open = async css => {
    await pg.goto(`${base}/r/${id}`); await sleep(3500); // постеры, шрифты, въезд управления
    if (css) await pg.addStyleTag({ content: css });
    await pg.mouse.move(960, 1060); await sleep(600);
  };
  await open();
  await pg.screenshot({ path: path.join(outDir, `perf-${label}-room.png`) });

  // точки для наведения: строки списка, вкладки, оценки, шапка, реакции — всё, что под курсором на вечере
  const targets = await pg.$$eval('.films-panel button, .films-panel .film, .films-panel .group-head, #modeSeg button, .tools button, .react-bar button, #rateBox [data-score]', els =>
    els.filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; }).filter(([x, y]) => y > 0 && y < 1080));
  const hover = async ms => { const end = Date.now() + ms; let i = 0; while (Date.now() < end) { const [x, y] = targets[i++ % targets.length]; await pg.mouse.move(x, y, { steps: 6 }); await sleep(90); } };
  let upd = null, updOk = 0, updAll = 0;
  const updates = on => {
    clearInterval(upd); if (!on) return;
    upd = setInterval(async () => { // чужой голос туда-обратно (снял — вернул): на каждый — полное состояние комнаты всем
      const st = await room(id); const f = st.films.find(x => (x.votes || []).some(v => v.id === 'gpf1')) || st.films.find(x => x.addedById !== 'gpf1');
      updAll++;
      post(`/api/rooms/${id}/films/${f.id}/vote`, { cid: 'pf1', by: PEOPLE[1].name }).then(r => { if (r.ok) updOk++; }).catch(() => {});
    }, 500);
  };
  // обновление, которое колесо не меняет (как музыка, чат, оценки): название комнаты туда-обратно каждые 0,5 с
  let upd2 = null;
  const otherUpdates = on => {
    clearInterval(upd2); if (!on) return;
    let k = 0;
    upd2 = setInterval(() => fetch(`${base}/api/rooms/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: k++ % 2 ? 'Лудка колесо' : 'Лудка колесо!', cid: owner.cid }) }).catch(() => {}), 500);
  };
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  async function measure(name, act, ms, profile) {
    await sleep(3500); // хвост прошлого сценария (перетекание секторов после голоса) не должен попасть в этот
    await pg.evaluate(() => { window.__pf.frames = []; window.__pf.long = []; });
    const m0 = await metrics();
    if (profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 250 }); await cdp.send('Profiler.start'); }
    await act(ms);
    let top = null;
    if (profile) {
      const { profile: p } = await cdp.send('Profiler.stop');
      const dt = {}; const ids = p.samples; const byId = new Map(p.nodes.map(n => [n.id, n]));
      for (let i = 0; i < ids.length; i++) {
        const n = byId.get(ids[i]); const cf = n.callFrame;
        const key = cf.functionName ? `${cf.functionName} ${path.basename(cf.url || '')}:${cf.lineNumber + 1}` : `(${cf.url ? path.basename(cf.url) + ':' + (cf.lineNumber + 1) : 'native'})`;
        dt[key] = (dt[key] || 0) + (p.timeDeltas[i] || 0) / 1000;
      }
      top = Object.entries(dt).filter(([k]) => !/^\(idle\)/.test(k) && k !== '(native)').sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, Math.round(v)]);
    }
    const m1 = await metrics();
    const { frames, long } = await pg.evaluate(() => window.__pf);
    const d = frames.slice(1).map((t, i) => t - frames[i]).sort((a, b) => a - b);
    const q = p => d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))] : 0;
    const sec = (m1.Timestamp - m0.Timestamp) || ms / 1000;
    const r = {
      name, fps: Math.round(d.length / sec), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +(d[d.length - 1] || 0).toFixed(0),
      janky: d.length ? Math.round(100 * d.filter(x => x > 25).length / d.length) : 0,
      longN: long.length, longMs: Math.round(long.reduce((a, b) => a + b, 0)),
      // доля секунды, которую главный поток тратил на скрипт / стили / раскладку
      script: Math.round(1000 * (m1.ScriptDuration - m0.ScriptDuration) / sec), style: Math.round(1000 * (m1.RecalcStyleDuration - m0.RecalcStyleDuration) / sec),
      layout: Math.round(1000 * (m1.LayoutDuration - m0.LayoutDuration) / sec), task: Math.round(1000 * (m1.TaskDuration - m0.TaskDuration) / sec),
      styleN: Math.round((m1.RecalcStyleCount - m0.RecalcStyleCount) / sec), layoutN: Math.round((m1.LayoutCount - m0.LayoutCount) / sec), top,
    };
    console.log(`${name.padEnd(44)} ${String(r.fps).padStart(3)} fps  кадр p50 ${String(r.p50).padStart(5)} p95 ${String(r.p95).padStart(5)} max ${String(r.max).padStart(4)} мс  рывков ${String(r.janky).padStart(2)}%  длинных ${r.longN}/${r.longMs}мс  поток мс/с: скрипт ${r.script} стили ${r.style} раскладка ${r.layout} всего ${r.task}`);
    return r;
  }
  const idle = ms => sleep(ms);
  const hoverUpd = async ms => { updates(true); await hover(ms); updates(false); };
  const upOnly = async ms => { updates(true); await sleep(ms); updates(false); };
  const hoverOther = async ms => { otherUpdates(true); await hover(ms); otherUpdates(false); };
  const spinAct = async ms => { await post(`/api/rooms/${id}/spin`, { mode: 'normal', duration: 8, by: owner.name, cid: owner.cid }); await sleep(ms); for (let i = 0; i < 40 && (await room(id)).spin; i++) await sleep(500); await sleep(1500); await pg.keyboard.press('Escape'); };
  const T = quick ? 3000 : 6000;
  const res = { label, throttle, base: [], ablate: [] };
  console.log(`\nЗамер «${label}»${throttle > 1 ? `, процессор замедлен в ${throttle} раз` : ''}: 1920×1080, ${targets.length} точек для наведения`);
  res.base.push(await measure('покой', idle, T));
  res.base.push(await measure('наведение', hover, T, true));
  res.base.push(await measure('обновления (чужой голос каждые 0,5 с)', upOnly, T, true));
  res.base.push(await measure('наведение + обновления', hoverUpd, T, true));
  res.base.push(await measure('наведение + обновления без колеса', hoverOther, T, true));
  res.base.push(await measure('прокрут (8 с)', spinAct, 8000, true));
  // на вечере всегда играет общая музыка: скрытый плеер YouTube тоже работает
  const music = await post(`/api/rooms/${id}/music`, { url: 'https://youtu.be/lBO0JZJLv-Y', now: true, cid: owner.cid, by: owner.name });
  if (music.ok) {
    await pg.mouse.click(960, 1060); // клик разрешает звук
    let playing = false;
    for (let i = 0; i < 20 && !playing; i++) { await sleep(1000); playing = await pg.evaluate(() => !!document.querySelector('iframe[src*="youtube"]')); }
    await sleep(2000);
    if (playing) {
      res.base.push(await measure('с музыкой: покой', idle, T));
      res.base.push(await measure('с музыкой: наведение + обновления', hoverUpd, T, true));
    } else console.log('с музыкой: не замерено — плеер YouTube не загрузился (YouTube не открывается с этого компьютера)');
    await post(`/api/rooms/${id}/music/stop`, { cid: owner.cid });
  } else console.log('музыку включить не удалось:', music.error);
  console.log(`обновлений комнаты отправлено ${updAll}, принято сервером ${updOk}`);
  // слабое устройство по мнению колеса (ступеньки при перетекании) и медиана сборки его кэша
  console.log('колесо:', JSON.stringify(await pg.evaluate(() => typeof wheel === 'undefined' ? null : { weak: !!wheel.weak, warmMs: +(wheel.warmMs || 0).toFixed(1), stepCost: +(wheel.stepCost || 0).toFixed(1), stepMs: wheel.weak ? Math.round(wheel.stepMs()) : null, canvas: wheel.cv.width })));
  if (!quick) {
    console.log('\nВыключаем по одному (наведение + обновления, затем прокрут):');
    for (const [name, css] of Object.entries(ABLATE)) {
      await open(css);
      res.ablate.push({ ...(await measure(name + ' · наведение+обн.', hoverUpd, T)), css: name });
      await open(css);
      res.ablate.push({ ...(await measure(name + ' · прокрут', spinAct, 8000)), css: name });
    }
  }
  console.log('\nСамые тяжёлые функции (мс за сценарий, без простоя):');
  for (const r of res.base.filter(x => x.top)) console.log(`  ${r.name}: ` + r.top.slice(0, 8).map(([k, v]) => `${k} ${v}`).join(' · '));
  fs.writeFileSync(path.join(outDir, `perf-${label}${throttle > 1 ? '-x' + throttle : ''}.json`), JSON.stringify(res, null, 1));
  console.log(`\nошибок страницы: ${errs.length} ${errs.slice(0, 3).join(' | ')}`);
  await b.close();
})();
