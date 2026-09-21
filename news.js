'use strict';

const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/* Источники. gov:true — государственное (контролируемое государством) СМИ.
   loc: 'ru' | 'intl' — внутренние/международные. */
const SOURCES = [
  { id: 'lenta', name: 'Лента', url: 'https://lenta.ru/rss/news', gov: false, loc: 'ru' },
  { id: 'ria', name: 'РИА', url: 'https://ria.ru/export/rss2/archive/index.xml', gov: true, loc: 'ru' },
  { id: 'tass', name: 'ТАСС', url: 'https://tass.ru/rss/v2.xml', gov: true, loc: 'ru' },
  { id: 'kommersant', name: 'Ъ', url: 'https://www.kommersant.ru/rss/news.xml', gov: false, loc: 'ru' },
  { id: 'habr', name: 'Хабр', url: 'https://habr.com/ru/rss/news/all/', gov: false, loc: 'ru' },
  { id: 'nasa', name: 'NASA', url: 'https://www.nasa.gov/feed/', gov: true, loc: 'intl' },
  { id: 'space', name: 'Space', url: 'https://www.space.com/feeds/all', gov: false, loc: 'intl' },
  { id: 'bbc', name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/rss.xml', gov: false, loc: 'intl' },
  { id: 'reuters', name: 'Reuters', url: 'https://feeds.reuters.com/reuters/topNews', gov: false, loc: 'intl' },
  { id: 'verge', name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', gov: false, loc: 'intl' },
  { id: 'guardian', name: 'Guardian', url: 'https://www.theguardian.com/world/rss', gov: false, loc: 'intl' },
  { id: 'ap', name: 'AP', url: 'https://apnews.com/rss', gov: false, loc: 'intl' },
  { id: 'rt', name: 'RT', url: 'https://www.rt.com/rss/', gov: true, loc: 'intl' },
  { id: 'xinhua', name: 'Xinhua', url: 'https://www.xinhuanet.com/english/rss/allrss.xml', gov: true, loc: 'intl' },
  { id: 'dw', name: 'DW', url: 'https://rss.dw.com/rdf/rss-en-all', gov: false, loc: 'intl' },
  { id: 'ign', name: 'IGN', url: 'https://feeds.ign.com/ign/all', gov: false, loc: 'intl' },
  { id: 'polygon', name: 'Polygon', url: 'https://www.polygon.com/rss/index.xml', gov: false, loc: 'intl' },
  { id: 'gamespot', name: 'GameSpot', url: 'https://www.gamespot.com/feeds/mashup/', gov: false, loc: 'intl' },
  { id: 'eurogamer', name: 'Eurogamer', url: 'https://www.eurogamer.net/feed', gov: false, loc: 'intl' },
  { id: 'explore', name: 'Explore', url: 'https://explore.org/feed', gov: false, loc: 'intl' },
  { id: 'arstechnica', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', gov: false, loc: 'intl' }
];

/* Ядро политических слов — используется как ЧЁРНЫЙ список для «бизнес-категорий»
   (игры/авто/технологии), чтобы политика не перемешивалась с отраслевыми новостями. */
const POLITICS_WORDS = ['политик', 'политич', 'президент', 'президента', 'правител', 'госдум', 'парламент', 'депутат',
  'министр', 'министерств', 'спикер', 'санкци', 'эмбарго', 'референдум', 'законопроект', 'законодат', 'конфликт',
  'переговор', 'войн', 'миноборон', 'украин', 'путин', 'трамп', 'протест', 'митинг', 'дипломат', 'нато', 'партий',
  'партия', 'выбор', 'владимир', 'greenpeace', 'сша', 'запад', 'россии', 'antirussia', 'nato', 'politics', 'election',
  'president', 'government', 'sanction', 'parliament', 'duma', 'kremlin', 'мининформ', 'фсин', 'роскомнадзор'];

const CATS = [
  {
    key: 'politics', label: 'Политика', icon: '🏛', base: 4,
    words: POLITICS_WORDS,
    neg: []
  },
  {
    key: 'tech', label: 'Технологии', icon: '💻', base: 4,
    words: ['технолог', 'смартфон', 'гаджет', 'компьютер', 'ноутбук', 'процессор', 'микросхем', 'чип', 'нейросет', 'нейрон',
      'интеллект', 'робот', 'приложени', 'электроник', 'стартап', 'квант', 'айфон', 'iphone', 'android', 'андроид',
      'алгоритм', 'кибератак', 'киберпреступ', 'вирус', 'хакер', 'датчик', 'батареи', 'беспилот', 'автопилот', 'интернет',
      'сервер', 'данных', 'чипсет', 'gpt', 'artificial', 'technology', 'chip', 'robot', 'startup', 'software', 'hardware',
      'науч', 'учён', 'исследован', 'открыт', 'инноваци', 'изобретен', 'эксперимент', 'лаборатор', 'биотехнолог', 'генн',
      'медицин', 'клиник', 'вакцин', 'лекарств', 'исслед', 'разработ', 'модел', 'ии', 'байт', 'telegram', 'видеокарт',
      'графическ', 'аккумултор', 'зарядк', 'экран', 'диспле', 'камер', 'фотографи', 'искусственн', 'программ', 'код',
      'openai', 'google', 'microsoft', 'apple', 'самсунг', 'intel', 'amd', 'nvidia', 'крипт', 'блокчейн', 'веб'],
    neg: []
  },
  {
    key: 'games', label: 'Игры', icon: '🎮', base: 3,
    words: ['видеоигр', 'видео-игр', 'гейм', 'геймер', 'гейминг', 'геймплей', 'киберспорт', 'приставк', 'эльден',
      'steam', 'playstation', 'ps5', 'xbox', 'nintendo', 'switch', 'rpg', 'mmo', 'gta', 'fortnite', 'minecraft',
      'минекрафт', 'игра', 'игры', 'игровой', 'игров', 'играть', 'поигра', 'геймпад', 'трейлер', 'пиксель',
      'графон', 'прокачк', 'level', 'сюжет', 'dota', 'csgo', 'league of legends', 'запуск игры', 'релиз игры'],
    neg: POLITICS_WORDS
  },
  {
    key: 'space', label: 'Космос', icon: '🚀', base: 3,
    words: ['косм', 'ракет', 'мкс', 'луна', 'лунный', 'марс', 'марсиан', 'спутник', 'астроном', 'галактик', 'орбит',
      'телескоп', 'астероид', 'вселенн', 'созвезд', 'солнечн', 'планет', 'экзопланет', 'межпланетн', 'астронавт',
      'космонавт', 'нейтронн', 'сверхнов', 'spacex', 'rocket', 'iss', 'nasa', 'roskosmos', 'starlink', 'orbit',
      'satellite', 'galaxy', 'venus', 'jupiter', 'saturn'],
    neg: []
  },
  {
    key: 'auto', label: 'Авто', icon: '🚗', base: 3,
    words: ['автомобил', 'авто', 'электромобил', 'автопром', 'дилер', 'бензин', 'седан', 'кроссовер', 'тягач',
      'мотоцикл', 'легков', 'грузовик', 'автобус', 'пикап', 'гибрид', 'двс', 'tesla', 'car', 'vehicle', 'automobile',
      'двигател', 'коробк передач', 'подвеск', 'шин', 'гараж', 'автосервис', 'аккумулятор автомобил'],
    neg: POLITICS_WORDS
  },
  { key: 'other', label: 'Прочее', icon: '📰', base: 2, words: [], neg: [] }
];

const RATINGS = { '-2': 'совсем не интересно', '-1': 'не интересно', '0': 'нейтрально', '1': 'интересно', '2': 'крайне заинтересован' };

const DEFAULT_PREFS = { politics: 0.2, tech: 1.5, games: 1.8, space: 1.2, auto: -0.8 };

module.exports = (deps) => {
  const { dataDir, readBody, json } = deps;
  const FILE = path.join(dataDir, 'news.json');
  const ITEMS_CACHE = path.join(dataDir, 'news-items.json');

  let rated = {};
  let prefs = {};
  let items = {};
  let vecs = [];
  let learned = {};
  let srcEnabled = {};
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    rated = (d && d.rated) || {};
    prefs = (d && d.prefs) || {};
    vecs = (d && d.vecs) || [];
    learned = (d && d.learned) || {};
    srcEnabled = (d && d.srcEnabled) || {};
  } catch (e) {}
  try {
    const d = JSON.parse(fs.readFileSync(ITEMS_CACHE, 'utf8'));
    items = (d && d.items) || {};
  } catch (e) {}

  function saveAll() { try { fs.writeFileSync(FILE, JSON.stringify({ rated, prefs, vecs, learned, srcEnabled }, null, 2)); } catch (e) {} }
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

  const SPORTS_BLOCK = ['спорт', 'футбол', 'хокке', 'теннис', 'баскетбол', 'волейбол', 'бадминтон', 'турнир',
    'чемпионат', 'олимпиад', 'паралимпиад', 'сборной', 'матч', 'матче', 'голкипер', 'игрок', 'игрока', 'игроков',
    'футболист', 'хоккеист', 'болельщик', 'гандбол', 'регби', 'крикет', 'фигурн', 'биатлон', 'лыжн', 'конькоб',
    'боксер', 'бокс', 'ауф', 'бразил', 'сборная', 'квалификац', 'судья', 'арбитр', 'sport', 'football', 'hockey',
    'tennis', 'soccer', 'matchday', 'league', 'champion', 'olympic', 'nba', 'nhl', 'ufc', 'mma'];

  /* Голосование словом: считается число совпадений по каждой категории (включая
     слова, доученные по оценкам пользователя). Победитель — с максимумом. Словарь
     «поворачивается» к интересам пользователя. */
  function catScore(text, c) {
    let s = 0;
    for (const w of c.words) if (matchesToken(text, w)) s++;
    const ext = learned[c.key] || [];
    for (const w of ext) if (matchesToken(text, w)) s++;
    return s;
  }

  /* ЧЕРНЫЙ список: если побеждает «бизнес»-категория (игры/авто/…), но в новости есть
     политические слова — отдаём новость политике (или в «Прочее», если политических
     слов не нашлось). Так отраслевые ленты не засоряются политикой. */
  function categorize(text) {
    const t = String(text || '').toLowerCase();
    if (SPORTS_BLOCK.some(k => matchesToken(t, k))) return { cat: 'other', w: 'sport', score: 0 };
    let best = null;
    for (const c of CATS) {
      if (c.key === 'other') continue;
      const s = catScore(t, c);
      if (!best || s > best.score) best = { c, score: s, w: c.words.find(x => matchesToken(t, x)) || 'word' };
    }
    if (!best || best.score <= 0) return { cat: 'other', w: '', score: 0 };
    if (best.c.neg && best.c.neg.length && best.c.neg.some(w => matchesToken(t, w))) {
      const pol = CATS.find(x => x.key === 'politics');
      if (pol && catScore(t, pol) > 0) return { cat: 'politics', w: 'neg:' + best.c.key, score: best.score };
      return { cat: 'other', w: 'neg:' + best.c.key, score: best.score };
    }
    return { cat: best.c.key, w: best.w, score: best.score };
  }

  const STOP = new Set(['и','в','во','не','что','он','на','я','с','со','как','а','то','все','она','так','его','но','да','ты','к','у','же','вы','за','бы','по','только','ее','мне','было','вот','от','меня','еще','нет','о','из','ему','теперь','когда','даже','ну','вдруг','ли','если','уже','или','ни','быть','был','него','до','вас','нибудь','опять','уж','вам','ведь','там','потом','себя','ничего','ей','может','они','тут','где','есть','надо','ней','для','мы','тебя','их','чем','была','сам','чтоб','без','будто','чего','раз','тоже','себе','под','будет','ж','тогда','кто','этот','того','потому','этого','какой','совсем','ним','здесь','этом','один','почти','мой','тем','чтобы','нее','сейчас','были','куда','зачем','всех','никогда','можно','при','наконец','два','об','другой','хотя','после','над','больше','тот','через','эти','нас','про','всего','них','какая','много','разве','три','эту','моя','впрочем','хорошо','свою','этой','перед','иногда','лучше','чуть','том','нельзя','такой','им','более','всегда','конечно','всю','между','the','and','for','are','but','not','you','all','any','can','had','her','was','one','our','out','day','get','has','his','how','man','new','now','old','see','two','way','who','boy','did','its','let','put','say','she','too','use','that','with','have','this','will','your','from','they','know','want','been','good','much','some','time','very','when','come','here','just','like','long','make','many','over','such','take','than','them','well','were','what','would','для','население','сейчас','после','свое','это','все','news','более','сегодня','вчера','утром','вечером']);

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
      saveAll();
    }
    return changed;
  }

  function learnCatWords(cat, text) {
    const arr = Array.isArray(learned[cat]) ? learned[cat] : [];
    const set = new Set(arr);
    let changed = false;
    for (const t of newsTokens(text)) {
      if (set.has(t) || set.size >= 200) continue;
      set.add(t); changed = true;
    }
    if (changed) { learned[cat] = Array.from(set); saveAll(); }
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
    saveAll();
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

  function srcInfo(srcName) {
    const s = SOURCES.find(x => x.name === srcName);
    return s ? { gov: !!s.gov, loc: s.loc } : { gov: false, loc: 'intl' };
  }

  async function collectAll() {
    const all = [];
    const jobs = SOURCES
      .filter(s => srcEnabled[s.id] !== false)
      .map(async (s) => {
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
      uniq.push({ key, title: it.title, link: it.link || '', date: new Date(it.ts).toISOString(), ts: it.ts, cat: mw.cat, matched: mw.w, score: mw.score, src: it.src });
    }
    return uniq;
  }

  function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); }

  /* Горячие слова категории: частые значимые слова из заголовков, возрастающие по
     «характерности» для категории (cat-частота / глобальная частота). */
  function hotWords(cat, list, all) {
    const gf = new Map();
    for (const it of all) {
      for (const w of newsTokens(it.title)) gf.set(w, (gf.get(w) || 0) + 1);
    }
    const cf = new Map();
    for (const it of list) {
      for (const w of newsTokens(it.title)) cf.set(w, (cf.get(w) || 0) + 1);
    }
    const scored = [];
    for (const [w, c] of cf) {
      const g = gf.get(w) || 1;
      scored.push({ w, c, s: c * c / g });
    }
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 7).map(x => x.w);
  }

  function catOrder() { return { politics: 0, tech: 1, games: 2, space: 3, auto: 4, other: 5 }; }

  function itemView(it) {
    const si = srcInfo(it.src);
    return {
      id: it.key,
      title: it.title,
      link: it.link,
      source: it.src,
      gov: si.gov,
      loc: si.loc,
      rating: (rated[it.key] && rated[it.key].r) != null ? rated[it.key].r : null
    };
  }

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
    const hot = {};
    for (const c of CATS) {
      const list = byCat[c.key] || [];
      if (!list.length) continue;
      const w = weight(c.key);
      if (w < -0.99) continue;
      const mult = w >= 1.5 ? 2 : w >= 0.5 ? 1.3 : w >= -0.49 ? 1 : 0.5;
      const cap = Math.ceil((c.base || 2) * mult);
      const slice = list.slice(0, cap).map(itemView);
      if (!slice.length) continue;
      hot[c.key] = hotWords(c.key, list, uniq);
      cats.push({ key: c.key, label: c.label, icon: c.icon, weight: Math.round(w * 10) / 10, itemCount: list.length, items: slice });
    }
    const order = catOrder();
    cats.sort((a, b) => (a.weight === b.weight ? ((order[a.key] ?? 9) - (order[b.key] ?? 9)) : b.weight - a.weight));
    const allWeights = {};
    CATS.forEach(c => { allWeights[c.key] = weight(c.key); });
    const catsMeta = CATS.map(c => ({ key: c.key, label: c.label, icon: c.icon, pref: allWeights[c.key] }));
    const sources = SOURCES.map(s => ({ id: s.id, name: s.name, gov: !!s.gov, loc: s.loc, enabled: srcEnabled[s.id] !== false }));
    return { period, generatedAt: new Date().toISOString(), totals: uniq.length, cats, prefs: allWeights, catsMeta, hot, sources };
  }

  /* «Ещё из отдела»: подтягивает новости конкретной категории за период, пропуская
     уже показанные (exclude) и (опционально) фильтруя по слову q. */
  async function more(catKey, period, exclude, q, n) {
    const now = new Date();
    const today = dayStart(now);
    const from = period === 'yesterday' ? today - 86400000 : today;
    const to = period === 'yesterday' ? today : today + 86400000;
    const uniq = await collectAll();
    const ex = new Set(String(exclude || '').split(',').filter(Boolean));
    const out = [];
    for (const it of uniq) {
      if (it.ts < from || it.ts >= to) continue;
      if (it.cat !== catKey) continue;
      if (ex.has(it.key)) continue;
      if (q) {
        const t = (it.title + ' ' + it.desc).toLowerCase();
        if (!matchesToken(t, q)) continue;
      }
      const r = rated[it.key];
      if (r && r.r === -2) continue;
      out.push(it);
      if (out.length >= (n || 10)) break;
    }
    return { cat: catKey, period, items: out.map(itemView), total: out.length };
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
    if (req.method === 'GET' && p === '/api/news/more') {
      const cat = String(url.searchParams.get('cat') || '');
      const period = url.searchParams.get('period') === 'yesterday' ? 'yesterday' : 'today';
      try { return json(res, 200, await more(cat, period, url.searchParams.get('exclude'), url.searchParams.get('q'), parseInt(url.searchParams.get('n') || '10', 10))); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }
    if (req.method === 'GET' && p === '/api/news/sources') {
      return json(res, 200, { sources: SOURCES.map(s => ({ id: s.id, name: s.name, gov: !!s.gov, loc: s.loc, enabled: srcEnabled[s.id] !== false })) });
    }
    if (req.method === 'POST' && p === '/api/news/source') {
      let body = {};
      try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
      const id = String(body.id || '');
      if (!SOURCES.some(s => s.id === id)) return json(res, 400, { error: 'bad source' });
      srcEnabled[id] = !!body.enabled;
      saveAll();
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/news/rate') {
      let body = {};
      try { body = JSON.parse((await readBody(req)).toString() || '{}'); } catch (e) {}
      const it = findItem(String(body.id || ''));
      const r = Number(body.rating);
      if (!it || !(r >= -2 && r <= 2)) return json(res, 400, { error: 'bad id/rating' });
      rated[it.key] = { cat: it.cat, r, ts: Date.now() };
      if (r >= 1) {
        expandVecs(it, r);
        learnCatWords(it.cat, it.title + ' ' + (it.desc || ''));
      }
      saveAll();
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
      saveAll();
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