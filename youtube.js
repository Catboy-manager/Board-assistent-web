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
  const INTEREST_STOP = new Set(['этот','этого','это','такое','которые','который','которых','которые','как','все','еще','ещё','только','будет','может','также','очень','свою','свой','своих','люди','человек','год','года','годы','уже','был','была','были','and','the','for','with','from','that','this','have','will','what','how','when','why','not','are','you','your','can','channel','subscribe','really','great','video','top','best','versus','vs','official','new','live','talk','cookies','cookie','поиск','канал','подборка','смотреть','обзор']);

  /* Дополнительные темы, которые автоматически находят себя в запросах,
     cookie-сигналах и названиях просмотров. Используются для авто-тем. */
  const EXTRA_THEMES = [
    { key: 'travel', label: 'Путешествия', icon: '✈️', words: ['путешеств', 'travel', 'туризм', 'отель', 'hotel', 'авиа', 'booking', 'airbnb', 'отдых', 'курорт', 'виза', 'поездк', 'стран'] },
    { key: 'auto', label: 'Авто', icon: '🚗', words: ['авто', 'машин', 'автомоб', 'car', 'tesla', 'bmw', 'mercedes', 'audi', 'toyota', 'двигател', 'шины', 'автосалон', 'drom', 'тест-драйв'] },
    { key: 'health', label: 'Здоровье', icon: '🩺', words: ['здоров', 'health', 'врач', 'болезн', 'иммунитет', 'фитнес', 'fitness', 'тренировк', 'спортзал', 'диет', 'похуд', 'витамин', 'сон'] },
    { key: 'fashion', label: 'Мода и стиль', icon: '👗', words: ['мод', 'fashion', 'стил', 'одежд', 'бренд', 'sneaker', 'dress', 'одеван', 'shopping', 'кроссовк'] },
    { key: 'humor', label: 'Юмор', icon: '😂', words: ['юмор', 'смешн', 'прикол', 'мем', 'meme', 'funny', 'comedy', 'стендап', 'standup', 'шутк', 'ржач'] },
    { key: 'psy', label: 'Психология', icon: '🧩', words: ['психолог', 'psy', 'mindfulness', 'медитац', 'мотивац', 'продуктивн', 'привычк', 'эмоци', 'осознан', 'мышлени'] },
    { key: 'art', label: 'Искусство и дизайн', icon: '🎨', words: ['искусств', 'арт', 'design', 'дизайн', 'рисун', 'фото', 'photography', 'архитектур', 'живопис', 'творчеств'] },
    { key: 'pets', label: 'Животные', icon: '🐾', words: ['питом', 'собак', 'кошк', 'животн', 'pet', 'dog', 'cat', 'зоо', 'ветеринар'] }
  ];

  /* Архетипы «портрета» по доминирующей категории. */
  const ARCHETYPES = {
    tech: { title: 'Инженер-энтузиаст', icon: '🤖' },
    science: { title: 'Пытливый исследователь', icon: '🔬' },
    space: { title: 'Мечтатель о космосе', icon: '🌌' },
    music: { title: 'Меломан', icon: '🎧' },
    games: { title: 'Геймер', icon: '🕹' },
    cinema: { title: 'Киноман', icon: '🍿' },
    sport: { title: 'Спортсмен-болельщик', icon: '🏅' },
    business: { title: 'Деловой человек', icon: '📈' },
    education: { title: 'Вечный студент', icon: '📚' },
    cooking: { title: 'Гурман-кулинар', icon: '👨‍🍳' },
    travel: { title: 'Путешественник', icon: '🧭' },
    auto: { title: 'Автолюбитель', icon: '🏁' },
    health: { title: 'ЗОЖ-энтузиаст', icon: '💪' },
    fashion: { title: 'Эстет', icon: '✨' },
    humor: { title: 'Душа компании', icon: '😄' },
    psy: { title: 'Мыслитель', icon: '🧠' },
    art: { title: 'Творец', icon: '🖌' },
    pets: { title: 'Зоолюб', icon: '🐾' }
  };

  const QUERIES_FILE = path.join(dataDir, 'yt-queries.json');
  const THEMES_FILE = path.join(dataDir, 'yt-themes.json');

  let watch = [];
  try { const d = JSON.parse(fs.readFileSync(WATCH_FILE, 'utf8')); watch = (d && d.watch) || []; } catch (e) {}
  function saveWatch() { try { fs.writeFileSync(WATCH_FILE, JSON.stringify({ watch }, null, 2)); } catch (e) {} }

  let queries = [];
  try { const d = JSON.parse(fs.readFileSync(QUERIES_FILE, 'utf8')); queries = (d && d.queries) || []; } catch (e) {}
  function saveQueries() { try { fs.writeFileSync(QUERIES_FILE, JSON.stringify({ queries }, null, 2)); } catch (e) {} }
  function addQuery(q) {
    q = String(q || '').trim().slice(0, 120);
    if (q.length < 2) return;
    queries = queries.filter(x => x.q !== q);
    queries.unshift({ q, ts: Date.now() });
    if (queries.length > 300) queries = queries.slice(0, 300);
    saveQueries();
  }
  const YTDLP = process.env.KANBAN_YTDLP || 'yt-dlp';
  const RESOLVE_TIMEOUT = 45000;
  const COOKIES_MAX = 2 * 1024 * 1024;
  const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

  let auth = { browser: null };
  try { const d = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); auth = Object.assign(auth, d); } catch (e) {}
  function saveAuth() { try { fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2)); } catch (e) {} }
  function cookiesExist() { try { return fs.existsSync(COOKIES_FILE) && fs.statSync(COOKIES_FILE).size > 0; } catch (e) { return false; } }

  /* Возвращает список подпапок-профилей Chrome/Chromium, где есть Cookies или History. */
  function chromeProfilesIn(root) {
    const out = [];
    try {
      for (const d of fs.readdirSync(root)) {
        if (d === 'System Profile' || /^Guest Profile$/.test(d)) continue;
        const base = path.join(root, d);
        try {
          if (!fs.statSync(base).isDirectory()) continue;
          if (fs.existsSync(path.join(base, 'Cookies')) || fs.existsSync(path.join(base, 'History'))) out.push(base);
        } catch (e) {}
      }
    } catch (e) {}
    return out;
  }

  /* Корни профилей Chrome/Chromium/Brave/Edge во всех ОС. */
  function chromeRoots() {
    const home = require('os').homedir();
    const env = process.env;
    const list = [
      path.join(home, '.config/google-chrome'),
      path.join(home, '.config/chromium'),
      path.join(home, '.config/BraveSoftware/Brave-Browser'),
      path.join(home, '.config/microsoft-edge'),
      path.join(home, 'snap/chromium/common/chromium'),
      path.join(home, '.var/app/org.chromium.Chromium/config/chromium'),
      path.join(home, 'Library/Application Support/Google/Chrome'),
      path.join(home, 'Library/Application Support/Chromium'),
      path.join(home, 'Library/Application Support/BraveSoftware/Brave-Browser')
    ];
    if (env.LOCALAPPDATA) {
      list.push(path.join(env.LOCALAPPDATA, 'Google/Chrome/User Data'));
      list.push(path.join(env.LOCALAPPDATA, 'Chromium/User Data'));
      list.push(path.join(env.LOCALAPPDATA, 'BraveSoftware/Brave-Browser/User Data'));
      list.push(path.join(env.LOCALAPPDATA, 'Microsoft/Edge/User Data'));
    }
    return list;
  }

  /* Корни профилей Firefox во всех ОС. */
  function firefoxRoots() {
    const home = require('os').homedir();
    const env = process.env;
    const list = [
      path.join(home, '.mozilla/firefox'),
      path.join(home, 'snap/firefox/common/.mozilla/firefox'),
      path.join(home, '.var/app/org.mozilla.firefox/.mozilla/firefox'),
      path.join(home, 'Library/Application Support/Firefox/Profiles')
    ];
    if (env.APPDATA) list.push(path.join(env.APPDATA, 'Mozilla/Firefox/Profiles'));
    return list;
  }

  function firefoxProfilesIn(root) {
    const out = [];
    try {
      for (const d of fs.readdirSync(root)) {
        const base = path.join(root, d);
        try {
          if (!fs.statSync(base).isDirectory()) continue;
          if (fs.existsSync(path.join(base, 'cookies.sqlite')) || fs.existsSync(path.join(base, 'places.sqlite'))) out.push(base);
        } catch (e) {}
      }
    } catch (e) {}
    return out;
  }

  /* Ищет файлы cookies популярных браузеров (обычные и snap/flatpak, Linux/macOS/Windows). */
  function browserCookieDbs(browser) {
    const out = [];
    const push = (p) => { try { if (fs.existsSync(p)) out.push(p); } catch (e) {} };
    const wantChrome = !browser || browser === 'chrome';
    const wantFirefox = !browser || browser === 'firefox';
    if (wantChrome) for (const root of chromeRoots()) for (const prof of chromeProfilesIn(root)) push(path.join(prof, 'Cookies'));
    if (wantFirefox) for (const root of firefoxRoots()) for (const prof of firefoxProfilesIn(root)) push(path.join(prof, 'cookies.sqlite'));
    return out;
  }

  /* Ищет БД истории посещений (Chrome History / Firefox places.sqlite). */
  function browserHistoryDbs(browser) {
    const out = [];
    const push = (p) => { try { if (fs.existsSync(p)) out.push(p); } catch (e) {} };
    const wantChrome = !browser || browser === 'chrome';
    const wantFirefox = !browser || browser === 'firefox';
    if (wantChrome) for (const root of chromeRoots()) for (const prof of chromeProfilesIn(root)) push(path.join(prof, 'History'));
    if (wantFirefox) for (const root of firefoxRoots()) for (const prof of firefoxProfilesIn(root)) push(path.join(prof, 'places.sqlite'));
    return out;
  }

  /* Копирует БД вместе с WAL/SHM (свежие записи Chrome лежат в -wal, без него данные «отстают»). */
  function copyDbWithWal(db) {
    const tmp = db + '.kanban.tmp';
    fs.copyFileSync(db, tmp);
    for (const suf of ['-wal', '-shm']) {
      try { if (fs.existsSync(db + suf)) fs.copyFileSync(db + suf, tmp + suf); } catch (e) {}
    }
    return tmp;
  }
  function cleanupTmp(tmp) {
    for (const suf of ['', '-wal', '-shm']) { try { fs.unlinkSync(tmp + suf); } catch (e) {} }
  }

  /* Читает cookies из одной БД браузера (скопировав файл вместе с WAL, чтобы не мешать блокировке).
     Возвращает { rows: ["Domain=host\tname\thost", …] }. */
  function readOneCookieDb(db) {
    let Database;
    try { Database = require('node:sqlite').DatabaseSync; } catch (e) { return { rows: [], error: 'no sqlite' }; }
    let tmp = null;
    try {
      tmp = copyDbWithWal(db);
      const d = new Database(tmp, { readOnly: true });
      let raw = [];
      try {
        raw = d.prepare('SELECT host_key AS host, name FROM cookies').all();
      } catch (e) {
        try { raw = d.prepare('SELECT host AS host, name FROM moz_cookies').all(); } catch (e2) { raw = []; }
      }
      try { d.close(); } catch (e) {}
      const rows = raw.filter(r => r && r.host).map(r => 'Domain=' + String(r.host).replace(/^\./, '') + '\t' + (r.name || '') + '\t' + (r.host || ''));
      return { rows };
    } catch (e) {
      return { rows: [], error: String((e && e.message) || e) };
    } finally {
      cleanupTmp(tmp);
    }
  }

  /* Читает историю посещений (URL + заголовки) — она меняется каждый день,
     в отличие от cookies, поэтому именно она отражает активность в браузере. */
  function readOneHistoryDb(db, limit) {
    let Database;
    try { Database = require('node:sqlite').DatabaseSync; } catch (e) { return { rows: [], error: 'no sqlite' }; }
    const lim = limit || 3000;
    let tmp = null;
    try {
      tmp = copyDbWithWal(db);
      const d = new Database(tmp, { readOnly: true });
      let raw = [];
      try {
        raw = d.prepare('SELECT url AS url, title AS title FROM urls WHERE url IS NOT NULL ORDER BY last_visit_time DESC LIMIT ' + lim).all();
      } catch (e) {
        try { raw = d.prepare('SELECT url AS url, title AS title FROM moz_places WHERE url IS NOT NULL AND title IS NOT NULL ORDER BY last_visit_date DESC LIMIT ' + lim).all(); } catch (e2) { raw = []; }
      }
      try { d.close(); } catch (e) {}
      const rows = raw.filter(r => r && r.url).map(r => String(r.url) + '\t' + (r.title || ''));
      return { rows };
    } catch (e) {
      return { rows: [], error: String((e && e.message) || e) };
    } finally {
      cleanupTmp(tmp);
    }
  }

  /* Короткое человекочитаемое имя базы: «Профиль/файл». */
  function prettyDb(db) {
    const parts = String(db).split(path.sep);
    return parts.slice(-2).join('/');
  }

  /* Читает cookies И историю из браузера. Возвращает текст для анализа сигналов.
     opts.withHistory !== false — добавляет историю посещений (важно: она ежедневно меняется). */
  function extractBrowserCookies(browser, opts) {
    const withHistory = !(opts && opts.withHistory === false);
    const cookieDbs = browserCookieDbs(browser);
    const historyDbs = withHistory ? browserHistoryDbs(browser) : [];
    const dbs = cookieDbs.concat(historyDbs);
    if (!cookieDbs.length && !historyDbs.length) return { ok: false, error: 'no browser cookie db found' };
    const lines = [];
    let used = '';
    let cookieCount = 0, historyCount = 0;
    const details = [];
    for (const db of cookieDbs) {
      const r = readOneCookieDb(db);
      details.push({ db, kind: 'cookies', count: r.rows.length });
      if (r.rows.length) { lines.push(...r.rows); cookieCount += r.rows.length; used = used || db; }
    }
    for (const db of historyDbs) {
      const r = readOneHistoryDb(db);
      details.push({ db, kind: 'history', count: r.rows.length });
      if (r.rows.length) { lines.push(...r.rows); historyCount += r.rows.length; used = used || db; }
    }
    if (!lines.length) return { ok: false, error: 'no cookies or history read', dbs, details };
    return { ok: true, text: lines.join('\n'), count: lines.length, cookieCount, historyCount, browser: used, details, dbs };
  }


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
  /* Совпадение стема по началу слова: «спорт» найдёт «спорта»/«спортзал»,
     но НЕ «киберспорт»; «nba» — только «NBA», а не «kanban». */
  function matchesWord(text, w) {
    const stem = String(w || '').toLowerCase().trim();
    if (!stem) return false;
    const esc = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp('(?:^|[^a-zа-яё0-9])' + esc, 'i').test(String(text));
  }

  /* Реальные сигналы из истории браузера: поисковые запросы и просмотренное
     на YouTube. Cookies — НЕ источник интересов: подстрочные совпадения по
     доменам/именам дают ложные срабатывания (например, «nba» внутри «kanban»
     → выдуманный «Спорт»). Cookies остаются только для доступа к видео (yt-dlp). */
  const SEARCH_HOSTS = /(^|\.)(google\.[a-z.]+|yandex\.[a-z.]+|ya\.ru|duckduckgo\.com|bing\.com|startpage\.com|search\.brave\.com|go\.mail\.ru|search\.mail\.ru|nova\.rambler\.ru)$/i;
  const YT_HOSTS = /(^|\.)(youtube\.com|youtu\.be|m\.youtube\.com|music\.youtube\.com)$/i;

  function parseHistoryRows(rows) {
    const searches = [];
    const videos = [];
    const seenQ = new Set();
    const seenV = new Set();
    for (const line of rows) {
      if (!line || /^Domain=/.test(line)) continue; /* cookie-строки интересов не дают */
      const tab = line.indexOf('\t');
      const url = (tab < 0 ? line : line.slice(0, tab)).trim();
      const title = (tab < 0 ? '' : line.slice(tab + 1)).trim();
      let u;
      try { u = new URL(url); } catch (e) { continue; }
      const host = u.hostname;
      if (SEARCH_HOSTS.test(host)) {
        const q = (u.searchParams.get('q') || u.searchParams.get('text') || u.searchParams.get('p') || '').trim();
        if (q.length >= 2 && q.length <= 200 && !seenQ.has(q)) { seenQ.add(q); searches.push(q); }
        continue;
      }
      if (YT_HOSTS.test(host)) {
        let id = '';
        if (/youtu\.be$/i.test(host)) id = u.pathname.slice(1).split('/')[0];
        else if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
        else { const m = u.pathname.match(/^\/(shorts|live|embed)\/([A-Za-z0-9_-]{6,})/); if (m) id = m[2]; }
        if (id && /^[A-Za-z0-9_-]{6,}$/.test(id) && !seenV.has(id)) {
          seenV.add(id);
          videos.push({ id, title: title.replace(/\s*[-–—]\s*YouTube$/i, '').trim() || id });
        }
      }
    }
    return { searches, videos };
  }

  /* Применяет реальные сигналы истории: просмотренное на YouTube → watch
     (source:'history', dur 0 — длительность неизвестна), запросы → yt-queries.json.
     Старые cookie- и history-записи импорта удаляются, чтобы повторный импорт
     не раздувал счётчики. */
  function applyHistorySignals(sig) {
    watch = watch.filter(s => s.source !== 'cookies' && s.source !== 'history');
    const now = Date.now();
    sig.videos.forEach((v, i) => {
      watch.unshift({ id: v.id, title: v.title, channel: 'youtube (история)', dur: 0, watchedSec: 0, ts: now + i, source: 'history' });
    });
    if (watch.length > 2000) watch = watch.slice(0, 2000);
    saveWatch();
    sig.searches.forEach(q => addQuery(q));
    return { searches: sig.searches.length, videos: sig.videos.length };
  }

  /* Авто-темы: находятся в запросах и просмотрах, если сигналов ≥ 2. */
  function deriveThemes() {
    const counts = {};
    EXTRA_THEMES.forEach(t => counts[t.key] = 0);
    const src = watch.map(s => ({ title: s.title || '', channel: s.channel || '' }))
      .concat(queries.map(q => ({ title: q.q || '', channel: 'поиск' })));
    for (const s of src) {
      const text = (s.title + ' ' + s.channel).toLowerCase();
      for (const t of EXTRA_THEMES) if (t.words.some(w => matchesWord(text, w))) counts[t.key]++;
    }
    const out = EXTRA_THEMES.filter(t => counts[t.key] >= 2)
      .map(t => ({ key: t.key, label: t.label, icon: t.icon, count: counts[t.key], weight: 0, auto: true, words: t.words.slice(0, 5) }));
    const max = Math.max(1, ...out.map(o => o.count));
    out.forEach(o => o.weight = Math.round((o.count / max) * 100));
    out.sort((a, b) => b.count - a.count);
    return out;
  }

  /* «Портрет человека»: архетип + текстовое описание на основе карты интересов. */
  function buildPortrait(cats, top, themes) {
    const alive = cats.filter(c => c.count > 0);
    const all = alive.concat(themes.map(t => ({ key: t.key, label: t.label, icon: t.icon, count: t.count, weight: t.weight })));
    all.sort((a, b) => b.count - a.count);
    if (!all.length) {
      return { title: 'Новый пользователь', icon: '🌱', summary: 'Данных пока мало — посмотрите несколько видео или импортируйте cookies, и я соберу ваш портрет.', traits: [], keywords: [], generatedAt: new Date().toISOString() };
    }
    const top3 = all.slice(0, 3);
    const arch = ARCHETYPES[top3[0].key] || { title: 'Разносторонний человек', icon: '🧭' };
    const kws = top.slice(0, 6).map(t => t.w);
    const themeNames = themes.slice(0, 3).map(t => t.label);
    const parts = [];
    parts.push('Сильнее всего вас притягивают ' + top3.map(c => c.label + ' (' + c.count + ')').join(', ') + '.');
    if (kws.length) parts.push('Часто в фокусе: ' + kws.map(k => '«' + k + '»').join(', ') + '.');
    if (themeNames.length) parts.push('Авто-темы: ' + themeNames.join(', ') + '.');
    parts.push('Всего учтено ' + alive.reduce((s, c) => s + c.count, 0) + ' интересов в ' + all.length + ' темах.');
    return {
      title: arch.title,
      icon: arch.icon,
      summary: parts.join(' '),
      traits: all.slice(0, 8).map(c => ({ key: c.key, label: c.label, icon: c.icon, weight: c.weight, count: c.count })),
      keywords: kws,
      themesCount: themes.length,
      generatedAt: new Date().toISOString()
    };
  }

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
    /* запросы — реальные поисковые запросы из браузера и панели ▶ */
    for (const q of queries) {
      const text = String(q.q || '');
      if (!text) continue;
      const toks = text.toLowerCase().match(/[a-zа-яё0-9]{4,}/g) || [];
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
      .filter(s => s.source !== 'cookies')
      .slice(0, 12)
      .map(s => ({ title: s.title, channel: s.channel, dur: s.dur, ts: s.ts }));
    const themes = deriveThemes();
    const portrait = buildPortrait(cats, top, themes);
    return {
      total,
      totalMin: Math.round(totalTime / 60),
      queries: queries.length,
      generatedAt: new Date().toISOString(),
      cats,
      themes,
      portrait,
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
      addQuery(q);
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
      const raw = buf ? buf.toString('utf8') : '';
      /* JSON-запрос {source:'browser'} — тянем cookies прямо из браузера на этом ПК. */
      if (/^\s*\{/.test(raw)) {
        let body = {};
        try { body = JSON.parse(raw); } catch (e) {}
        if (body && body.source === 'browser') {
          const ex = extractBrowserCookies(String(body.browser || '') || null);
          if (!ex.ok) return json(res, 404, { error: ex.error || 'browser cookies not found' });
          const cookieText = ex.text.split('\n').filter(l => /^Domain=/.test(l)).join('\n');
          try { fs.writeFileSync(COOKIES_FILE, cookieText, { flag: 'w' }); } catch (e) { return json(res, 500, { error: 'write failed' }); }
          auth.browser = String(body.browser || '') || auth.browser || 'chrome';
          saveAuth();
          return json(res, 200, { ok: true, size: Buffer.byteLength(cookieText), count: ex.cookieCount || 0, browser: auth.browser });
        }
      }
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
        ts: Date.now(),
        source: String(body.source || 'panel').slice(0, 24)
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

  /* ---------- импорт истории с прогрессом (опрос, не SSE — лимит соединений) ---------- */
  const importJobs = new Map();
  const tick = ms => new Promise(r => setTimeout(r, ms || 0));

  function jobEmit(job, obj) {
    job.events.push(obj);
    if (job.events.length > 800) job.events.splice(0, job.events.length - 400);
    for (const c of job.clients) { try { c.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (e) { job.clients.delete(c); } }
  }

  /* Снимок ключевых чисел для проверки, что импорт реально что-то изменил. */
  function snapshot() {
    const i = buildInterests();
    const cats = {};
    i.cats.forEach(c => cats[c.key] = c.count);
    return { total: i.total, cats };
  }

  async function runImportJob(job, opts) {
    try {
      jobEmit(job, { stage: 'start', pct: 3, message: 'Запускаю импорт истории браузера…' });
      await tick(40);
      let text = '', count = 0, usedBrowser = null, source = 'file';
      if (opts && opts.text != null) {
        text = String(opts.text);
        jobEmit(job, { stage: 'file', pct: 8, message: 'Читаю загруженный файл (' + Math.round(text.length / 1024) + ' КБ)', count: 0 });
        await tick(40);
      } else {
        const browser = String((opts && opts.browser) || '') || null;
        const cookieDbs = browserCookieDbs(browser);
        const historyDbs = browserHistoryDbs(browser);
        const dbs = cookieDbs.map(db => ({ db, kind: 'cookies' })).concat(historyDbs.map(db => ({ db, kind: 'history' })));
        source = browser || 'auto';
        jobEmit(job, { stage: 'scan', pct: 5, message: 'Ищу базы cookies и истории' + (browser ? ' (' + browser + ')' : '') + '… найдено: ' + dbs.length, files: dbs.map(d => prettyDb(d.db)) });
        await tick(60);
        if (!dbs.length) { jobEmit(job, { stage: 'error', pct: 100, message: 'Базы браузера не найдены — браузер не установлен или профиль пуст' }); job.done = true; return; }
        const lines = [];
        let cookieCount = 0, historyCount = 0;
        for (let i = 0; i < dbs.length; i++) {
          const { db, kind } = dbs[i];
          const base = 8 + Math.round((i / dbs.length) * 30);
          jobEmit(job, { stage: 'read', pct: base, message: 'Читаю ' + (kind === 'history' ? 'историю ' : '') + prettyDb(db) + '…', file: prettyDb(db) });
          await tick(50);
          const r = kind === 'history' ? readOneHistoryDb(db) : readOneCookieDb(db);
          if (r.rows.length) { lines.push(...r.rows); usedBrowser = usedBrowser || db; if (kind === 'history') historyCount += r.rows.length; else cookieCount += r.rows.length; }
          jobEmit(job, { stage: 'read', pct: base + 3, message: '  → ' + prettyDb(db) + ': записей ' + r.rows.length, count: r.rows.length, file: prettyDb(db) });
          await tick(40);
        }
        if (!lines.length) { jobEmit(job, { stage: 'error', pct: 100, message: 'Не найдено ни cookies, ни истории (браузер закрыт или профиль пуст)' }); job.done = true; return; }
        text = lines.join('\n');
        count = lines.length;
        try {
          /* в файл сохраняем только cookie-строки (для yt-dlp), историю — не пишем */
          fs.writeFileSync(COOKIES_FILE, lines.filter(l => /^Domain=/.test(l)).join('\n'), { flag: 'w' });
          auth.browser = String((opts && opts.browser) || '') || auth.browser || 'chrome';
          saveAuth();
        } catch (e) {}
        jobEmit(job, { stage: 'read', pct: 40, message: 'Прочитано записей: ' + count + ' (cookies ' + cookieCount + ', история ' + historyCount + ')' + (usedBrowser ? ' (' + prettyDb(usedBrowser) + ')' : ''), count, cookieCount, historyCount });
      }


      jobEmit(job, { stage: 'parse', pct: 45, message: 'Ищу в истории поисковые запросы и просмотренное на YouTube…' });
      await tick(60);
      const sig = parseHistoryRows(text.split(/\r?\n/));
      if (!sig.searches.length && !sig.videos.length) {
        jobEmit(job, { stage: 'error', pct: 100, message: 'В загруженном тексте нет поисковых запросов и просмотров YouTube — импорт строится только из реальной истории (запросы Google/Яндекс и ролики)' });
        job.done = true; return;
      }
      const domains = (text.match(/Domain=([^\s;]+)/gi) || []).length;

      const before = snapshot();
      const r = applyHistorySignals(sig);
      jobEmit(job, { stage: 'tags', pct: 70, message: 'Принято: запросов ' + r.searches + ', просмотренных роликов ' + r.videos + ' (только реальные данные, без угадывания по cookies)' });
      await tick(60);
      let step = 0;
      for (const q of sig.searches) {
        step++;
        jobEmit(job, { stage: 'tag', pct: 70 + Math.round((step / Math.max(1, sig.searches.length + sig.videos.length)) * 12), message: '🔍 Поиск: «' + q + '»', tag: q, label: 'Поиск', icon: '🔍' });
        if (step % 3 === 0) await tick(50);
      }
      for (const v of sig.videos) {
        step++;
        jobEmit(job, { stage: 'tag', pct: 70 + Math.round((step / Math.max(1, sig.searches.length + sig.videos.length)) * 12), message: '▶ ' + v.title, tag: v.title, label: 'YouTube', icon: '▶' });
        if (step % 3 === 0) await tick(50);
      }

      jobEmit(job, { stage: 'apply', pct: 82, message: 'Пересчитываю карту интересов…' });
      await tick(80);
      const after = buildInterests();

      /* проверка импорта */
      const grown = [];
      for (const c of after.cats) {
        const b = before.cats[c.key] || 0;
        if (c.count > b) grown.push({ key: c.key, label: c.label, icon: c.icon, delta: c.count - b });
      }
      const delta = after.total - before.total;
      const added = r.searches + r.videos;
      const imported = added > 0;
      const verify = {
        imported,
        beforeTotal: before.total,
        afterTotal: after.total,
        delta,
        grown,
        searches: r.searches,
        videos: r.videos,
        message: imported
          ? ('Импорт подтверждён: ' + r.searches + ' запросов и ' + r.videos + ' роликов из истории, ' + grown.length + ' тем выросло' + (grown.length ? ' (' + grown.map(g => g.icon + g.label).join(', ') + ')' : '') + '.')
          : 'Импорт не дал новых сигналов.'
      };
      jobEmit(job, { stage: 'verify', pct: 90, message: verify.message, verify });

      const themes = after.themes || [];
      try { fs.writeFileSync(THEMES_FILE, JSON.stringify({ themes, generatedAt: new Date().toISOString() }, null, 2)); } catch (e) {}
      if (themes.length) jobEmit(job, { stage: 'themes', pct: 94, message: 'Авто-темы (' + themes.length + '): ' + themes.map(t => t.icon + t.label).join(', '), themes });

      jobEmit(job, { stage: 'portrait', pct: 97, message: 'Собираю ваш портрет…', portrait: after.portrait });
      await tick(60);

      job.result = { ok: true, source, count, domains, updates: added, searches: r.searches, videos: r.videos, verify, themes, portrait: after.portrait, interests: after };
      job.done = true;
      jobEmit(job, { stage: 'done', pct: 100, message: 'Готово', result: job.result });
    } catch (e) {
      job.done = true;
      jobEmit(job, { stage: 'error', pct: 100, message: 'Ошибка импорта: ' + String((e && e.message) || e) });
    }
  }

  function interestsHandle(p, url, req, res) {
    if (req.method === 'POST' && p === '/api/interests/import') {
      return readBody(req).then(buf => {
        let opts = {};
        try { opts = JSON.parse((buf || '').toString() || '{}'); } catch (e) {}
        const id = 'imp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        const job = { id, events: [], clients: new Set(), done: false, result: null };
        importJobs.set(id, job);
        setTimeout(() => { try { importJobs.delete(id); } catch (e) {} }, 10 * 60 * 1000);
        runImportJob(job, opts);
        json(res, 200, { ok: true, job: id });
        return true;
      });
    }
    if (req.method === 'GET' && p === '/api/interests/import/status') {
      const id = String(url.searchParams.get('job') || '');
      const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0);
      const job = importJobs.get(id);
      if (!job) return json(res, 200, { ok: false, done: true, error: 'Задача не найдена', events: [], next: since });
      return json(res, 200, { ok: true, done: !!job.done, next: job.events.length, events: job.events.slice(since), result: job.result });
    }
    if (req.method === 'GET' && p === '/api/interests/import/events') {
      const id = String(url.searchParams.get('job') || '');
      const job = importJobs.get(id);
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      res.write(':ok\n\n');
      if (!job) {
        res.write('data: ' + JSON.stringify({ stage: 'error', pct: 100, message: 'Задача не найдена' }) + '\n\n');
        res.end();
        return true;
      }
      for (const ev of job.events) { try { res.write('data: ' + JSON.stringify(ev) + '\n\n'); } catch (e) {} }
      if (job.done) { res.end(); return true; }
      job.clients.add(res);
      const timer = setInterval(() => { try { res.write(':k\n\n'); } catch (e) { clearInterval(timer); } }, 20000);
      req.on('close', () => { clearInterval(timer); job.clients.delete(res); });
      return true;
    }
    if (req.method === 'GET' && p === '/api/interests/portrait') {
      return json(res, 200, buildInterests().portrait);
    }
    if (req.method === 'POST' && p === '/api/interests/apply-rows') {
      return readBody(req).then(buf => {
        let body = {};
        try { body = JSON.parse((buf || '').toString('utf8') || '{}'); } catch (e) {}
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const lines = rows.map(r => {
          if (typeof r === 'string') return r;
          if (!r || typeof r !== 'object') return '';
          return String(r.url || '') + '\t' + String(r.title || '');
        }).filter(Boolean);
        const r = applyHistorySignals(parseHistoryRows(lines));
        const interests = buildInterests();
        return json(res, 200, {
          ok: true,
          source: String(body.source || 'device').slice(0, 24),
          count: lines.length,
          updates: r.searches + r.videos,
          searches: r.searches,
          videos: r.videos,
          themes: interests.themes,
          portrait: interests.portrait,
          interests
        });
      });
    }
    if (req.method === 'POST' && p === '/api/interests/rebuild-from-cookies') {
      /* cookies больше не источник интересов — эндпоинт оставлен для совместимости:
         если передан текст с историей (url\t заголовок), строим из него; иначе просто
         пересчитываем по текущим данным. */
      return readBody(req).then(buf => {
        const text = (buf || '').toString('utf8');
        let r = { searches: 0, videos: 0 };
        if (text.trim()) r = applyHistorySignals(parseHistoryRows(text.split(/\r?\n/)));
        const interests = buildInterests();
        json(res, 200, { ok: true, updates: r.searches + r.videos, searches: r.searches, videos: r.videos, themes: interests.themes, portrait: interests.portrait });
        return true;
      });
    }
    return false;
  }

  return { handle, extractBrowserCookies, parseHistoryRows, applyHistorySignals, buildInterests, interestsHandle };

};
