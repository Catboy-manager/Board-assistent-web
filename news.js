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
  { id: 'arstechnica', name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', gov: false, loc: 'intl' },

  { id: 'dvach_tg', name: 'Двач TG', kind: 'telegram', social: true, url: 'https://tg.i-c-a.su/rss/dvachannel?limit=10', gov: false, loc: 'ru' },
  { id: 'dvach_vk', name: 'Двач VK', kind: 'vk', social: true, gid: 22751485, url: 'https://vk.com/widget_community.php?app=0&width=607&_ver=1&gid=22751485&mode=2&height=1200', gov: false, loc: 'ru' },
  { id: 'mash', name: 'Mash', kind: 'vk', social: true, gid: 112510789, url: 'https://vk.com/widget_community.php?app=0&width=607&_ver=1&gid=112510789&mode=2&height=1200', gov: false, loc: 'ru' },
  { id: 'shot', name: 'SHOT', kind: 'telegram', social: true, url: 'https://tg.i-c-a.su/rss/shot_shot?limit=10', gov: false, loc: 'ru' },
  { id: 'baza', name: 'Baza', kind: 'vk', social: true, gid: 176841276, url: 'https://vk.com/widget_community.php?app=0&width=607&_ver=1&gid=176841276&mode=2&height=1200', gov: false, loc: 'ru' },
  { id: 'readovka', name: 'Readovka', kind: 'telegram', social: true, url: 'https://tg.i-c-a.su/rss/readovkanews?limit=10', gov: false, loc: 'ru' },
  { id: 'lentach', name: 'Лентач', kind: 'vk', social: true, gid: 29534144, url: 'https://vk.com/widget_community.php?app=0&width=607&_ver=1&gid=29534144&mode=2&height=1200', gov: false, loc: 'ru' },
  { id: 'nebrexnya', name: 'Небрехня', kind: 'telegram', social: true, url: 'https://tg.i-c-a.su/rss/nebrexnya?limit=10', gov: false, loc: 'ru' },
  { id: 'meduza', name: 'Meduza', kind: 'telegram', social: true, url: 'https://tg.i-c-a.su/rss/meduzalive?limit=10', gov: false, loc: 'ru' },
  { id: 'agentstvo', name: 'Агентство', kind: 'telegram', social: true, url: 'https://tg.i-c-a.su/rss/agentstvonews?limit=10', gov: false, loc: 'ru' },
  { id: 'bbcrussian', name: 'BBC Рус', kind: 'telegram', social: true, url: 'https://tg.i-c-a.su/rss/bbcrussian?limit=10', gov: false, loc: 'ru' }
];

const JUNK_RE = /(?:^|[^а-яёa-z])(?:реклам[а-яё]*|промокод[а-яё]*|промо-код[а-яё]*|букмекер[а-яё]*|казино|тотализатор[а-яё]*|розыгрыш[а-яё]*|подпишись|подписывайтесь|переходи по ссылке|жми на ссылку|микрозайм[а-яё]*|18\+|интим[а-яё]*|знакомств[а-яё]*|erid|астролог[а-яё]*|гороскоп[а-яё]*|таролог[а-яё]*|приворот[а-яё]*|накрутк[а-яё]*|подписчик[а-яё]*)(?:[^а-яёa-z]|$)/i;
const BET_RE = /ставк[а-яё]*\s+на\s+спорт|букмекерск[а-яё]*\s+ставк/i;
const SHORT_LINK_RE = /(?:cutt\.ly|bit\.ly|clck\.ru|goo\.gl|tinyurl\.com|vk\.com\/away|t\.me\/\+|joinchat)/i;
const MEDIA_ONLY_RE = /^\[(?:photo|video|media|album|document|gif|audio)\]$/i;
const MONTHS_RU = { января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5, июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11 };

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
    words: ['автомобил', 'электромобил', 'автопром', 'дилер', 'бензин', 'седан', 'кроссовер', 'тягач',
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
  const SOCIAL_CACHE = path.join(dataDir, 'news-social.json');
  const SOCIAL_TTL = 15 * 60 * 1000;

  let rated = {};
  let prefs = {};
  let items = {};
  let vecs = [];
  let learned = {};
  let srcEnabled = {};
  let socialCache = {};
  const socialPending = new Set();
  let socialRefresh = null;
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
  try {
    const d = JSON.parse(fs.readFileSync(SOCIAL_CACHE, 'utf8'));
    socialCache = (d && typeof d === 'object') ? d : {};
  } catch (e) {}

  function saveAll() { try { fs.writeFileSync(FILE, JSON.stringify({ rated, prefs, vecs, learned, srcEnabled }, null, 2)); } catch (e) {} }
  function saveSocialCache() { try { fs.writeFileSync(SOCIAL_CACHE, JSON.stringify(socialCache)); } catch (e) {} }
  function saveItems() {
    try {
      const slim = {};
      Object.keys(items).slice(-600).forEach(k => { slim[k] = items[k]; });
      fs.writeFileSync(ITEMS_CACHE, JSON.stringify({ items: slim }, null, 2));
    } catch (e) {}
  }

  function fetchBuffer(url, timeout) {
    return new Promise((resolvePromise) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout || 15000);
      fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA, 'Accept-Language': 'ru-RU,ru;q=0.8,en;q=0.5' }, signal: ctrl.signal })
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('http ' + r.status))))
        .then(buf => resolvePromise(Buffer.from(buf)))
        .catch(() => resolvePromise(Buffer.alloc(0)))
        .finally(() => clearTimeout(t));
    });
  }

  async function fetchText(url, timeout) {
    const buf = await fetchBuffer(url, timeout);
    return buf.length ? buf.toString('utf8') : '';
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

  function rawTag(block, tag) {
    const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>', 'i');
    const m = block.match(re);
    return m ? m[1] : '';
  }

  function htmlToText(s) {
    return stripTags(decodeEntities(s)).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function cleanSocialTitle(raw, desc) {
    let t = htmlToText(raw || '')
      .replace(/^\[(?:photo|video|media|album|document|gif|audio)\]\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!t || t.length < 3) t = htmlToText(desc || '');
    if (t.length > 220) t = t.slice(0, 217).trim() + '…';
    return t;
  }

  function junkItem(text, views, forwards) {
    const t = String(text || '').trim();
    if (!t) return true;
    if (MEDIA_ONLY_RE.test(t)) return true;
    if (JUNK_RE.test(t) || BET_RE.test(t) || SHORT_LINK_RE.test(t)) return true;
    const words = t.split(/\s+/).filter(Boolean);
    const v = Number(views) || 0;
    const f = Number(forwards) || 0;
    if (words.length < 3 && v < 50000 && f < 300) return true;
    if (t.length < 25 && v < 20000 && f < 200) return true;
    return false;
  }

  function parseRuDate(str, now) {
    const s = String(str || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const m = s.match(/(?:(\d{1,2})\s+([а-яё]+)(?:\s+(\d{4}))?\s+)?в\s+(\d{1,2}):(\d{2})/);
    if (!m) return 0;
    const h = Number(m[4]);
    const min = Number(m[5]);
    if (!(h >= 0 && h < 24 && min >= 0 && min < 60)) return 0;
    if (s.startsWith('сегодня')) {
      const d = new Date(now); d.setHours(h, min, 0, 0); return d.getTime();
    }
    if (s.startsWith('вчера')) {
      const d = new Date(now); d.setDate(d.getDate() - 1); d.setHours(h, min, 0, 0); return d.getTime();
    }
    const day = Number(m[1]);
    const mon = MONTHS_RU[m[2]];
    if (!(day >= 1 && day <= 31) || mon == null) return 0;
    const year = m[3] ? Number(m[3]) : now.getFullYear();
    const d = new Date(year, mon, day, h, min, 0, 0);
    if (!m[3] && d.getTime() > now.getTime() + 86400000) d.setFullYear(year - 1);
    return d.getTime();
  }

  function socialRank(views, forwards, ts, now) {
    const ageH = Math.max(0, (now - ts) / 3600000);
    const rec = Math.max(0, 1 - ageH / 36);
    const v = Math.log10(1 + Math.max(0, Number(views) || 0));
    const f = Math.log10(1 + Math.max(0, Number(forwards) || 0));
    return Math.round((v * 12 + f * 9 + rec * 10) * 10) / 10;
  }

  function rssRank(ts, now) {
    const ageH = Math.max(0, (now - ts) / 3600000);
    return Math.round(Math.max(0, 6 - ageH / 6) * 10) / 10;
  }

  function parseTelegramRSS(xml, src) {
    const out = [];
    const re = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = re.exec(xml))) {
      const block = m[1];
      const date = htmlToText(rawTag(block, 'pubDate'));
      const ts = new Date(date).getTime();
      if (!(ts > 0)) continue;
      const desc = htmlToText(rawTag(block, 'description'));
      const title = cleanSocialTitle(rawTag(block, 'title'), desc);
      if (!title) continue;
      const views = Number((block.match(/views="(\d+)"/i) || [])[1] || 0);
      const forwards = Number((block.match(/forwards="(\d+)"/i) || [])[1] || 0);
      if (junkItem(title + ' ' + desc, views, forwards)) continue;
      out.push({
        title,
        link: htmlToText(rawTag(block, 'link')),
        desc: desc || title,
        ts,
        src: src.name,
        views,
        forwards,
        kind: 'telegram'
      });
    }
    return out;
  }

  function parseVKWidget(html, src, now) {
    const out = [];
    const parts = String(html || '').split(/<div class="wcommunity_post">/i).slice(1);
    for (const block of parts) {
      const linkM = block.match(/class="wcommunity_post_date"[^>]*href="([^"]+)"/i) || block.match(/href="(\/wall-?\d+_\d+)"/i);
      let link = linkM ? linkM[1] : '';
      if (link.startsWith('/')) link = 'https://vk.com' + link;
      const dateM = block.match(/class="wcommunity_post_date"[^>]*>([\s\S]*?)<\/a>/i);
      let ts = parseRuDate(dateM ? htmlToText(dateM[1]) : '', now);
      if (!(ts > 0)) ts = now.getTime() - out.length * 3600000;
      const textM = block.match(/<div class="wall_post_text"[^>]*>([\s\S]*?)<\/div>/i);
      if (!textM) continue;
      let text = textM[1].replace(/<button[\s\S]*?<\/button>/gi, ' ');
      text = htmlToText(text).replace(/Показать ещё/gi, ' ').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const viewsM = block.match(/post_video_views_count[^>]*>([\s\S]*?)<\/div>/i);
      const views = viewsM ? Number(htmlToText(viewsM[1]).replace(/[^\d]/g, '') || 0) : 0;
      if (junkItem(text, views, 0)) continue;
      out.push({
        title: text.length > 220 ? text.slice(0, 217).trim() + '…' : text,
        link,
        desc: text,
        ts,
        src: src.name,
        views,
        forwards: 0,
        kind: 'vk'
      });
    }
    return out;
  }

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

  async function fetchTelegram(s) {
    const xml = await fetchText(s.url, 20000);
    return xml ? parseTelegramRSS(xml, s) : [];
  }

  async function fetchVK(s) {
    const buf = await fetchBuffer(s.url, 15000);
    if (!buf || !buf.length) return [];
    let html = '';
    try { html = new TextDecoder('windows-1251').decode(buf); } catch (e) { html = buf.toString('utf8'); }
    return parseVKWidget(html, s, new Date());
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function fetchSocialSource(s) {
    const cached = socialCache[s.id];
    if (cached && Array.isArray(cached.items) && Date.now() - (cached.ts || 0) < SOCIAL_TTL) return cached.items;
    if (socialPending.has(s.id)) return (cached && Array.isArray(cached.items)) ? cached.items : [];
    socialPending.add(s.id);
    let items = [];
    try {
      if (s.kind === 'telegram') items = await fetchTelegram(s);
      else if (s.kind === 'vk') items = await fetchVK(s);
    } catch (e) { items = []; }
    finally { socialPending.delete(s.id); }
    if (items.length) {
      socialCache[s.id] = { ts: Date.now(), items };
    } else {
      socialCache[s.id] = { ts: (cached && cached.ts) || 0, items: (cached && Array.isArray(cached.items)) ? cached.items : [], retryAt: Date.now() + 300000 };
    }
    saveSocialCache();
    return items.length ? items : ((cached && Array.isArray(cached.items)) ? cached.items : []);
  }

  async function refreshSocialSources(list) {
    if (socialRefresh) return socialRefresh;
    socialRefresh = (async () => {
      for (const s of list) {
        if (socialPending.has(s.id)) continue;
        await fetchSocialSource(s);
        if (s.kind === 'telegram') await sleep(4000);
      }
    })().catch(() => {}).finally(() => { socialRefresh = null; });
    return socialRefresh;
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
  function catScore(text, c, noLearn) {
    let s = 0;
    for (const w of c.words) if (matchesToken(text, w)) s++;
    if (noLearn || s === 0) return s;
    const ext = learned[c.key] || [];
    for (const w of ext) if (matchesToken(text, w)) s++;
    return s;
  }

  /* ЧЕРНЫЙ список: если побеждает «бизнес»-категория (игры/авто/…), но в новости есть
     политические слова — отдаём новость политике (или в «Прочее», если политических
     слов не нашлось). Так отраслевые ленты не засоряются политикой. */
  function categorize(text, noLearn) {
    const t = String(text || '').toLowerCase();
    if (SPORTS_BLOCK.some(k => matchesToken(t, k))) return { cat: 'other', w: 'sport', score: 0 };
    let best = null;
    for (const c of CATS) {
      if (c.key === 'other') continue;
      const s = catScore(t, c, noLearn);
      if (!best || s > best.score) best = { c, score: s, w: c.words.find(x => matchesToken(t, x)) || 'word' };
    }
    if (!best || best.score <= 0) return { cat: 'other', w: '', score: 0 };
    if (best.c.neg && best.c.neg.length && best.c.neg.some(w => matchesToken(t, w))) {
      const pol = CATS.find(x => x.key === 'politics');
      if (pol && catScore(t, pol, noLearn) > 0) return { cat: 'politics', w: 'neg:' + best.c.key, score: best.score };
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
    return s ? { gov: !!s.gov, loc: s.loc, kind: s.kind || 'rss', social: !!s.social } : { gov: false, loc: 'intl', kind: 'rss', social: false };
  }

  async function collectAll() {
    const now = Date.now();
    const all = [];
    const enabled = SOURCES.filter(s => srcEnabled[s.id] !== false);
    const socials = enabled.filter(s => s.kind === 'telegram' || s.kind === 'vk').sort((a, b) => (a.kind === 'vk' ? 0 : 1) - (b.kind === 'vk' ? 0 : 1));
    const refresh = [];
    let socialCached = 0;
    for (const s of socials) {
      const cached = socialCache[s.id];
      const fresh = cached && Array.isArray(cached.items) && now - (cached.ts || 0) < SOCIAL_TTL;
      const backoff = cached && cached.retryAt && now < cached.retryAt;
      if (cached && Array.isArray(cached.items) && cached.items.length) {
        for (const it of cached.items) all.push(it);
        socialCached += cached.items.length;
      }
      if (!fresh && !backoff) refresh.push(s);
    }
    const socialJob = refresh.length ? refreshSocialSources(refresh) : Promise.resolve();
    const jobs = enabled
      .filter(s => s.kind !== 'telegram' && s.kind !== 'vk')
      .map(async (s) => {
        const xml = await fetchText(s.url);
        if (!xml) return;
        for (const it of parseRSS(xml)) {
          const ts = new Date(it.date).getTime();
          if (!(ts > 0)) continue;
          all.push({ title: it.title, link: it.link, desc: it.desc, ts, src: s.name, kind: 'rss', views: 0, forwards: 0 });
        }
      });
    await Promise.allSettled(jobs);
    if (!socialCached && refresh.length) {
      await Promise.race([socialJob, sleep(15000)]);
      for (const s of refresh) {
        const cached = socialCache[s.id];
        if (cached && Array.isArray(cached.items)) for (const it of cached.items) all.push(it);
      }
    } else {
      socialJob.catch(() => {});
    }

    const seen = new Set();
    const uniq = [];
    for (const it of all.sort((a, b) => b.ts - a.ts)) {
      const key = normalize(it.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const social = it.kind === 'telegram' || it.kind === 'vk';
      const mw = categorize(it.title + ' ' + String(it.desc || '').slice(0, 400), social);
      const rank = social ? socialRank(it.views, it.forwards, it.ts, now) : rssRank(it.ts, now);
      const hot = social && ((Number(it.views) || 0) >= 50000 || (Number(it.forwards) || 0) >= 500 || rank >= 35);
      uniq.push({
        key,
        title: it.title,
        link: it.link || '',
        desc: it.desc || '',
        date: new Date(it.ts).toISOString(),
        ts: it.ts,
        cat: mw.cat,
        matched: mw.w,
        score: mw.score,
        src: it.src,
        kind: it.kind || 'rss',
        views: Number(it.views) || 0,
        forwards: Number(it.forwards) || 0,
        rank,
        hot
      });
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
      kind: si.kind,
      social: si.social,
      hot: !!it.hot,
      views: it.views || 0,
      forwards: it.forwards || 0,
      rank: it.rank || 0,
      rating: (rated[it.key] && rated[it.key].r) != null ? rated[it.key].r : null
    };
  }

  function pickItems(list, cap, maxPerSource) {
    const out = [];
    const counts = {};
    const picked = new Set();
    const max = maxPerSource || 2;
    for (let pass = 0; pass < max; pass++) {
      for (const it of list) {
        if (out.length >= cap) return out;
        if (picked.has(it.key)) continue;
        const n = counts[it.src] || 0;
        if (n !== pass) continue;
        out.push(it);
        picked.add(it.key);
        counts[it.src] = n + 1;
      }
    }
    if (out.length < cap) {
      for (const it of list) {
        if (out.length >= cap) break;
        if (picked.has(it.key)) continue;
        out.push(it);
        picked.add(it.key);
      }
    }
    return out;
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
    for (const k of Object.keys(byCat)) byCat[k].sort((a, b) => (b.rank - a.rank) || (b.ts - a.ts));
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
      const slice = pickItems(list, cap, 2).map(itemView);
      if (!slice.length) continue;
      hot[c.key] = hotWords(c.key, list, uniq);
      cats.push({ key: c.key, label: c.label, icon: c.icon, weight: Math.round(w * 10) / 10, itemCount: list.length, items: slice });
    }
    const order = catOrder();
    cats.sort((a, b) => (a.weight === b.weight ? ((order[a.key] ?? 9) - (order[b.key] ?? 9)) : b.weight - a.weight));
    const allWeights = {};
    CATS.forEach(c => { allWeights[c.key] = weight(c.key); });
    const catsMeta = CATS.map(c => ({ key: c.key, label: c.label, icon: c.icon, pref: allWeights[c.key] }));
    const sources = SOURCES.map(s => ({ id: s.id, name: s.name, gov: !!s.gov, loc: s.loc, kind: s.kind || 'rss', social: !!s.social, enabled: srcEnabled[s.id] !== false }));
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
    for (const it of uniq.slice().sort((a, b) => (b.rank - a.rank) || (b.ts - a.ts))) {
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
      return json(res, 200, { sources: SOURCES.map(s => ({ id: s.id, name: s.name, gov: !!s.gov, loc: s.loc, kind: s.kind || 'rss', social: !!s.social, enabled: srcEnabled[s.id] !== false })) });
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