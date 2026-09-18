'use strict';

const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const SOURCES = [
  { id: 'lenta', name: 'Лента', url: 'https://lenta.ru/rss/news' },
  { id: 'ria', name: 'РИА', url: 'https://ria.ru/export/rss2/archive/index.xml' },
  { id: 'tass', name: 'ТАСС', url: 'https://tass.ru/rss/v2.xml' },
  { id: 'kommersant', name: 'Ъ', url: 'https://www.kommersant.ru/rss/news.xml' },
  { id: 'habr', name: 'Хабр', url: 'https://habr.com/ru/rss/news/all/' },
  { id: 'nasa', name: 'NASA', url: 'https://www.nasa.gov/feed/' },
  { id: 'space', name: 'Space', url: 'https://www.space.com/feeds/all' },
  { id: 'bbc', name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'reuters', name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews' },
  { id: 'verge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
  { id: 'ign', name: 'IGN', url: 'https://feeds.ign.com/ign/all' },
  { id: 'polygon', name: 'Polygon', url: 'https://www.polygon.com/rss/index.xml' },
  { id: 'gamespot', name: 'GameSpot', url: 'https://www.gamespot.com/feeds/mashup/' },
  { id: 'eurogamer', name: 'Eurogamer', url: 'https://www.eurogamer.net/feed' },
  { id: 'explore', name: 'Explore', url: 'https://explore.org/feed' },
  { id: 'arstechnica', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index' }
];

const CATS = [
  {
    key: 'politics', label: 'Политика', icon: '🏛', base: 4,
    words: ['политик', 'политич', 'президент', 'правител', 'госдум', 'парламент', 'депутат', 'министр', 'спикер', 'санкци', 'выбор', 'референдум', 'законопроект', 'законодат', 'конфликт', 'переговор', 'война', 'войны', 'миноборон', 'украин', 'путин', 'трамп', 'протест', 'митинг', 'дипломат', 'эмбарго', 'нато', 'партии', 'партийн', 'партия', 'nato', 'politics', 'election', 'president', 'government', 'sanction', 'parliament']
  },
  {
    key: 'tech', label: 'Технологии', icon: '💻', base: 4,
    words: ['технолог', 'смартфон', 'гаджет', 'компьютер', 'ноутбук', 'процессор', 'микросхем', 'чип', 'нейросет', 'нейрон', 'интеллект', 'робот', 'приложени', 'электроник', 'стартап', 'квант', 'айфон', 'iphone', 'android', 'андроид', 'алгоритм', 'кибератак', 'киберпреступ', 'вирус', 'хакер', 'датчик', 'батареи', 'беспилот', 'автопилот', 'интернет', 'сервер', 'данных', 'чипсет', 'gpt', 'artificial', 'technology', 'chip', 'robot', 'startup', 'software', 'hardware', 'науч', 'учён', 'исследован', 'открыт', 'инноваци', 'изобретен', 'эксперимент', 'лаборатор', 'биотехнолог', 'генн', 'медицин', 'клиник', 'вакцин', 'лекарств', 'исслед', 'разработ', 'модел', 'ии', 'байт', 'telegram', 'видеокарт', 'графическ', 'аккумултор', 'зарядк', 'экран', 'диспле', 'камер', 'фотографи', 'искусственн']
  },
  {
    key: 'games', label: 'Игры', icon: '🎮', base: 3,
    words: ['видеоигр', 'видео-игр', 'гейм', 'геймер', 'гейминг', 'геймплей', 'киберспорт', 'приставк', 'эльден', 'steam', 'playstation', 'ps5', 'xbox', 'nintendo', 'switch', 'rpg', 'mmo', 'gta', 'fortnite', 'minecraft', 'минекрафт', 'игра', 'игры', 'игровой', 'игров', 'играть', 'поигра', 'геймпад', 'трейлер']
  },
  {
    key: 'space', label: 'Космос', icon: '🚀', base: 3,
    words: ['косм', 'ракет', 'мкс', 'луна', 'лунный', 'марс', 'марсиан', 'спутник', 'астроном', 'галактик', 'орбит', 'телескоп', 'астероид', 'вселенн', 'созвезд', 'солнечн', 'планет', 'экзопланет', 'межпланетн', 'астронавт', 'космонавт', 'нейтронн', 'сверхнов', 'spacex', 'rocket', 'iss', 'nasa', 'roskosmos', 'starlink', 'orbit', 'satellite', 'galaxy']
  },
  {
    key: 'auto', label: 'Авто', icon: '🚗', base: 3,
    words: ['автомобил', 'авто', 'электромобил', 'автопром', 'дилер', 'бензин', 'седан', 'кроссовер', 'тягач', 'мотоцикл', 'легков', 'грузовик', 'автобус', 'пикап', 'гибрид', 'двс', 'tesla', 'car', 'vehicle', 'automobile']
  },
  { key: 'other', label: 'Прочее', icon: '📰', base: 2, words: [] }
];

const RATINGS = { '-2': 'совсем не интересно', '-1': 'не интересно', '0': 'нейтрально', '1': 'интересно', '2': 'крайне заинтересован' };

// Базовые интересы по категориям — политика урезана (пользователь: «меньше политики»),
// игры (особенно выход новинок) и технологии/наука — в приоритете.
const DEFAULT_PREFS = { politics: 0.2, tech: 1.5, games: 1.8, space: 1.2, auto: -0.8 };

module.exports = (deps) => {
  const { dataDir, readBody, json } = deps;
  const FILE = path.join(dataDir, 'news.json');
  const ITEMS_CACHE = path.join(dataDir, 'news-items.json');

  let rated = {};
  let prefs = {};
  let items = {};
  let vecs = [];      // динамические векторы интересов (авто-расширение) — [ {key,label,icon,base,learned:[]} ]
  let learned = {};   // наращённые слова по статичным категориям: catKey -> Set-массив токенов
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    rated = (d && d.rated) || {};
    prefs = (d && d.prefs) || {};
    vecs = (d && d.vecs) || [];
    learned = (d && d.learned) || {};
  } catch (e) {}
  try {
    const d = JSON.parse(fs.readFileSync(ITEMS_CACHE, 'utf8'));
    items = (d && d.items) || {};
  } catch (e) {}

  function saveRated() { try { fs.writeFileSync(FILE, JSON.stringify({ rated, prefs, vecs, learned }, null, 2)); } catch (e) {} }
  function saveVecs() { try { fs.writeFileSync(FILE, JSON.stringify({ rated, prefs, vecs, learned }, null, 2)); } catch (e) {} }
  function saveItems() {
    try {
      const slim = {};
      Object.keys(items).slice(-600).forEach(k => { slim[k] = items[k]; });
      fs.writeFileSync(ITEMS_CACHE, JSON.stringify({ items: slim }, null, 2));
    } catch (e) {}
  }

  function fetchText(url) {
    return new Promise((resolvePromise) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.8,en;q=0.5' }, signal: ctrl.signal })
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('http ' + r.status))))
        .then(buf => resolvePromise(Buffer.from(buf).toString('utf8')))
        .catch(() => resolvePromise(''))
        .finally(() => clearTimeout(t));
    });
  }

  function decodeEntities(s) {
    if (!s) return '';
    return String(s)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (m, c) => { try { return String.fromCodePoint(Number(c)); } catch (e) { return ' '; } })
      .replace(/&#x([0-9a-fA-F]+);/g, (m, c) => { try { return String.fromCodePoint(parseInt(c, 16)); } catch (e) { return ' '; } })
      .trim();
  }
  function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); }
  function grab(block, tag) {
    const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i');
    const m = block.match(re);
    return m ? decodeEntities(stripTags(m[1])) : '';
  }
  function normalize(t) { return String(t || '').toLowerCase().replace(/[^\wа-яё]+/gi, ''); }

  function parseRSS(xml) {
    const out = [];
    const re = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = re.exec(xml))) {
      const title = grab(m[1], 'title');
      if (!title) continue;
      out.push({
        title,
        link: grab(m[1], 'link'),
        date: grab(m[1], 'pubDate'),
        desc: grab(m[1], 'description')
      });
    }
    return out;
  }

  function matchesToken(text, kw) {
    const toks = text.split(/[^a-zа-яё0-9]+/i);
    for (const t of toks) {
      if (t.length >= kw.length && (kw.length >= 4 ? t.startsWith(kw) : t === kw)) return true;
    }
    return false;
  }

  const SPORTS_BLOCK = ['спорт', 'футбол', 'хокке', 'теннис', 'баскетбол', 'волейбол', 'бадминтон', 'турнир', 'чемпионат', 'олимпиад', 'паралимпиад', 'сборной', 'матч', 'матче', 'голкипер', 'игрок', 'игрока', 'игроков', 'футболист', 'хоккеист', 'болельщик', 'гандбол', 'регби', 'крикет', 'фигурн', 'биатлон', 'лыжн', 'конькоб', 'боксер', 'бокс', 'ауф', 'бразил', 'сборная', 'квалификац', 'судья', 'арбитр', 'sport', 'football', 'hockey', 'tennis', 'soccer', 'matchday', 'league', 'champion', 'olympic', 'nba', 'nhl', 'ufc', 'mma'];

  function categorize(text) {
    const t = String(text || '').toLowerCase();
    const sportsy = SPORTS_BLOCK.some(k => matchesToken(t, k));
    for (const c of CATS) {
      if (c.key === 'other') continue;
      for (const w of c.words) {
        if (matchesToken(t, w)) {
          if (c.key === 'games' && sportsy) return { cat: 'other', w: 'sport' };
          return { cat: c.key, w };
        }
      }
    }
    return { cat: 'other', w: '' };
  }

  const STOP = new Set(['и','в','во','не','что','он','на','я','с','со','как','а','то','все','она','так','его','но','да','ты','к','у','же','вы','за','бы','по','только','ее','мне','было','вот','от','меня','еще','нет','о','из','ему','теперь','когда','даже','ну','вдруг','ли','если','уже','или','ни','быть','был','него','до','вас','нибудь','опять','уж','вам','ведь','там','потом','себя','ничего','ей','может','они','тут','где','есть','надо','ней','для','мы','тебя','их','чем','была','сам','чтоб','без','будто','чего','раз','тоже','себе','под','будет','ж','тогда','кто','этот','того','потому','этого','какой','совсем','ним','здесь','этом','один','почти','мой','тем','чтобы','нее','сейчас','были','куда','зачем','всех','никогда','можно','при','наконец','два','об','другой','хотя','после','над','больше','тот','через','эти','нас','про','всего','них','какая','много','разве','три','эту','моя','впрочем','хорошо','свою','этой','перед','иногда','лучше','чуть','том','нельзя','такой','им','более','всегда','конечно','всю','между','the','and','for','are','but','not','you','all','any','can','had','her','was','one','our','out','day','get','has','his','how','man','new','now','old','see','two','way','who','boy','did','its','let','put','say','she','too','use','that','with','have','this','will','your','from','they','know','want','been','good','much','some','time','very','when','come','here','just','like','long','make','many','over','such','take','than','them','well','were','what','would','для','население','сейчас']);

  function newsTokens(t) {
    return (String(t || '').toLowerCase().match(/[а-яёa-z]{4,}/g) || []).filter(x => x.length >= 4 && !STOP.has(x));
  }

  function vecSimilarity(vec, text) {
    const toks = newsTokens(text);
    if (!toks.length) return 0;
    const set = new Set(Array.isArray(vec.learned) ? vec.learned : []);
    let hit = 0;
    for (const t of toks) if (set.has(t)) hit++;
    return hit / Math.max(1, toks.length);
  }

  /* Вектор-карта: положительная оценка дообучает вектор словами новости
     (вектор «поворачивается» к интересу). Если тема не знакома ни одному вектору —
     автоматически СОЗДАЁТСЯ новый вектор: карта интересов расширяется по мере роста
     интересов (динамический авто-рост vecs). */
  function learnVec(vec, text, delta) {
    const toks = newsTokens(text);
    const seen = new Set(Array.isArray(vec.learned) ? vec.learned : []);
    let changed = false;
    for (const t of toks) {
      if (seen.has(t)) continue;
      if (delta >= 1 && seen.size < 80) { seen.add(t); changed = true; }
    }
    if (changed) {
      vec.learned = Array.from(seen);
      if (typeof saveVecs === 'function') saveVecs();
    }
    return changed;
  }

  function expandVecs(item, r) {
    if (!item || !(r >= 1)) return 0;
    const text = (item.title || '') + ' ' + (item.desc || '');
    let best = null, bestSim = 0.14;
    for (const v of vecs) {
      const sim = vecSimilarity(v, text);
      if (sim > bestSim) { bestSim = sim; best = v; }
    }
    if (!best) {
      const label = String(item.title || 'Новая тема').split(' ').slice(0, 3).join(' ') || 'Тема';
      vecs.push({ key: 'vec-' + (vecs.length + 1), label, icon: '✨', base: 0.4, learned: [] });
      best = vecs[vecs.length - 1];
    }
    learnVec(best, text, 1);
    if (typeof saveVecs === 'function') saveVecs();
    return vecs.length;
  }

  function weight(key) {
    const vals = Object.values(rated).filter(r => (r.k || r.cat) === key).map(r => r.r);
    let w;
    if (!vals.length) {
      const p = prefs[key] != null ? prefs[key] : DEFAULT_PREFS[key];
      w = p != null ? p : 0;
    } else {
      w = vals.reduce((a, b) => a + b, 0) / vals.length;
    }
    const own = Array.isArray(learned[key]) ? learned[key].length : 0;
    if (own > 0) w += 0.15 * Math.log2(own + 1);
    for (const v of vecs) {
      if (!v || v.key !== key) continue;
      const n = (Array.isArray(v.learned) ? v.learned : []).length;
      if (n > 0) w += 0.18 * Math.log2(n + 1);
    }
    return Math.max(-2, Math.min(2, Math.round(w * 10) / 10));
  }

  /* ---------- Векторная карта интересов ----------
     Каждая категория = вектор { key, label, base, words, learned:[] }.
     Оценка новости дообучает вектор его словами (вектор «поворачивается» к интересу).
     Новая тема, не похожая ни на один вектор, при позитивной оценке создаёт НОВЫЙ вектор
     (карта расширяется по мере роста интересов) — динамический авто-рост `vecs`.
     Данные сохраняются в news.json (vecs). */

  function learnVec(vec, text, delta) {
    const toks = (String(text || '').toLowerCase().match(/[а-яёa-z0-9]{4,}/g) || []).filter(t => t.length >= 4 && !STOP.has(t));
    const seen = new Set(Array.isArray(vec.learned) ? vec.learned : []);
    let changed = false;
    for (const t of toks) {
      if (seen.has(t)) continue;
      if (delta >= 1 && seen.size < 80) { seen.add(t); changed = true; }
    }
    if (changed) {
      vec.learned = Array.from(seen);
      if (typeof saveVecs === 'function') saveVecs();
    }
    return toks;
  }

  async function collectAll() {
    const all = [];
    const jobs = SOURCES.map(async (s) => {
      const xml = await fetchText(s.url);
      if (!xml) return;
      for (const it of parseRSS(xml)) {
        const ts = new Date(it.date).getTime();
        if (!(ts > 0)) continue;
        all.push({ title: it.title, link: it.link, desc: it.desc, ts, src: s.name });
      }
    });
    await Promise.allSettled(jobs);

    const seen = new Set();
    const uniq = [];
    for (const it of all.sort((a, b) => b.ts - a.ts)) {
      const key = normalize(it.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const mw = categorize(it.title + ' ' + it.desc);
      const cat = mw.cat;
      uniq.push({ key, title: it.title, link: it.link || '', date: new Date(it.ts).toISOString(), ts: it.ts, cat, matched: mw.w, src: it.src });
    }
    return uniq;
  }

  function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }

  async function digest(period) {
    const now = new Date();
    const today = dayStart(now);
    const from = period === 'yesterday' ? today - 86400000 : today;
    const to = period === 'yesterday' ? today : today + 86400000;

    const uniq = await collectAll();
    const byCat = {};
    for (const it of uniq) {
      if (it.ts < from || it.ts >= to) continue;
      const r = rated[it.key];
      if (r && r.r === -2) continue;
      if (!byCat[it.cat]) byCat[it.cat] = [];
      items[it.key] = { key: it.key, title: it.title, link: it.link, cat: it.cat, ts: it.ts, src: it.src, w: it.matched };
      byCat[it.cat].push(it);
    }
    saveItems();

    const cats = [];
    for (const c of CATS) {
      const list = byCat[c.key] || [];
      if (!list.length) continue;
      const w = weight(c.key);
      if (w < -0.99) continue;
      const mult = w >= 1.5 ? 2 : w >= 0.5 ? 1.3 : w >= -0.49 ? 1 : 0.5;
      const cap = Math.ceil((c.base || 2) * mult);
      const slice = list.slice(0, cap).map(it => ({
        id: it.key,
        title: it.title,
        link: it.link,
        source: it.src,
        rating: (rated[it.key] && rated[it.key].r) != null ? rated[it.key].r : null
      }));
      if (!slice.length) continue;
      cats.push({ key: c.key, label: c.label, icon: c.icon, weight: Math.round(w * 10) / 10, itemCount: list.length, items: slice });
    }
    const order = { politics: 0, tech: 1, games: 2, space: 3, auto: 4, other: 5 };
    cats.sort((a, b) => (a.weight === b.weight ? ((order[a.key] ?? 9) - (order[b.key] ?? 9)) : b.weight - a.weight));
    const allWeights = {};
    CATS.forEach(c => { allWeights[c.key] = weight(c.key); });
    const catsMeta = CATS.map(c => ({ key: c.key, label: c.label, icon: c.icon, pref: allWeights[c.key] }));
    return { period, generatedAt: new Date().toISOString(), totals: uniq.length, cats, prefs: allWeights, catsMeta };
  }

  function findItem(id) {
    if (items[id]) return items[id];
    for (const k of Object.keys(items)) if (k === id) return items[k];
    return null;
  }

  async function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/news') {
      const period = url.searchParams.get('period') === 'yesterday' ? 'yesterday' : 'today';
      try { return json(res, 200, await digest(period)); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }
    if (req.method === 'POST' && p === '/api/news/rate') {
      let body = {};
      try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
      const it = findItem(String(body.id || ''));
      const r = Number(body.rating);
      if (!it || !(r >= -2 && r <= 2)) return json(res, 400, { error: 'bad id/rating' });
      rated[it.key] = { cat: it.cat, r, ts: Date.now() };
      if (r >= 1) { expandVecs(it, r); }
      saveRated();
      const weights = {};
      CATS.forEach(c => { weights[c.key] = weight(c.key); });
      return json(res, 200, { ok: true, weights, rating: { id: it.key, r } });
    }
    if (req.method === 'POST' && p === '/api/news/pref') {
      let body = {};
      try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
      const cat = String(body.cat || '');
      const known = CATS.some(c => c.key === cat);
      const v = Number(body.value);
      if (!known || !(v >= -2 && v <= 2)) return json(res, 400, { error: 'bad cat/value' });
      prefs[cat] = v;
      saveRated();
      const weights = {};
      CATS.forEach(c => { weights[c.key] = weight(c.key); });
      return json(res, 200, { ok: true, prefs, weights });
    }
    return false;
  }

  return {
    handle,
    refresh() {
      try {
        const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        rated = d.rated || rated;
        prefs = d.prefs || prefs;
      } catch (e) {}
    }
  };
};