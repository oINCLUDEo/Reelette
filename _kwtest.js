const { Client, getPublicToken, VideoLinks } = require('kodikwrapper');
(async () => {
  const token = await getPublicToken();
  console.log('token:', token);
  const c = Client.fromToken(token);
  // Интерстеллар kp id 258687
  const r = await c.search({ kinopoisk_id: 258687, with_material_data: true, limit: 20 });
  console.log('total', r.total);
  for (const m of r.results.slice(0, 6)) console.log(m.id, m.type, m.quality, JSON.stringify(m.translation), m.link, m.last_season, m.last_episode);
  const t = await c.search({ title: 'Во все тяжкие', limit: 3, with_seasons: true });
  for (const m of t.results) console.log(m.id, m.type, m.title, m.year, m.link, m.last_season, m.last_episode, Object.keys(m.seasons||{}));
  console.log(VideoLinks.normalizeKodikLink(r.results[0]?.link || ''));
})().catch(e => console.error('ERR', e));
