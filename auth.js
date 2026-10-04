// Вход через Discord (OAuth2, scope identify) и сессии в cookie. Без ключей модуль выключен, работает только гостевой вход.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const TTL = 30 * 24 * 3600 * 1000;

module.exports = function createAuth({ dataDir, clientId, clientSecret, publicUrl }) {
  const enabled = Boolean(clientId && clientSecret && publicUrl);
  const file = path.join(dataDir, 'sessions.json');
  const secure = /^https:/.test(publicUrl || '');
  const redirectUri = enabled ? publicUrl.replace(/\/$/, '') + '/auth/discord/callback' : '';

  let sessions = {};
  try { sessions = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { sessions = {}; }
  for (const [k, s] of Object.entries(sessions)) if (Date.now() - s.at > TTL) delete sessions[k];

  let timer = null;
  function save() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(file + '.tmp', JSON.stringify(sessions));
        fs.renameSync(file + '.tmp', file);
      } catch (e) { console.error(`Не удалось сохранить ${file}: ${e.message}`); }
    }, 300);
  }

  function cookies(req) {
    const out = {};
    for (const part of (req.headers.cookie || '').split(';')) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }
  const cookie = (name, value, maxAge) =>
    `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.round(maxAge)}${secure ? '; Secure' : ''}`;

  function user(req) {
    const sid = cookies(req).rl_sid;
    const s = sid && sessions[sid];
    if (!s) return null;
    if (Date.now() - s.at > TTL) { delete sessions[sid]; save(); return null; }
    return s.user;
  }

  async function discordJson(url, opts) {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      // Discord объясняет причину в теле ответа, например {"error":"invalid_client"}
      const body = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`${url.split('/').pop()} HTTP ${res.status} ${body}`);
    }
    return res.json();
  }

  // Возвращает true, если запрос обработан.
  async function handle(req, res, url) {
    if (url.pathname === '/auth/discord') {
      if (!enabled) { res.writeHead(404); res.end('Вход через Discord не настроен'); return true; }
      const back = safeBack(url.searchParams.get('back'));
      const state = crypto.randomBytes(16).toString('hex');
      const q = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri, scope: 'identify', state, prompt: 'none' });
      res.writeHead(302, { Location: `https://discord.com/oauth2/authorize?${q}`, 'Set-Cookie': cookie('rl_state', `${state}|${back}`, 600) });
      res.end();
      return true;
    }

    if (url.pathname === '/auth/discord/callback') {
      const [state, rawBack] = (cookies(req).rl_state || '').split('|');
      const back = safeBack(rawBack);
      const fail = reason => {
        res.writeHead(302, { Location: `${back}?login_error=${reason}`, 'Set-Cookie': cookie('rl_state', '', 0) });
        res.end();
      };
      if (!enabled || !state || state !== url.searchParams.get('state')) { fail('state'); return true; }
      if (url.searchParams.get('error')) { fail('cancel'); return true; }
      try {
        const tok = await discordJson('https://discord.com/api/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code: url.searchParams.get('code') || '', redirect_uri: redirectUri }),
        });
        const me = await discordJson('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tok.access_token}` } });
        const u = {
          id: String(me.id),
          name: String(me.global_name || me.username || 'Discord').slice(0, 32),
          avatar: me.avatar
            ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`
            : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(me.id) >> 22n) % 6n)}.png`,
        };
        const sid = crypto.randomBytes(24).toString('base64url');
        sessions[sid] = { user: u, at: Date.now() };
        save();
        res.writeHead(302, { Location: back, 'Set-Cookie': [cookie('rl_sid', sid, TTL / 1000), cookie('rl_state', '', 0)] });
        res.end();
      } catch (e) {
        console.warn('Вход через Discord:', e.message);
        fail('discord');
      }
      return true;
    }

    if (url.pathname === '/auth/logout' && req.method === 'POST') {
      const sid = cookies(req).rl_sid;
      if (sid && sessions[sid]) { delete sessions[sid]; save(); }
      res.writeHead(204, { 'Set-Cookie': cookie('rl_sid', '', 0) });
      res.end();
      return true;
    }
    return false;
  }

  return { enabled, user, handle };
};

// Возвращаемся только на свои страницы, чтобы ссылку входа нельзя было использовать для редиректа на чужой сайт.
function safeBack(b) {
  return typeof b === 'string' && /^\/(r\/[A-Za-z0-9]+)?$/.test(b) ? b : '/';
}
