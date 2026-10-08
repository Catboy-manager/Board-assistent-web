'use strict';

const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

module.exports = (deps) => {
  const { dataDir, readBody, json, findPoster, aiResolve, cfg, saveCfg } = deps;
  const FILE = path.join(dataDir, 'games.json');
  const busy = new Set();
  let lastError = '';

  let store = load();
  ensureFile();

  function ensureFile() {
    try { fs.mkdirSync(dataDir, { recursive: true }); save(); } catch (e) {}
  }
  function load() {
    try {
      const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      if (d && Array.isArray(d.third)) {
        return {
          third: Array.isArray(d.third) ? d.third : [],
          steam: Array.isArray(d.steam) ? d.steam : [],
          steamAt: d.steamAt || 0,
          source: d.source || ''
        };
      }
    } catch (e) {}
    return { third: [], steam: [], steamAt: 0, source: '' };
  }
  function save() {
    try { fs.writeFileSync(FILE, JSON.stringify(store, null, 2)); } catch (e) {}
  }
  function uid() { return 'gm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function steamCfg() {
    const c = (cfg() && cfg().steam) || {};
    return { steamId: String(c.steamId || '').trim(), apiKey: String(c.apiKey || '').trim() };
  }

  function fetchText(url, timeout = 20000) {
    return new Promise((resolve) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'ru,en;q=0.8' }, signal: ctrl.signal })
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('http ' + r.status))))
        .then(buf => resolve(Buffer.from(buf).toString('utf8')))
        .catch(() => resolve(''))
        .finally(() => clearTimeout(t));
    });
  }

  async function fetchJSON(url) {
    const txt = await fetchText(url);
    if (!txt) return null;
    try { return JSON.parse(txt); } catch (e) { return null; }
  }

  function posterUrl(appid) {
    return 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + appid + '/library_600x900.jpg';
  }

  /* ---- Steam Web API (при наличии ключа) ---- */

  function mapApiGame(g, recently) {
    return {
      appid: g.appid,
      name: g.name || 'Игра ' + g.appid,
      hours: Math.round(((g.playtime_forever || 0) / 60) * 10) / 10,
      hours2w: Math.round(((g.playtime_2weeks || 0) / 60) * 100) / 100,
      last: (recently[g.appid] && recently[g.appid] > 0) ? recently[g.appid] : 0,
      poster: posterUrl(g.appid)
    };
  }

  async function viaApi(sid, key) {
    const owned = await fetchJSON('https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=' +
      encodeURIComponent(key) + '&steamid=' + encodeURIComponent(sid) +
      '&include_appinfo=1&include_played_free_games=1&skip_unvetted_apps=1&format=json');
    const list = owned && owned.response && owned.response.games;
    if (!list || !list.length) return null;
    let recently = {};
    try {
      const rp = await fetchJSON('https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=' +
        encodeURIComponent(key) + '&steamid=' + encodeURIComponent(sid) + '&count=30&format=json');
      const rg = rp && rp.response && rp.response.games;
      if (rg) for (const g of rg) recently[g.appid] = g.rtime_last_played || 0;
    } catch (e) {}
    return list.map(g => mapApiGame(g, recently)).sort((a, b) => b.hours - a.hours);
  }

  /* ---- Публичный профиль без ключа (games/?xml=1) ---- */

  function xmlUnescape(s) {
    return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  }

  async function viaXml(identifier) {
    const base = /^\d+$/.test(identifier) ? 'profiles' : 'id';
    const url = 'https://steamcommunity.com/' + base + '/' + encodeURIComponent(identifier) + '/games/?xml=1&tab=all';
    const xml = await fetchText(url, 20000);
    if (!xml || !/<game>/.test(xml)) return null;
    const out = [];
    const re = /<game>([\s\S]*?)<\/game>/g;
    let mm;
    while ((mm = re.exec(xml))) {
      const b = mm[1];
      const appid = Number((b.match(/<appID>\s*(\d+)/) || [])[1] || 0);
      const name = String((b.match(/<name>(.*?)<\/name>/) || [])[1] || '').trim();
      if (!appid || !name) continue;
      const hr = Number((b.match(/<hoursOnRecord>\s*([\d.]+)/) || [])[1] || 0);
      const min = (Number((b.match(/<minutesOnRecord>\s*(\d+)/) || [])[1]) || 0) / 60;
      const pf = (Number((b.match(/<playtime_forever>\s*(\d+)/) || [])[1]) || 0) / 60;
      const p2 = (Number((b.match(/<playtime_2weeks>\s*(\d+)/) || [])[1]) || 0) / 60;
      const hval = hr || min || pf || 0;
      out.push({
        appid,
        name: xmlUnescape(name),
        hours: Math.round(hval * 10) / 10,
        hours2w: Math.round(p2 * 100) / 100,
        last: 0,
        poster: posterUrl(appid)
      });
    }
    return out.length ? out.sort((a, b) => b.hours - a.hours) : null;
  }

  async function resizeSteamId(steamId, apiKey) {
    if (/^\d+$/.test(steamId)) return steamId;
    if (!apiKey) return steamId;
    const d = await fetchJSON('https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=' +
      encodeURIComponent(apiKey) + '&vanityurl=' + encodeURIComponent(steamId));
    const sid = d && d.response && String(d.response.steamid || '');
    return sid || '';
  }

  async function refreshSteam() {
    const c = steamCfg();
    if (!c.steamId) { store.steam = []; store.steamAt = 0; store.source = 'none'; lastError = ''; save(); return { source: 'none', games: [] }; }
    let err = null;
    if (c.apiKey) {
      try {
        const sid = await resizeSteamId(c.steamId, c.apiKey);
        if (sid) {
          const g = await viaApi(sid, c.apiKey);
          if (g) { store.steam = g; store.steamAt = Date.now(); store.source = 'api'; lastError = ''; save(); return { source: 'api', games: g }; }
        } else err = new Error('vanity не разрешился в steamID64');
      } catch (e) { err = e; }
    }
    try {
      const g = await viaXml(c.steamId);
      if (g) { store.steam = g; store.steamAt = Date.now(); store.source = 'xml'; lastError = ''; save(); return { source: 'xml', games: g }; }
      err = err || new Error('XML пуст — профиль Steam закрыт или нет игр');
    } catch (e) { err = err || e; }
    lastError = err && err.message ? err.message : 'неизвестная ошибка';
    throw err || new Error(lastError);
  }

  /* ---- Поиск в каталоге сторонних сервисов (без ключей): GOG + Steam Store ---- */
  /* GOG: https://catalog.gog.com/v1/catalog?query=…&itemType=game (публичный, без авторизации).
     Steam: https://store.steampowered.com/api/storesearch/?term=…&l=ru&cc=ru (без ключа).
     Оба ищут только по латинице — кириллический запрос транслитерируем запасным термином. */

  const GOG_CATALOG = 'https://catalog.gog.com/v1/catalog?limit=12&itemType=game&query=';

  /* Русское название → англ. поисковый термин (переводы, не ложащиеся на транслит) */
  const ALIASES = {
    'ведьмак': 'witcher', 'киберпанк': 'cyberpunk', 'призрачная свобода': 'phantom liberty',
    'витчер': 'witcher', 'хитман': 'hitman', 'фар край': 'far cry', 'кризис': 'crysis',
    'элден ринг': 'elden ring', 'дивити': 'divinity', 'мафия': 'mafia', 'сталкер': 'stalker'
  };

  function translit(s) {
    const M = { 'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya',
      'А':'A','Б':'B','В':'V','Г':'G','Д':'D','Е':'E','Ё':'E','Ж':'Zh','З':'Z','И':'I','Й':'Y','К':'K','Л':'L','М':'M','Н':'N','О':'O','П':'P','Р':'R','С':'S','Т':'T','У':'U','Ф':'F','Х':'H','Ц':'C','Ч':'Ch','Ш':'Sh','Щ':'Sch','Ъ':'','Ы':'Y','Ь':'','Э':'E','Ю':'Yu','Я':'Ya' };
    return String(s).replace(/[а-яА-ЯёЁ]/g, ch => M[ch] || ch);
  }

  function rub(price) {
    const v = price && price.final;
    if (v === undefined || v === null) return '';
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v || '').slice(0, 40);
    return (n % 1000 ? Math.round(n) / 100 : Math.round(n / 100)) + ' ₽';
  }

  async function gogSearch(term) {
    const d = await fetchJSON(GOG_CATALOG + encodeURIComponent(term));
    if (!d) return null;
    const list = Array.isArray(d.products) ? d.products : [];
    return list
      .filter(p => p.productType === 'game' && p.title)
      .map(p => ({
        id: String(p.id), source: 'GOG',
        title: String(p.title).slice(0, 120),
        store: String(p.storeLink || ('https://www.gog.com/game/' + String(p.slug || ''))).slice(0, 300),
        poster: String(p.coverVertical || '').slice(0, 400),
        price: (p.price && typeof p.price.final === 'string') ? p.price.final.slice(0, 40) : '',
        genres: Array.isArray(p.genres) ? p.genres.map(x => (typeof x === 'string' ? x : (x && x.name) || '')).filter(Boolean).slice(0, 3) : [],
        devs: Array.isArray(p.developers) ? p.developers.map(x => (typeof x === 'string' ? x : (x && x.name) || '')).filter(Boolean).slice(0, 3) : []
      }));
  }

  async function steamSearch(term) {
    const d = await fetchJSON('https://store.steampowered.com/api/storesearch/?l=ru&cc=ru&term=' + encodeURIComponent(term));
    if (!d || !Array.isArray(d.items)) return null;
    return d.items
      .filter(x => x.type === 'app' && x.name)
      .map(x => ({
        id: String(x.id), source: 'Steam',
        title: String(x.name).slice(0, 120),
        store: 'https://store.steampowered.com/app/' + x.id + '/',
        poster: 'https://cdn.cloudflare.steamstatic.com/steam/apps/' + x.id + '/library_600x900.jpg',
        price: rub(x.price),
        genres: [], devs: []
      }));
  }

  function normTitle(s) {
    return String(s || '').toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');
  }

  async function catalogSearch(q) {
    const term = String(q || '').trim().slice(0, 80);
    if (!term) return [];
    const terms = Array.from(new Set([term, translit(term), ALIASES[term.toLowerCase()] || ''].filter(Boolean)));
    const hit = (g, t) => normTitle(g.title).includes(normTitle(t));
    let games = [];
    let gogUnav = false, steamUnav = false;

    for (const t of terms) {
      let gog;
      try { gog = await gogSearch(t); } catch (e) { gog = null; }
      if (gog === null) gogUnav = true;
      else {
        const matched = gog.filter(g => hit(g, t));
        if (matched.length) { games.push(...matched); break; }
      }
    }

    let steamCollected = [];
    for (const t of terms) {
      let st;
      try { st = await steamSearch(t); } catch (e) { st = null; }
      if (st === null) steamUnav = true;
      else {
        const matched = st.filter(g => hit(g, t));
        if (matched.length) { steamCollected = matched; break; }
      }
    }

    if (gogUnav && steamUnav && !games.length) {
      throw new Error('Каталоги GOG и Steam недоступны — попробуйте позже');
    }

    const seen = new Set();
    return games.concat(steamCollected).filter(g => {
      const k = normTitle(g.title);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /* ---- Сторонние (не Steam) игры, постеры как у фильмов ---- */

  function thirdAdd(body) {
    const title = String(body.title || '').trim().slice(0, 120);
    if (!title) return null;
    const hours = Math.max(0, Number(body.hours) || 0);
    const rec = {
      id: uid(), title,
      poster: String(body.poster || '').trim().slice(0, 400),
      store: String(body.store || '').trim().slice(0, 300),
      price: String(body.price || '').trim().slice(0, 40),
      hours, played: !!body.played, added: Date.now()
    };
    store.third.unshift(rec);
    save();
    if (!rec.poster) resolveThird(rec.id);
    return rec;
  }

  async function resolveThird(id, alt) {
    const g = store.third.find(x => x.id === id);
    if (!g || busy.has(id)) return;
    if (!alt && g.poster) return;
    busy.add(id);
    try {
      let poster = '';
      if (findPoster) { try { poster = String(await findPoster(g.title) || '').trim(); } catch (e) {} }
      if (!poster && aiResolve) { try { poster = String(await aiResolve(g.title) || '').trim(); } catch (e) {} }
      if (poster && /^https?:\/\//i.test(poster) && (!alt || poster !== g.poster)) { g.poster = poster; save(); }
    } finally {
      busy.delete(id);
    }
  }

  async function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/games') {
      return json(res, 200, {
        steam: store.steam,
        third: store.third,
        pending: store.third.filter(g => !g.poster).length,
        cfg: { steamId: steamCfg().steamId, hasKey: !!steamCfg().apiKey },
        source: store.source,
        steamAt: store.steamAt,
        lastError
      });
    }

    if (req.method === 'POST' && p === '/api/games/refresh') {
      try { const r = await refreshSteam(); return json(res, 200, Object.assign({ ok: true }, r)); }
      catch (e) { return json(res, 200, { ok: false, error: e.message, lastError }); }
    }

    if (req.method === 'POST' && p === '/api/games/config') {
      let body = {};
      try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
      const c = cfg();
      if (!c.steam) c.steam = {};
      if (typeof body.steamId === 'string') c.steam.steamId = body.steamId.trim().slice(0, 80);
      if (typeof body.apiKey === 'string') c.steam.apiKey = body.apiKey.trim().slice(0, 64);
      saveCfg();
      try { const r = await refreshSteam(); return json(res, 200, Object.assign({ ok: true }, r)); }
      catch (e) { return json(res, 200, { ok: false, configured: true, error: e.message, lastError }); }
    }

    if (req.method === 'POST' && p === '/api/games/third') {
      let body = {};
      try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
      const rec = thirdAdd(body);
      if (!rec) return json(res, 400, { error: 'название обязательно' });
      return json(res, 200, { game: rec });
    }

    if (req.method === 'POST' && p === '/api/games/catalog') {
      let body = {};
      try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
      try {
        const list = await catalogSearch(body.q);
        return json(res, 200, { ok: true, q: String(body.q || '').trim(), games: list });
      } catch (e) {
        return json(res, 200, { ok: false, error: (e && e.message) || 'не удалось найти игры' });
      }
    }

    const m = p.match(/^\/api\/games\/third\/([^/]+)\/(delete|resolve|toggle|hours)$/);
    if (m && req.method === 'POST') {
      const g = store.third.find(x => x.id === m[1]);
      if (!g) return json(res, 404, { error: 'игра не найдена' });
      if (m[2] === 'delete') { store.third = store.third.filter(x => x.id !== g.id); save(); return json(res, 200, { ok: true }); }
      if (m[2] === 'toggle') { g.played = !g.played; save(); return json(res, 200, { game: g }); }
      if (m[2] === 'resolve') { const alt = url.searchParams.get('alt') === '1'; resolveThird(g.id, alt); return json(res, 200, { game: g, queued: true }); }
      if (m[2] === 'hours') {
        let body = {};
        try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
        const h = Number(body.hours);
        if (Number.isFinite(h) && h >= 0) g.hours = Math.round(h * 10) / 10;
        save();
        return json(res, 200, { game: g });
      }
    }

    return false;
  }

  return { handle };
};