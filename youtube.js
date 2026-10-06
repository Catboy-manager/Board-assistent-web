'use strict';

/* Модуль YouTube для доски: поиск (yt-dlp), потоковый прокси в <video>,
   очередь на клиенте и простой «вход в Google» без OAuth:
   сервер пользуется cookies.txt из браузера, где пользователь уже вошёл
   в свой Google/YouTube аккаунт (расширение «Get cookies.txt» → экспорт),
   либо cookies читаются прямо из профиля браузера (--cookies-from-browser).
   Всё приватное (файл cookies) живёт только в data/ и не коммитится. */

const { execFile } = require('child_process');

module.exports = (deps) => {
  const { dataDir, json } = deps;
  const fs = require('fs');
  const path = require('path');
  const http = require('http');
  const https = require('https');

  const AUTH_FILE = path.join(dataDir, 'yt-auth.json');
  const COOKIES_FILE = path.join(dataDir, 'yt-cookies.txt');
  const WATCH_FILE = path.join(dataDir, 'yt-watch.json');

  /* Категории интересов (карта): слово встречается в названии/канале просмотра. */
  const INTEREST_CATS = [
    { key: 'tech', label: 'Технологии', icon: '💻', words: ['технолог', 'смартфон', 'гаджет', 'компьютер', 'ноутбук', 'процессор', 'микросхем', 'чип', 'нейросет', 'нейрон', 'искусственн', 'робот', 'программ', 'код', 'приложени', 'электроник', 'стартап', 'айфон', 'iphone', 'android', 'алгоритм', 'хакер', 'кибер', 'вирус', 'датчик', 'батареи', 'беспилот', 'интернет', 'сервер', 'gpt', 'openai', 'google', 'microsoft', 'apple', 'intel', 'amd', 'nvidia', 'крипт', 'блокчейн', 'python', 'javascript', 'react', 'automation', 'ии'] },
    { key: 'science', label: 'Наука', icon: '🔬', words: ['наук', 'учё', 'учен', 'исслед', 'открыт', 'эксперимент', 'лаборатор', 'биотехнолог', 'ген ', 'медицин', 'клиник', 'вакцин', 'лекарств', 'физик', 'хими', 'биолог', 'математик', 'квант', 'теори', 'молекул', 'клетк', 'эволюци', 'эйнштейн', 'science', 'physics', 'chemistry', 'biology', 'math', 'atom', 'dna', 'астрофизик'] },
    { key: 'space', label: 'Космос', icon: '🚀', words: ['косм', 'ракет', 'мкс', 'луна', 'лунный', 'марс', 'марсиан', 'спутник', 'астроном', 'галактик', 'орбит', 'телескоп', 'астероид', 'вселенн', 'планет', 'экзопланет', 'астронавт', 'космонавт', 'spacex', 'nasa', 'roskosmos', 'starlink', 'rocket', 'iss', 'satellite', 'galaxy', 'venus', 'jupiter', 'saturn'] },
    { key: 'music', label: 'Музыка', icon: '🎵', words: ['музык', 'песн', 'клип', 'альбом', 'концерт', 'хит', 'групп', 'исполнител', 'кавер', 'cover', 'гитар', 'диджей', 'ремикс', 'трек', 'мелоди', 'playlist', 'плейлист', 'музыкант', 'певец', 'певиц', 'lyrics', 'live', 'lofi', 'бит'] },
    { key: 'games', label: 'Игры', icon: '🎮', words: ['игр', 'гейм', 'геймплей', 'киберспорт', 'steam', 'playstation', 'xbox', 'nintendo', 'switch', 'fortnite', 'minecraft', 'минекрафт', 'гта', 'gta', 'rpg', 'mmo', 'летсплей', 'let’s play', 'геймпад', 'игровой', 'игров', 'game', 'gaming', 'gameplay', 'прохождени'] },
    { key: 'cinema', label: 'Кино и сериалы', icon: '🎬', words: ['фильм', 'кино', 'сериал', 'трейлер', 'рецензи', 'премьер', 'актер', 'актёр', 'режиссер', 'режиссёр', 'сценари', 'мультфильм', 'аниме', 'дорам', 'сезон', 'серия', 'movie', 'series', 'netflix', 'кинопоиск', 'книг', 'аудиокниг'] },
    { key: 'sport', label: 'Спорт', icon: '🏆', words: ['спорт', 'футбол', 'хокке', 'теннис', 'баскетбол', 'волейбол', 'турнир', 'чемпионат', 'матч', 'гол', 'болельщик', 'бокс', 'фигурн', 'лыжн', 'биатлон', 'бег', 'марафон', 'тренер', 'футболист', 'nba', 'nhl', 'ufc', 'mma', 'football', 'soccer', 'формула-1', 'formula'] },
    { key: 'business', label: 'Бизнес и деньги', icon: '💼', words: ['бизнес', 'инвест', 'экономик', 'финанс', 'рынок', 'акци', 'бюджет', 'биткоин', 'предприниматель', 'маркетинг', 'продаж', 'заработ', 'деньг', 'богат', 'успех', 'инвестор', 'биржа', 'фондов', 'trade'] },
    { key: 'education', label: 'Учёба и развитие', icon: '🎓', words: ['лекци', 'урок', 'обучени', 'учебн', 'мастер-класс', 'мастеркласс', 'туториал', 'tutorial', 'школ', 'университет', 'универ', 'институт', 'курс', 'знани', 'литератур', 'истори', 'учител', 'преподавател', 'саморазвит', 'егэ', 'школьн', 'как'] },
    { key: 'cooking', label: 'Кулинария', icon: '🍳', words: ['рецепт', 'готов', 'кухн', 'кулинар', 'блюд', 'завтрак', 'ужин', 'обед', 'выпечк', 'торт', 'суп', 'салат', 'рецепты', 'food', 'recipe', 'cooking', 'шеф-повар'] }
  ];
  const INTEREST_STOP = new Set(['этот','этого','это','такое','которые','который','которых','которые','как','все','еще','ещё','только','будет','может','также','очень','свою','свой','своих','люди','человек','год','года','годы','уже','был','была','были','and','the','for','with','from','that','this','have','will','what','how','when','why','not','are','you','your','can','channel','subscribe','really','great','video','top','best','versus','vs','official','new','live','talk']);

  let watch = [];
  try { const d = JSON.parse(fs.readFileSync(WATCH_FILE, 'utf8')); watch = (d && d.watch) || []; } catch (e) {}
  function saveWatch() { try { fs.writeFileSync(WATCH_FILE, JSON.stringify({ watch }, null, 2)); } catch (e) {} }
  const YTDLP = process.env.KANBAN_YTDLP || 'yt-dlp';
  const RESOLVE_TIMEOUT = 45000;
  const COOKIES_MAX = 2 * 1024 * 1024;
  const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

  let auth = { browser: null };
  try { const d = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); auth = Object.assign(auth, d); } catch (e) {}
  function saveAuth() { try { fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2)); } catch (e) {} }
  function cookiesExist() { try { return fs.existsSync(COOKIES_FILE) && fs.statSync(COOKIES_FILE).size > 0; } catch (e) { return false; } }

  /* аргументы авторизации для yt-dlp: cookies.txt важнее браузерного профиля */
  function authArgs() {
    if (cookiesExist()) return ['--cookies', COOKIES_FILE];
    if (auth.browser) return ['--cookies-from-browser', String(auth.browser)];
    return [];
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function ytdlp(baseArgs, opts) {
    const args = authArgs().concat(baseArgs, '--no-warnings');
    return new Promise((resolve, reject) => {
      execFile(YTDLP, args, {
        timeout: (opts && opts.timeout) || RESOLVE_TIMEOUT,
        maxBuffer: 64 * 1024 * 1024,
        env: Object.assign({}, process.env, { LC_ALL: 'C' })
      }, (err, stdout, stderr) => {
        let msg = '';
        if (err && err.killed && err.signal) msg = 'yt-dlp: таймаут (' + err.signal + ') — сеть не отвечает';
        else msg = String(stderr || (err && err.message) || 'yt-dlp error');
        const e = new Error(msg.slice(0, 600));
        e.stderr = msg;
        e.killed = !!(err && err.killed);
        if (err) return reject(e);
        resolve(stdout.toString());
      });
    });
  }
  function ytdlpJSON(args, opts) { return ytdlp(args, opts).then(s => { try { return JSON.parse(s); } catch (e) { throw new Error('yt-dlp: bad JSON: ' + String(s).slice(0, 200)); } }); }
  async function ytdlpRetry(args, opts) {
    let lastErr = null;
    for (let a = 0; a < 2; a++) {
      try { return await ytdlpJSON(args, opts); } catch (e) { lastErr = e; if (e.killed) await sleep(1200); }
    }
    throw lastErr;
  }

  function fmtDur(sec) {
    if (!sec) return '';
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = Math.floor(sec % 60);
    return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(s).padStart(2, '0');
  }
  function thumbOf(info) {
    const t = info.thumbnail || (info.thumbnails && info.thumbnails.length && info.thumbnails[info.thumbnails.length - 1].url);
    return t || '';
  }
  function httpGet(url, headers, timeout) {
    return new Promise((resolve, reject) => {
      const mod = /^https:/i.test(url) ? https : http;
      const req = mod.get(url, { headers }, (res) => resolve(res));
      req.on('error', reject);
      if (timeout) req.setTimeout(timeout, () => { req.destroy(new Error('timeout')); });
    });
  }

  /* ---------- потоки ---------- */
  async function resolveDirect(id, fmt) {
    const url = 'https://www.youtube.com/watch?v=' + encodeURIComponent(id);
    const sel = fmt === 'best' ? 'bestvideo*+bestaudio/best' : String(fmt || 'best');
    let out = '';
    for (let a = 0; a < 2; a++) {
      try { out = await ytdlp(['-g', '-f', sel, '--no-playlist', url]); break; } catch (e) { if (!e.killed) throw e; }
    }
    const line = out.split(/\r?\n/).map(x => x.trim()).find(x => /^https?:\/\//.test(x));
    if (!line) throw new Error('yt-dlp: нет прямой ссылки');
    return line;
  }

  /* выбрать «браузерные» форматы: одиночный файл, mp4 + avc1 + aac */
  function pickFormats(info) {
    const fmts = (info.formats || []).filter(f => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none' && f.protocol && /^https/.test(f.protocol));
    const cand = fmts
      .filter(f => /^(avc1|avc3|h264|mp4v)/i.test(String(f.vcodec)) && /^(mp4a|aac)/i.test(String(f.acodec)))
      .filter(f => (f.container === 'mp4' || f.ext === 'mp4'))
      .sort((a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0));
    const seen = new Set(); const out = [];
    for (const f of cand) {
      const key = f.height || 0;
      if (seen.has(key)) continue; seen.add(key);
      out.push({ id: f.format_id, height: f.height || 0, label: ((f.height || '') + 'p mp4').trim() + (f.tbr ? ' · ' + Math.round(f.tbr) + 'k' : '') });
    }
    if (!out.length) {
      const anySingle = fmts.sort((a, b) => (b.height || 0) - (a.height || 0) || (b.tbr || 0) - (a.tbr || 0));
      const top = anySingle[0];
      if (top) out.push({ id: top.format_id, height: top.height || 0, label: ((top.height || '') + ' ' + (top.ext || '')).trim() });
    }
    out.push({ id: 'best', height: 0, label: 'Авто (лучшее)' });
    return out;
  }

  /* ---------- карта интересов ---------- */
  function matchesWord(text, w) { return String(text).toLowerCase().includes(String(w).toLowerCase()); }

  function buildInterests() {
    const counts = {};
    INTEREST_CATS.forEach(c => counts[c.key] = 0);
    const wordCount = new Map();
    let total = 0, totalTime = 0;
    for (const s of watch) {
      const dur = Number(s.dur) || 0;
      const watched = Number(s.watchedSec) || 0;
      if (dur > 0 && watched < dur * 0.5) continue;
      total++;
      totalTime += dur;
      const text = (s.title || '') + ' ' + (s.channel || '');
      const toks = String(text).toLowerCase().match(/[a-zа-яё0-9]{4,}/g) || [];
      for (const t of toks) {
        if (t.length < 4 || /^\d+$/.test(t) || INTEREST_STOP.has(t)) continue;
        wordCount.set(t, (wordCount.get(t) || 0) + 1);
      }
      for (const c of INTEREST_CATS) if (c.words.some(w => matchesWord(text, w))) counts[c.key]++;
    }
    const cats = INTEREST_CATS.map(c => ({ key: c.key, label: c.label, icon: c.icon, count: counts[c.key], weight: 0 }));
    const max = Math.max(1, ...cats.map(c => c.count));
    cats.forEach(c => c.weight = c.count ? Math.round((c.count / max) * 100) : 0);
    cats.sort((a, b) => b.count - a.count);
    const top = Array.from(wordCount.entries())
      .map(([w, c]) => ({ w, c }))
      .sort((a, b) => b.c - a.c)
      .slice(0, 24);
    const recent = watch
      .filter(s => { const d = Number(s.dur) || 0; const w = Number(s.watchedSec) || 0; return d <= 0 || w >= d * 0.5; })
      .slice(0, 12)
      .map(s => ({ title: s.title, channel: s.channel, dur: s.dur, ts: s.ts }));
    return {
      total,
      totalMin: Math.round(totalTime / 60),
      generatedAt: new Date().toISOString(),
      cats,
      top,
      recent
    };
  }

  function readBody(req) {
    return new Promise((resolveBody) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolveBody(Buffer.concat(chunks)));
      req.on('error', () => resolveBody(Buffer.alloc(0)));
    });
  }

  async function handle(p, url, req, res) {
    /* ---- поиск ---- */
    if (req.method === 'GET' && p === '/api/yt/search') {
      const q = String(url.searchParams.get('q') || '').trim();
      const n = Math.max(1, Math.min(20, parseInt(url.searchParams.get('n') || '8', 10)));
      if (!q) return json(res, 400, { error: 'need q' });
      try {
        const info = await ytdlpRetry(['--flat-playlist', '-J', 'ytsearch' + n + ':' + q], { timeout: 30000 });
        const items = (info.entries || []).map(en => ({
          id: String(en.id || '').replace(/^unavailable$/, ''),
          title: en.title || '',
          channel: en.channel || en.uploader || '',
          duration: en.duration || 0,
          dur: fmtDur(en.duration),
          thumb: thumbOf(en)
        })).filter(x => x.id);
        return json(res, 200, { q, items });
      } catch (e) {
        return json(res, 502, { error: String(e.stderr || e.message).slice(0, 300) });
      }
    }

    /* ---- инфо о ролике ---- */
    if (req.method === 'GET' && p === '/api/yt/info') {
      const id = String(url.searchParams.get('id') || '');
      if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) return json(res, 400, { error: 'bad id' });
      try {
        const info = await ytdlpRetry(['-J', '--no-playlist', 'https://www.youtube.com/watch?v=' + id]);
        return json(res, 200, {
          id, title: info.title || '', channel: info.channel || info.uploader || '',
          duration: info.duration || 0, dur: fmtDur(info.duration),
          thumb: thumbOf(info), formats: pickFormats(info)
        });
      } catch (e) {
        return json(res, 502, { error: String(e.stderr || e.message).slice(0, 300) });
      }
    }

    /* ---- стрим-прокси ---- */
    if (req.method === 'GET' && p === '/api/yt/stream') {
      const id = String(url.searchParams.get('id') || '');
      const fmt = String(url.searchParams.get('fmt') || 'best');
      if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) return json(res, 400, { error: 'bad id' });
      let direct = '';
      try { direct = await resolveDirect(id, fmt); } catch (e) { return json(res, 502, { error: String(e.message || e).slice(0, 200) }); }
      if (!/^https?:\/\//.test(direct)) return json(res, 502, { error: 'no url' });
      const range = req.headers.range;
      const headers = { 'User-Agent': UA, 'Referer': 'https://www.youtube.com/' };
      if (range) headers.Range = range;
      let attempts = 0;
      const tryFetch = () => {
        const r = https.get(direct, { headers }, (up) => {
          if (up.statusCode >= 400 && attempts < 1) { r.destroy(); attempts++; return tryFetch(); }
          if (up.statusCode >= 400) { try { res.writeHead(502); res.end('upstream ' + up.statusCode); } catch (e) {} return; }
          const hdrs = { 'Content-Type': up.headers['content-type'] || 'video/mp4', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
          if (range && up.statusCode === 206) {
            if (up.headers['content-range']) hdrs['Content-Range'] = up.headers['content-range'];
            if (up.headers['content-length']) hdrs['Content-Length'] = up.headers['content-length'];
          }
          res.writeHead(range && up.statusCode === 206 ? 206 : 200, hdrs);
          up.pipe(res);
          up.on('error', () => { try { res.end(); } catch (e) {} });
        });
        r.on('error', (e) => { if (!res.headersSent) { try { json(res, 502, { error: String(e.message) }); } catch (e2) {} } else { try { res.end(); } catch (e2) {} } });
        req.on('close', () => r.destroy());
      };
      tryFetch();
      return true;
    }

    /* ---- превью ---- */
    if (req.method === 'GET' && p === '/api/yt/thumb') {
      const u = String(url.searchParams.get('u') || '');
      if (!/^https:\/\//.test(u)) return json(res, 400, { error: 'no https url' });
      try {
        const up = await httpGet(u, { 'User-Agent': UA }, 12000);
        if (up.statusCode >= 400) return json(res, 502, { error: 'upstream ' + up.statusCode });
        res.writeHead(200, { 'Content-Type': String(up.headers['content-type'] || 'image/jpeg').split(';')[0], 'Cache-Control': 'public, max-age=86400' });
        up.pipe(res);
        return true;
      } catch (e) { return json(res, 502, { error: 'thumb failed' }); }
    }

    /* ---- вход в Google через cookies ---- */
    if (req.method === 'GET' && p === '/api/yt/auth/status') {
      return json(res, 200, {
        cookies: cookiesExist(),
        cookieSize: cookiesExist() ? (fs.statSync(COOKIES_FILE).size || 0) : 0,
        browser: auth.browser || null
      });
    }

    if (req.method === 'POST' && p === '/api/yt/auth/cookies') {
      const buf = await readBody(req);
      if (!buf || !buf.length) return json(res, 400, { error: 'empty body' });
      if (buf.length > COOKIES_MAX) return json(res, 413, { error: 'cookies too big' });
      try { fs.writeFileSync(COOKIES_FILE, buf, { flag: 'w' }); } catch (e) { return json(res, 500, { error: 'write failed' }); }
      return json(res, 200, { ok: true, size: buf.length });
    }

    if (req.method === 'POST' && p === '/api/yt/auth/browser') {
      let body = {};
      try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
      const b = String(body.browser || '');
      if (b && !['chrome', 'firefox'].includes(b)) return json(res, 400, { error: 'bad browser' });
      auth.browser = b || null;
      saveAuth();
      return json(res, 200, { ok: true, browser: auth.browser });
    }

    if (req.method === 'POST' && p === '/api/yt/auth/clear') {
      try { fs.unlinkSync(COOKIES_FILE); } catch (e) {}
      auth.browser = null;
      saveAuth();
      return json(res, 200, { ok: true });
    }

    /* ---- учёт просмотров ---- */
    if (req.method === 'POST' && p === '/api/yt/watch') {
      let body = {};
      try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
      const id = String(body.id || '');
      if (!/^[A-Za-z0-9_-]{6,}$/.test(id)) return json(res, 400, { error: 'bad id' });
      watch.unshift({
        id,
        title: String(body.title || '').slice(0, 200),
        channel: String(body.channel || '').slice(0, 120),
        dur: Math.max(0, Number(body.dur) || 0),
        watchedSec: Math.max(0, Math.round(Number(body.watchedSec) || 0)),
        ts: Date.now()
      });
      if (watch.length > 1000) watch = watch.slice(0, 1000);
      saveWatch();
      return json(res, 200, { ok: true, total: watch.length });
    }

    if (req.method === 'GET' && p === '/api/yt/interests') {
      return json(res, 200, buildInterests());
    }

    if (req.method === 'POST' && p === '/api/yt/watch/clear') {
      watch = [];
      saveWatch();
      return json(res, 200, { ok: true });
    }

    return false;
  }

  return { handle };
};