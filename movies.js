'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const SEED = [
  'Банши', 'The Terminal (2004)', 'The Cat in the Hat', 'Steamboy',
  'Клаус (мультфильм)', 'Всё везде и сразу', 'Призрак в доспехах',
  'Как Витька Чеснок вёз Лёху Штыря в дом инвалидов', 'Book of Circus',
  'Сопрано', 'Ничжоу', 'Секрет НИМЗ', 'Чёрный Котёл (мультфильм)',
  'Запах женщины', 'Дневник памяти', 'Спеши любить', 'Наруто',
  'Последний человек', 'Re: Жизнь в другом мире с нуля', 'Gunsmith Cats',
  'Эрго прокси', 'Дорохедоро', 'Человек-бензопила', 'Отец',
  'Подружка-оленюшка Нокотан', 'Ши-Ра', 'Новый папа', 'Задача трёх тел',
  'Дурак', 'Брат', 'Настоящий детектив', 'Паразиты', 'Остров проклятых',
  'Дом, который построил Джек', 'Королевство полной луны', 'Мост в Террабитию',
  'Твин Пикс', 'Молодой папа', 'Догвилль', 'Амели', 'Сага о Винланде'
];

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

module.exports = (deps) => {
  const { dataDir, readBody, json, aiResolve } = deps;
  const FILE = path.join(dataDir, 'movies.json');
  const busy = new Set();

  let store = load();
  ensureFile();

  function ensureFile() {
    try { fs.mkdirSync(dataDir, { recursive: true }); save(); } catch (e) {}
  }
  function load() {
    try {
      if (fs.existsSync(FILE)) {
        const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        if (d && Array.isArray(d.movies)) return d;
      }
    } catch (e) {}
    return { movies: SEED.map(seedMovie) };
  }
  function save() {
    try { fs.writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch (e) {}
  }
  function seedMovie(title) {
    return { id: uid(), title, poster: '', watched: false, added: Date.now(), links: makeLinks(title) };
  }
  function uid() { return 'mv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // Сайты для просмотра в порядке приоритета: подписка Яндекс Плюс → ВК → пиратские
  function makeLinks(title) {
    const q = encodeURIComponent(title);
    return [
      { site: 'Кинопоиск', url: 'https://www.kinopoisk.ru/index.php?kp_query=' + q },
      { site: 'ВК Видео', url: 'https://vk.com/video?q=' + q },
      { site: 'HDrezka', url: 'https://hdrezka.ag/search/?q=' + q },
      { site: 'Поиск онлайн', url: 'https://yandex.ru/search/?text=' + encodeURIComponent(title + ' смотреть онлайн') }
    ];
  }

  /* ---- HTTP-хелперы ---- */

  function fetchText(url, timeout = 15000) {
    return new Promise((resolvePromise) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.8,en;q=0.5' }, signal: ctrl.signal })
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('http ' + r.status))))
        .then(buf => resolvePromise(Buffer.from(buf).toString('utf8')))
        .catch(() => resolvePromise(''))
        .finally(() => clearTimeout(t));
    });
  }

  function isRaster(u) {
    return /\.(jpe?g|png|webp)(\?.*)?$/i.test((u || '').split('?')[0]);
  }

  let wikiCoolUntil = 0;

  async function wikiApi(url) {
    if (Date.now() < wikiCoolUntil) return null;
    const text = await fetchText(url, 12000);
    if (!text) { wikiCoolUntil = Date.now() + 25000; return null; }
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  function cleanExact(t) {
    return String(t || '')
      .replace(/\((\d{4})\)/g, ' ')
      .replace(/\([^)]*\)/g, ' ')
      .replace(/[«»"'']/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  const FILM_RE = {
    ru: /фильм|сериал|мультфильм|аниме|телесериал|кинокомедия/,
    en: /\bfilm\b|\bmovie\b|\bseries\b|\btelevision\b|\banime\b|animated|manga|cartoon/
  };

  /* ---- постер через Wikipedia (бесплатно, без ключа): точная страница -> картинка,
         иначе поиск с проверкой категорий (фильм/сериал/аниме) ---- */

  function pickImage(pg) {
    if (!pg || typeof pg !== 'object') return '';
    const thumb = pg.thumbnail && pg.thumbnail.source;
    const original = pg.original && pg.original.source;
    for (const u of [thumb, original]) {
      if (u && isRaster(u) && !/\/Sig\.|_logo|_flag|_map|_coat/i.test(u)) return u;
    }
    return '';
  }

  async function wikiExact(lang, title) {
    const qs = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      titles: cleanExact(title),
      prop: 'pageimages',
      piprop: 'thumbnail|original',
      pithumbsize: 700
    });
    const data = await wikiApi('https://' + lang + '.wikipedia.org/w/api.php?' + qs.toString());
    const pages = data && data.query && data.query.pages;
    if (!pages) return [];
    const head = cleanExact(title).toLowerCase().split(/[^a-zа-яё0-9]+/i).filter(w => w.length >= 4).slice(0, 3);
    const out = [];
    for (const k of Object.keys(pages)) {
      const pg = pages[k];
      if (Number(k) < 0 || !pg) continue;
      if (!pickImage(pg)) continue;
      const lt = (pg.title || '').toLowerCase();
      const score = head.filter(w => lt.includes(w)).length;
      if (score < 1) continue;
      out.push({ url: pickImage(pg), title: pg.title, score });
    }
    return out;
  }

  async function wikiSearch(lang, title) {
    const qs = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'search',
      gsrsearch: title,
      gsrlimit: 8,
      gsrnamespace: 0,
      prop: 'pageimages|categories',
      piprop: 'thumbnail|original',
      pithumbsize: 700,
      cllimit: 30
    });
    const data = await wikiApi('https://' + lang + '.wikipedia.org/w/api.php?' + qs.toString());
    const pages = data && data.query && data.query.pages;
    if (!pages) return [];
    const tokens = String(title).toLowerCase().split(/[^a-zа-яё0-9]+/i).filter(w => w.length >= 4);
    const out = [];
    for (const k of Object.keys(pages)) {
      const pg = pages[k];
      if (Number(k) < 0 || !pg) continue;
      const img = pickImage(pg);
      if (!img) continue;
      const cats = (pg.categories || []).map(c => (c.title || '')).join(' ');
      if (!FILM_RE[lang].test(cats)) continue;
      const lt = (pg.title || '').toLowerCase();
      const score = tokens.filter(w => lt.includes(w)).length;
      if (score < 1) continue;
      out.push({ url: img, title: pg.title, score });
    }
    return out;
  }

  // предпочтительны локальные (fair-use) постеры и пути со словом poster
  function scoreImage(c) {
    let s = c.score || 0;
    const u = c.url || '';
    if (/\/wikipedia\/(ru|en)\//i.test(u)) s += 3;
    if (/poster|обложк|cover/i.test(u)) s += 2;
    if (/wikipedia\/commons/i.test(u)) s -= 1;
    return s;
  }

  async function findPosterWiki(title) {
    const hasCyrillic = /[а-яё]/i.test(title);
    const langs = hasCyrillic ? ['ru', 'en'] : ['en', 'ru'];
    const cands = [];
    for (const lang of langs) {
      try {
        cands.push(...(await wikiExact(lang, title)).map(c => Object.assign(c, { lang })));
      } catch (e) {}
      try {
        cands.push(...(await wikiSearch(lang, title)).map(c => Object.assign(c, { lang })));
      } catch (e) {}
    }
    if (!cands.length) return '';
    cands.sort((a, b) => scoreImage(b) - scoreImage(a));
    return cands[0].url;
  }

  const GOOD_HOSTS = [
    'm.media-amazon.com', 'image.tmdb.org', 'upload.wikimedia.org', 'kinopoisk.ru',
    'st.kp.yandex.net', 'kongu.ee', 'kinorium.com', 'images.kinorium.com', 'film.ru'
  ];

  /* ---- поиск постера через Bing Images (fallback; берём только заведомо постерные CDN) ---- */

  async function findPosterBing(title) {
    const queries = [
      title + ' постер фильм', title + ' poster movie', title + ' фильм постер'
    ];
    for (const q of queries) {
      const html = await fetchText('https://www.bing.com/images/search?q=' + encodeURIComponent(q) + '&qft=+filterui:imagesize-large');
      if (!html) continue;
      const urls = [];
      const re = /&quot;murl&quot;:&quot;(https?:\/\/[^&"]+)/g;
      let mm;
      while ((mm = re.exec(html)) && urls.length < 15) {
        const u = mm[1].replace(/\\u002[fF]|\\\//g, '/').trim();
        if (isRaster(u) && u.length < 300) urls.push(u);
      }
      const good = urls.filter(u => GOOD_HOSTS.some(h => u.includes(h)));
      if (good.length) {
        return good.find(u => /poster/i.test(u)) || good[0];
      }
    }
    return '';
  }

  async function resolveMovie(m) {
    if (!m || busy.has(m.id) || m.poster) return;
    busy.add(m.id);
    try {
      let poster = '';
      // 1) Wikipedia (без ключа, надёжно)
      try { poster = String(await findPosterWiki(m.title) || '').trim(); } catch (e) {}
      // 2) Bing-картинки
      if (!poster) { try { poster = await findPosterBing(m.title); } catch (e) {} }
      // 3) ИИ (последняя попытка; free-tier big-pickle может быть недоступен извне opencode)
      if (!poster && aiResolve) { try { poster = String(await aiResolve(m.title) || '').trim(); } catch (e) {} }
      if (poster && /^https?:\/\//i.test(poster)) { m.poster = poster; save(); }
    } finally {
      busy.delete(m.id);
    }
  }

  function nextToResolve() {
    const need = store.movies.filter(m => !m.poster).sort((a, b) => (Number(a.watched) - Number(b.watched)) || (a.added - b.added));
    return need.find(m => !busy.has(m.id)) || null;
  }

  /* Фоновая авто-подтяжка постеров: по одному за 6с, чтобы не нагружать источники */
  function prime() {
    const timer = setInterval(() => {
      const m = nextToResolve();
      if (m) resolveMovie(m).catch(() => {});
    }, 6000);
    if (timer.unref) timer.unref();
    return timer;
  }

  async function findPosterAny(title) {
    let url = '';
    try { url = await findPosterWiki(title); } catch (e) {}
    if (!url) { try { url = await findPosterBing(title); } catch (e) {} }
    return url;
  }

  async function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/movies') {
      return json(res, 200, { movies: store.movies, pending: store.movies.filter(m => !m.poster).length });
    }

    if (req.method === 'POST' && p === '/api/movies') {
      let body = {};
      try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
      const title = String(body.title || '').trim().slice(0, 120);
      if (!title) return json(res, 400, { error: 'название обязательно' });
      const mv = { id: uid(), title, poster: '', watched: false, added: Date.now(), links: makeLinks(title) };
      store.movies.unshift(mv);
      save();
      resolveMovie(mv);
      return json(res, 200, { movie: mv, queued: true });
    }

    if (req.method === 'POST' && p === '/api/movies/resolve') {
      const m = nextToResolve();
      if (!m) return json(res, 200, { ok: true, queued: 0 });
      resolveMovie(m);
      return json(res, 200, { ok: true, queued: 1 });
    }

    const m2 = p.match(/^\/api\/movies\/([^/]+)\/(toggle|delete|resolve)$/);
    if (m2 && req.method === 'POST') {
      const mv = store.movies.find(x => x.id === m2[1]);
      if (!mv) return json(res, 404, { error: 'фильм не найден' });
      if (m2[2] === 'toggle') { mv.watched = !mv.watched; save(); return json(res, 200, { movie: mv }); }
      if (m2[2] === 'delete') { store.movies = store.movies.filter(x => x.id !== mv.id); save(); return json(res, 200, { ok: true }); }
      if (m2[2] === 'resolve') { resolveMovie(mv); return json(res, 200, { movie: mv, queued: true }); }
    }

    return false;
  }

  return {
    handle,
    all() { return store.movies; },
    refresh() { store = load(); },
    prime,
    findPosterFor: findPosterAny
  };
};