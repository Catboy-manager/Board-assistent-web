'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execFile } = require('child_process');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const CONFIG_FILE = path.join(ROOT, 'config.json');
const MAX_BODY = 30 * 1024 * 1024;

const assist = require('./assist')({ dataDir: DATA_DIR });
const telegram = require('./telegram-bot');

let config = {};
try { config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { console.error('config.json not read:', e.message); }

let db = defaultDb();
try {
  if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
} catch (e) { console.error('db.json not read, using defaults:', e.message); }
saveDb();

function defaultDb() {
  return {
    board: {
      columns: [
        { id: 'c1', title: 'Задачи', color: '#f5b7b1' },
        { id: 'c2', title: 'В работе', color: '#aed6f1' },
        { id: 'c3', title: 'Готово', color: '#a9dfbf' }
      ],
      cards: []
    },
    events: [],
    settings: {
      background: { type: 'color', value: '#1e2a3a', blur: 0, darken: 0 }
    }
  };
}

function saveDb() {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function uid(p = '') {
  return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json'
};

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
  return true;
}

function serverError(res, err, log = '') {
  if (log) console.error(log, err && err.message);
  json(res, 500, { error: err && err.message ? err.message : 'server error' });
}

/* ---------------- Weather ---------------- */

let weatherCache = { at: 0, data: null };

async function getWeather() {
  const cfg = config.weather || {};
  const url = (cfg.url || 'https://api.open-meteo.com/v1/forecast') +
    '?latitude=' + (cfg.latitude ?? 55.7558) +
    '&longitude=' + (cfg.longitude ?? 37.6173) +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m' +
    '&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset' +
    '&timezone=Europe%2FMoscow&forecast_days=2';
  const res = await fetch(url);
  if (!res.ok) throw new Error('weather api ' + res.status);
  const raw = await res.json();

  const now = new Date();
  const h = raw.hourly.time.map((t, i) => ({ time: t, t2m: raw.hourly.temperature_2m[i], precip: raw.hourly.precipitation_probability[i], code: raw.hourly.weather_code[i], wind: raw.hourly.wind_speed_10m[i] }));
  let startIdx = h.findIndex(x => x.time >= raw.current.time);
  if (startIdx < 0) startIdx = 0;
  const hourly = h.slice(startIdx, startIdx + 24);

  const daily = (raw.daily || {});
  const tomorrow = {
    code: (daily.weather_code || [])[1] != null ? daily.weather_code[1] : (daily.weather_code || [])[0],
    tmax: (daily.temperature_2m_max || [])[1] != null ? daily.temperature_2m_max[1] : (daily.temperature_2m_max || [])[0],
    tmin: (daily.temperature_2m_min || [])[1] != null ? daily.temperature_2m_min[1] : (daily.temperature_2m_min || [])[0],
    precip: (daily.precipitation_probability_max || [])[1] != null ? daily.precipitation_probability_max[1] : (daily.precipitation_probability_max || [])[0],
    wind: (daily.wind_speed_10m_max || [])[1] != null ? daily.wind_speed_10m_max[1] : (daily.wind_speed_10m_max || [])[0],
    sunrise: (daily.sunrise || [])[1],
    sunset: (daily.sunset || [])[1]
  };

  return {
    city: config.cityName || 'Москва',
    fetchedAt: new Date().toISOString(),
    current: raw.current,
    hourly,
    tomorrow
  };
}

async function weatherHandler(res) {
  try {
    if (Date.now() - weatherCache.at < 600000 && weatherCache.data) {
      return json(res, 200, weatherCache.data);
    }
    const data = await getWeather();
    weatherCache = { at: Date.now(), data };
    json(res, 200, data);
  } catch (e) {
    if (weatherCache.data) json(res, 200, Object.assign({ stale: true }, weatherCache.data));
    else serverError(res, e, 'weather');
  }
}

/* ---------------- AI: opencode CLI / HTTP API ---------------- */

function resolveOpencodeBin() {
  const cfg = (config.ai && config.ai.opencodeBin) || '';
  if (cfg) return cfg;
  const home = path.join(os.homedir(), '.opencode', 'bin', 'opencode');
  try { if (fs.statSync(home).isFile()) return home; } catch (e) {}
  return 'opencode';
}

function contentText(part) {
  if (typeof part === 'string') return part;
  if (Array.isArray(part)) {
    return part.map(c => c.type === 'text' ? (c.text || '') : '').filter(Boolean).join(' ');
  }
  return '';
}
function contentParts(part) {
  return Array.isArray(part) ? part : (typeof part === 'string' ? [{ type: 'text', text: part }] : []);
}

function extractAttachments(parts, tmpFiles) {
  const files = [];
  for (const p of parts) {
    if (p.type === 'image_url') {
      const url = (p.image_url && p.image_url.url) || p.text || '';
      const m = url.match(/^data:([^;,]+);base64,(.+)$/s);
      if (!m) continue;
      const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }[m[1]] || '.png';
      const tf = path.join(os.tmpdir(), 'kban-' + uid('a') + ext);
      fs.writeFileSync(tf, Buffer.from(m[2], 'base64'));
      tmpFiles.push(tf);
      files.push(tf);
    } else if (p.type === 'input_audio') {
      const data = (p.input_audio && p.input_audio.data) || '';
      const d = data.replace(/^data:[^;]+;base64,/, '');
      if (!d) continue;
      const fmt = (p.input_audio && p.input_audio.format) || 'webm';
      const tf = path.join(os.tmpdir(), 'kban-' + uid('a') + (fmt === 'mp4' ? '.mp4' : '.webm'));
      fs.writeFileSync(tf, Buffer.from(d, 'base64'));
      tmpFiles.push(tf);
      files.push(tf);
    }
  }
  return files;
}

async function callAI(messages, { stream = false } = {}) {
  const ai = config.ai || {};
  const base = (ai.baseUrl || '').replace(/\/+$/, '');
  const key = ai.apiKey || '';
  const url = base + '/chat/completions';
  const body = JSON.stringify({
    model: ai.model || 'opencode/big-pickle',
    messages,
    max_tokens: Number(ai.maxTokens) || 1024,
    temperature: ai.temperature != null ? Number(ai.temperature) : 0.7,
    stream
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: 'Bearer ' + key } : {})
      },
      body,
      signal: controller.signal
    });
    const text = await res.text();
    if (!res.ok) throw new Error('AI API error ' + res.status + ': ' + text.slice(0, 300));
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('AI API bad response'); }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* Запуск opencode CLI (неинтерактивно), стриминг текста. */
let aiProjectsDir = null;
function getProjectsDir() {
  if (aiProjectsDir) return aiProjectsDir;
  const cfg = config && config.ai && config.ai.projectsDir;
  const dir = cfg || path.join(os.homedir(), 'AI Projects');
  fs.mkdirSync(dir, { recursive: true });
  aiProjectsDir = dir;
  return dir;
}

/* Слепок файлов проектов (путь -> mtime) для определения, что ассистент создал/изменил */
function snapshotFiles(root, limit = 3000) {
  const map = new Map();
  const walk = (dir, rel) => {
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const it of items) {
      if (map.size >= limit) return;
      if (it.name === 'node_modules' || it.name === '.git' || it.name.startsWith('.')) continue;
      const full = path.join(dir, it.name);
      const r = rel ? rel + '/' + it.name : it.name;
      try {
        const s = fs.statSync(full);
        if (s.isDirectory()) { if (r.split('/').length <= 8) walk(full, r); }
        else if (s.isFile()) map.set(r, s.mtimeMs);
      } catch (e) {}
    }
  };
  walk(root, '');
  return map;
}

function diffFiles(before, after) {
  const out = [];
  for (const [p, mt] of after) {
    if (!before.has(p) || before.get(p) !== mt) {
      let size = 0;
      try { size = fs.statSync(path.join(getProjectsDir(), p)).size; } catch (e) {}
      out.push({ path: p, size });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path)).slice(0, 12);
}

/* ---------------- Cardify: занос найденного в карточки/память (надёжно, по JSON) ---------------- */

const CARDIFY_RULE =
  '\n\nВАЖНО: пользователь просит занести данные на доску/в карточки/в память. НЕ пиши обычный ответ. ' +
  'Верни ТОЛЬКО JSON (без пояснений и кода-обёртки), вида:\n' +
  '{"cards":[{"text":"заголовок задачи","column":"название колонки (можно опустить)"}],"mem":["факт для памяти (можно опустить)"]}\n' +
  'Колонки называй так же, как они есть на доске; если сомневаешься — не указывай "column".';

const RESULT_ABSENT = { text: '', summary: '' };

function intentCardify(text) {
  return /(занеси|занести|внеси|внести|распих|разложи|разнести|добавь на доску|положи на доску|в карточк|по карточк|на карточк|в таблиц|в табличку|в столб|на память запомни)/i.test(String(text || ''));
}

function extractCardifyJson(text) {
  const t = String(text || '').trim();
  if (!/"(cards|mem)"/.test(t)) return null;
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : t).trim();
  const tryParse = (s) => {
    try {
      const v = JSON.parse(s);
      if (v && typeof v === 'object' && !Array.isArray(v) && (Array.isArray(v.cards) || Array.isArray(v.mem))) return v;
    } catch (e) {}
    return null;
  };
  let obj = tryParse(candidate);
  if (!obj) { const m = candidate.match(/\{[\s\S]*\}/); if (m) obj = tryParse(m[0]); }
  return obj || null;
}

function boardCli(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(ROOT, 'assist-cli.js'), '--db', path.join(DATA_DIR, 'db.json'), '--mem', path.join(DATA_DIR, 'memory.json'), ...args],
      { timeout: 20000, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) {}
        resolve({ ok: !err, out: String(stdout || '').trim() || String(stderr || '').trim() });
      });
  });
}

async function applyCardify(text) {
  const obj = extractCardifyJson(text);
  if (!obj) return RESULT_ABSENT;

  const notes = [];
  let cardsMade = 0;
  if (Array.isArray(obj.cards)) {
    for (const c of obj.cards.slice(0, 20)) {
      const title = String((c && (c.text || c.title)) || '').trim().slice(0, 200);
      if (!title) continue;
      const col = String((c && c.column) || '').trim();
      let r = await boardCli(['add', title, ...(col ? [col] : [])]);
      if (!r.ok && col) r = await boardCli(['add', title]);
      if (r.ok) { cardsMade++; notes.push('• ' + title + (col ? ' → ' + col : '')); }
      else notes.push('⚠️ ' + title + ' — ' + r.out.slice(0, 80));
    }
  }
  let memNote = '';
  if (Array.isArray(obj.mem) && obj.mem.length) {
    const facts = obj.mem.map(s => String(s || '').trim()).filter(Boolean).slice(0, 10);
    for (const t of facts) assist.remember(t, 'ai');
    if (facts.length) memNote = '🧠 В память: ' + facts.join('; ');
  }

  const summary = [cardsMade ? '✅ Занесено в карточки (' + cardsMade + '):\n' + notes.join('\n') : null, memNote || null].filter(Boolean).join('\n\n');
  const fenced = String(text).match(/```(?:json)?[\s\S]*?```/);
  let rest = String(text);
  if (fenced) { rest = rest.replace(fenced[0], ''); }
  else { const m = rest.match(/\{[\s\S]*\}/); if (m) rest = rest.replace(m[0], ''); }
  rest = rest.replace(/```/g, '').replace(/\s+/g, ' ').trim();
  const joined = [summary, rest].filter(Boolean).join('\n\n');
  return { text: joined || summary || 'Готово.', summary };
}

function runOpencode({ model, prompt, files }, onText) {
  return new Promise((resolve, reject) => {
    const args = ['run', '-m', model, '--format', 'json', '--dir', getProjectsDir(), prompt];
    for (const f of files) args.push('--file', f);
    const bin = resolveOpencodeBin();
    const env = Object.assign({}, process.env, {
      OPENCODE_CONFIG: path.join(ROOT, 'ai-opencode.json')
    });
    let child;
    try { child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], env }); }
    catch (e) { return reject(e); }
    const killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} }, 240000);
    let stderr = '';
    let buffer = '';
    let textParts = 0;
    child.stderr.on('data', d => { stderr += d.toString(); if (stderr.length > 20000) stderr = stderr.slice(-20000); });
    child.stdout.on('data', (d) => {
      buffer += d.toString();
      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === 'text' && ev.part && ev.part.text) {
            textParts++;
            onText(ev.part.text);
          }
        } catch (e) {}
      }
    });
    child.on('error', (err) => { clearTimeout(killTimer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(killTimer);
      if (code !== 0 && textParts === 0) reject(new Error('opencode exit ' + code + ': ' + stderr.trim().slice(0, 500)));
      else resolve({ model, note: 'answered via opencode CLI' });
    });
  });
}

function buildPrompt(messages, cardify) {
  const ai = config.ai || {};
  const dir = getProjectsDir();
  let sys = (ai.systemPrompt || 'Ты полезный ИИ-ассистент.') +
    '\n\nТы можешь использовать инструменты opencode (запись/чтение файлов, bash, веб-запросы, веб-поиск) для работы на этом ПК.' +
    '\nРабочий каталог ассистента: ' + dir + '. Для создания проектов указывай АБСОЛЮТНЫЕ пути, например: ' + path.join(dir, 'ИмяПроекта') +
    '\nПри создании проекта реально используй инструменты (создавай папки и файлы), потом подтверди результат в ответе.' +
    '\nОтвечай по-русски (если не просят иное), кратко и по делу.' +
    '\n\nУправление канбан-доской пользователя (через bash):' +
    '\n  node ' + path.join(ROOT, 'assist-cli.js') + ' --db ' + path.join(DATA_DIR, 'db.json') + ' КОМАНДА' +
    '\n  Команды: add "текст" ["колонка"] | move "текст" "колонка" | done "текст" | remove "текст" | addcol "имя" | renamecol "старое" "новое" | list | status' +
    '\n  Пример: node ' + path.join(ROOT, 'assist-cli.js') + ' --db ' + path.join(DATA_DIR, 'db.json') + ' move "Сходить в магазин" "Готово"' +
    '\nПамять и напоминания: node ' + path.join(ROOT, 'assist-cli.js') + ' --mem ' + path.join(DATA_DIR, 'memory.json') + ' remember "факт"; --rem ' + path.join(DATA_DIR, 'reminders.json') + ' remind "текст" "+минуты"' +
    '\nЗапустите утилиту без аргументов, чтобы увидеть полный список команд. После действия кратко сообщите пользователю, что сделали.';
  const parts = [];
  for (const m of messages) {
    const role = m.role === 'assistant' ? 'Ассистент' : 'Пользователь';
    const texts = contentText(m.content).trim();
    if (texts) parts.push(role + ': ' + texts);
  }
  const lastUser = contentText((messages.slice().reverse().find(m => m.role === 'user') || {}).content || '');
  const ctx = assist.getMemoryContext(lastUser);
  if (ctx) sys += '\n\nПостоянная память ассистента (факты о пользователе/проектах):\n' + ctx;
  if (cardify) sys += CARDIFY_RULE;
  return sys + '\n\n' + parts.join('\n') + '\n\nАссистент:';
}

async function aiChatHandler(req, res, body) {
  const wantStream = body.stream === true;
  const messages = body.messages || [];
  const tmpFiles = [];

  const sendTextChunk = (text) => {
    if (wantStream) res.write('data: ' + JSON.stringify({ delta: text }) + '\n\n');
  };

  const finish = (payload) => {
    if (wantStream) { res.end(); }
    else json(res, 200, payload);
  };

  if (wantStream) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  }

  try {
    const wantCardify = messages.some(m => intentCardify(contentText(m.content)));
    const attachments = [];
    for (const m of messages) attachments.push(...extractAttachments(contentParts(m.content), tmpFiles));

    if ((config.ai && config.ai.mode) === 'api') {
      const result = await callAI([{ role: 'system', content: (config.ai.systemPrompt || '') + (wantCardify ? CARDIFY_RULE : '') }, ...messages], { stream: false });
      let reply = (result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content) || '';
      if (wantCardify) { const r = await applyCardify(reply); reply = r.text; }
      tryCleanFiles(tmpFiles);
      return finish({ reply, model: result.model, usage: result.usage });
    }

    const prompt = buildPrompt(messages, wantCardify);
    const before = snapshotFiles(getProjectsDir());
    let reply = '';
    await runOpencode({ model: config.ai.model || 'opencode/big-pickle', prompt, files: attachments }, (t) => {
      reply += t;
      if (!wantCardify) sendTextChunk(t);
    });
    let addedNote = '';
    if (wantCardify) { const r = await applyCardify(reply); reply = r.text; addedNote = r.summary; }
    const created = diffFiles(before, snapshotFiles(getProjectsDir()));
    if (wantStream && wantCardify && reply) res.write('data: ' + JSON.stringify({ delta: reply }) + '\n\n');
    if (wantStream && addedNote) res.write('data: ' + JSON.stringify({ delta: '\n\n' + addedNote, files: created }) + '\n\n');
    else if (wantStream && created.length) res.write('data: ' + JSON.stringify({ files: created }) + '\n\n');
    tryCleanFiles(tmpFiles);
    if (!reply.trim()) reply = '⚠️ Модель вернула пустой ответ.';
    finish({ reply, model: config.ai.model || 'opencode/big-pickle', files: created });
  } catch (e) {
    console.error('[aiChat] error:', e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e);
    tryCleanFiles(tmpFiles);
    if (wantStream) {
      res.write('data: ' + JSON.stringify({ error: e.message }) + '\n\n');
      res.end();
    } else {
      json(res, 500, { error: e.message });
    }
  }
}

function tryCleanFiles(files) {
  for (const f of files) { try { fs.unlinkSync(f); } catch (e) {} }
  return true;
}

/* ---------------- STT (локальное распознавание речи, faster-whisper) ---------------- */

const STT_SCRIPT = path.join(ROOT, 'stt', 'stt.py');
const PYTHON = '/usr/bin/python3';

function sttFile(audioFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [STT_SCRIPT, audioFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', d => { out += d.toString(); if (out.length > 20000) out = out.slice(-20000); });
    child.stderr.on('data', d => { err += d.toString(); if (err.length > 5000) err = err.slice(-5000); });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} }, 60000);
    child.on('error', (e) => { clearTimeout(timer); reject(new Error('stt spawn: ' + e.message)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error('stt exit ' + code + ': ' + err.trim().slice(0, 300)));
      else resolve(out.trim());
    });
  });
}

function audioExtFrom(mime, format) {
  const m = (format || mime || 'webm').toLowerCase();
  if (m.includes('wav')) return 'wav';
  if (m.includes('ogg') || m.includes('opus')) return 'ogg';
  if (m.includes('mp4') || m.includes('m4a')) return 'mp4';
  if (m.includes('webm')) return 'webm';
  return 'webm';
}

async function sttHandler(req, res, body) {
  const tmp = path.join(os.tmpdir(), 'kban-stt-' + uid('a') + '.' + audioExtFrom(body.mime, body.format));
  try {
    const data = (body.audio || body.data || '').replace(/^data:[^;]+;base64,/, '');
    if (!data) return json(res, 400, { error: 'no audio' });
    fs.writeFileSync(tmp, Buffer.from(data, 'base64'));
    const t0 = Date.now();
    const text = await sttFile(tmp);
    const ms = Date.now() - t0;
    try { fs.unlinkSync(tmp); } catch (e) {}
    console.log('[stt] ' + ms + 'ms: ' + JSON.stringify(text.slice(0, 100)));
    return json(res, 200, { text, ms });
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) {}
    return serverError(res, e, 'stt');
  }
}

async function aiVoiceHandler(req, res, body) {
  let tmpFile = null;
  try {
    const audio = (body.audio || body.data || '').replace(/^data:[^;]+;base64,/, '');
    if (!audio) return json(res, 400, { error: 'no audio' });
    tmpFile = path.join(os.tmpdir(), 'kban-' + uid('a') + '.' + audioExtFrom(body.mime, body.format));
    fs.writeFileSync(tmpFile, Buffer.from(audio, 'base64'));

    // 1) локальное распознавание речи (offline, работает в любом браузере)
    let transcript = '';
    let sttMs = 0;
    const tStt = Date.now();
    try { transcript = await sttFile(tmpFile); } catch (e) { console.error('stt failed:', e.message); }
    sttMs = Date.now() - tStt;
    console.log('[voice] audio bytes=' + (Buffer.byteLength(audio, 'base64')) + ' stt=' + sttMs + 'ms transcript=' + JSON.stringify(transcript.slice(0, 80)));

    let reply;
    if (transcript) {
      const wantCardify = intentCardify(transcript);
      const mc = assist.getMemoryContext(transcript);
      const prompt = (body.hint || 'Пользователь отправил голосовое сообщение. Распознанный текст приведён ниже; ответь на него.') +
        (wantCardify ? CARDIFY_RULE : '') +
        '\n\nРаспознанный текст: ' + transcript + (mc ? '\n\nПамять ассистента:\n' + mc : '') + '\n\nАссистент:';
      const before = snapshotFiles(getProjectsDir());
      const tAi = Date.now();
      reply = '';
      await runOpencode({ model: config.ai.model || 'opencode/big-pickle', prompt, files: [] }, (t) => { reply += t; });
      const aiMs = Date.now() - tAi;
      const created = diffFiles(before, snapshotFiles(getProjectsDir()));
      if (wantCardify) { const r = await applyCardify(reply); reply = r.text; }
      if (!reply.trim()) reply = '⚠️ Модель не ответила.';
      return json(res, 200, { reply, transcript, model: config.ai.model || 'opencode/big-pickle', files: created, timings: { sttMs, aiMs, totalMs: sttMs + aiMs } });
    }

    // 2) если распознать не удалось — отправляем аудиофайл модели как есть
    const prompt = (body.hint || 'Распознай текст голосового сообщения и ответь на него кратко.') +
      '\n\nАудиофайл прикреплён. Если голос неразборчив, попроси повторить.\n\nАссистент:';
    const tAi = Date.now();
    reply = '';
    await runOpencode({ model: config.ai.model || 'opencode/big-pickle', prompt, files: [tmpFile] }, (t) => { reply += t; });
    const aiMs = Date.now() - tAi;
    if (!reply.trim()) reply = '⚠️ Модель не смогла разобрать голосовое.';
    return json(res, 200, { reply, model: config.ai.model || 'opencode/big-pickle', transcribed: false, timings: { sttMs, aiMs, totalMs: sttMs + aiMs } });
  } catch (e) {
    if (tmpFile) { try { fs.unlinkSync(tmpFile); } catch (e2) {} }
    return json(res, 500, { error: 'Голосовой ввод: ' + e.message });
  } finally {
    if (tmpFile) { try { fs.unlinkSync(tmpFile); } catch (e2) {} }
  }
}

/* ---------------- uploads ---------------- */

async function uploadHandler(req, res, body) {
  try {
    let dataUrl = body.data || '';
    if (!dataUrl) return json(res, 400, { error: 'no data' });
    const m = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
    if (!m) return json(res, 400, { error: 'bad data url' });
    const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' }[m[1]] || '.png';
    const fname = uid('up-') + ext;
    fs.writeFileSync(path.join(UPLOAD_DIR, fname), Buffer.from(m[2], 'base64'));
    return json(res, 200, { url: '/uploads/' + fname });
  } catch (e) {
    return serverError(res, e, 'upload');
  }
}

/* ---------------- config ---------------- */

function configHandler(req, res, body) {
  if (req.method === 'GET') {
    return json(res, 200, {
      port: config.port,
      cityName: config.cityName,
      ai: config.ai
    });
  }
  const ai = body && body.ai;
  if (ai) {
    if (typeof ai.mode === 'string') config.ai.mode = ai.mode;
    if (typeof ai.opencodeBin === 'string') config.ai.opencodeBin = ai.opencodeBin;
    if (typeof ai.projectsDir === 'string') { config.ai.projectsDir = ai.projectsDir; aiProjectsDir = null; }
    if (typeof ai.baseUrl === 'string') config.ai.baseUrl = ai.baseUrl;
    if (typeof ai.apiKey === 'string') config.ai.apiKey = ai.apiKey;
    if (typeof ai.model === 'string') config.ai.model = ai.model;
    if (typeof ai.systemPrompt === 'string') config.ai.systemPrompt = ai.systemPrompt;
    saveConfig();
  }
  if (body && (typeof body.cityName === 'string')) { config.cityName = body.cityName; saveConfig(); }
  return json(res, 200, { ok: true });
}

/* ---------------- Files API (project browser + download) ---------------- */

function projectsPath(rel) {
  const base = path.resolve(getProjectsDir());
  const relClean = (rel || '').replace(/\\/g, '/');
  const target = path.resolve(base, relClean);
  const baseWithSep = base.endsWith(path.sep) ? base : base + path.sep;
  if (target !== base && !target.startsWith(baseWithSep)) return null;
  return target;
}

function filesListHandler(req, res, url) {
  const rel = (url.searchParams.get('path') || '').replace(/^\/+/, '');
  const target = projectsPath(rel);
  if (!target) return json(res, 403, { error: 'outside projects dir' });
  try {
    if (!fs.existsSync(target)) return json(res, 404, { error: 'not found' });
    const st = fs.statSync(target);
    if (!st.isDirectory()) return json(res, 200, { path: rel, type: 'file', size: st.size });
    const entries = fs.readdirSync(target).map(name => {
      const p = path.join(target, name);
      let size = 0, isDir = false;
      try { const s = fs.statSync(p); isDir = s.isDirectory(); size = s.size; } catch (e) {}
      return { name, type: isDir ? 'dir' : 'file', size };
    }).sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : (a.type === 'dir' ? -1 : 1));
    return json(res, 200, { root: getProjectsDir(), path: rel, entries });
  } catch (e) { return serverError(res, e, 'files'); }
}

function fileDownloadHandler(req, res, url) {
  const rel = (url.searchParams.get('path') || '').replace(/^\/+/, '');
  const target = projectsPath(rel);
  if (!target) return json(res, 403, { error: 'outside projects dir' });
  try {
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return json(res, 404, { error: 'not found' });
    const name = path.basename(target);
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="' + name.replace(/"/g, '') + '"',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(target).pipe(res);
  } catch (e) { return serverError(res, e, 'file'); }
}

/* ---------------- Gateway page (auto-check cert trust) ---------------- */

function gatewayHtml(hostname, sslPort) {
  var httpsOrigin = 'https://' + (sslPort === 443 ? hostname : hostname + ':' + sslPort);
  return '<!DOCTYPE html>\n<html lang="ru">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>Проверка…</title>\n' +
    '<style>\nbody{font-family:system-ui,sans-serif;background:#1e2a3a;color:#eef;text-align:center;padding:80px 20px}\n' +
    '.spinner{width:36px;height:36px;border:3px solid #38475a;border-top-color:#5fa8d3;border-radius:50%;animation:spin .6s linear infinite;margin:0 auto 20px}\n' +
    '@keyframes spin{to{transform:rotate(360deg)}}\n</style>\n</head>\n<body>\n' +
    '<div class="spinner"></div>\n<p>Проверка безопасного соединения…</p>\n' +
    '<script>\n(function(){\n' +
    '  var h=' + JSON.stringify(httpsOrigin) + ';\n' +
    '  var t=setTimeout(function(){location.replace("/setup");},4000);\n' +
    '  fetch(h+"/api/ping",{mode:"no-cors",cache:"no-store"}).then(function(){\n' +
    '    clearTimeout(t); location.replace(h+"/");\n' +
    '  }).catch(function(){\n' +
    '    clearTimeout(t); location.replace("/setup");\n' +
    '  });\n' +
    '})();\n' +
    '</' + 'script>\n</body>\n</html>';
}

/* ---------------- router ---------------- */

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);
    if (p.startsWith('/api/')) {
      if (p.startsWith('/api/assist/')) {
        if (await assist.handle(p, url, req, res, { json, readBody })) return;
      }
      if (req.method === 'GET' && p === '/api/data') return json(res, 200, db);
      if (p === '/api/data' && (req.method === 'PUT' || req.method === 'POST')) {
        const body = JSON.parse((await readBody(req)).toString() || '{}');
        db = Object.assign(defaultDb(), body);
        saveDb();
        return json(res, 200, { ok: true, db });
      }
      if (req.method === 'GET' && p === '/api/weather') return await weatherHandler(res);
      if (p === '/api/upload' && req.method === 'POST') return await uploadHandler(req, res, JSON.parse((await readBody(req)).toString() || '{}'));
      if (p === '/api/stt' && req.method === 'POST') return await sttHandler(req, res, JSON.parse((await readBody(req)).toString() || '{}'));
      if (p.startsWith('/api/ai/voice') && req.method === 'POST') return await aiVoiceHandler(req, res, JSON.parse((await readBody(req)).toString() || '{}'));
      if (p.startsWith('/api/ai/chat') && req.method === 'POST') return await aiChatHandler(req, res, JSON.parse((await readBody(req)).toString() || '{}'));
      if (p.startsWith('/api/config')) return configHandler(req, res, req.method === 'GET' ? null : (JSON.parse((await readBody(req)).toString() || '{}')));
      if (req.method === 'GET' && p === '/api/ping') return json(res, 200, { ok: true });
      if (req.method === 'GET' && p === '/api/files') return filesListHandler(req, res, url);
      if (req.method === 'GET' && p === '/api/file') return fileDownloadHandler(req, res, url);
      return json(res, 404, { error: 'not found' });
    }

    if (p === '/ca.pem') {
      const ca = path.join(ROOT, 'ssl', 'ca.pem');
      if (fs.existsSync(ca)) {
        res.writeHead(200, { 'Content-Type': 'application/x-pem-file' });
        return fs.createReadStream(ca).pipe(res);
      }
      return json(res, 404, { error: 'no ca' });
    }

    if (p === '/setup') {
      const sp = path.join(PUBLIC_DIR, 'setup.html');
      if (fs.existsSync(sp)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return fs.createReadStream(sp).pipe(res);
      }
      return json(res, 404, { error: 'no setup page' });
    }

    if (p.startsWith('/uploads/')) {
      const file = path.normalize(path.join(UPLOAD_DIR, path.basename(p)));
      if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=86400' });
      return fs.createReadStream(file).pipe(res);
    }

    let file = p === '/' ? '/index.html' : p;
    const target = path.normalize(path.join(PUBLIC_DIR, file));
    if (!target.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('forbidden'); }
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  } catch (err) {
    serverError(res, err, 'router');
  }
}

function lanIPs() {
  const list = [];
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) list.push({ name, ip: net.address });
    }
  }
  return list;
}

const port = Number(process.env.PORT || config.port || 8080);
const sslPort = Number(config.sslPort || 8443);
const host = config.host || '0.0.0.0';

const certFile = path.join(ROOT, 'ssl', 'server.pem');
const keyFile = path.join(ROOT, 'ssl', 'server.key');
const httpsEnabled = fs.existsSync(certFile) && fs.existsSync(keyFile);

function startLogs() {
  console.log('');
  console.log('  ==== Kanban Board ====');
  console.log('  Local:   http://localhost:' + port);
  lanIPs().forEach(x => console.log('  LAN:     http://' + x.ip + ':' + port + '  (' + x.name + ')'));
  console.log('');
  if (config.ai && config.ai.mode === 'cli') {
    console.log('  AI:      opencode CLI (' + (config.ai.model || 'opencode/big-pickle') + ')');
  }
}

if (httpsEnabled) {
  try {
    const certBuf = fs.readFileSync(certFile);
    const caChainFile = path.join(ROOT, 'ssl', 'ca.pem');
    let certChain = certBuf;
    if (fs.existsSync(caChainFile)) certChain = Buffer.concat([certBuf, fs.readFileSync(caChainFile)]);
    const options = {
      cert: certChain,
      key: fs.readFileSync(keyFile)
    };
    https.createServer(options, (req, res) => {
      // если запрос пришёл на HTTP-порт, но по https — обрабатываем как обычный
      handleRequest(req, res);
    }).listen(sslPort, host, () => {
      console.log('  HTTPS:   https://localhost:' + sslPort + '  (TLS)');
      lanIPs().forEach(x => console.log('  LAN TLS: https://' + x.ip + ':' + sslPort + '  (' + x.name + ')'));
    });
    console.log('');
  } catch (e) {
    console.log('  HTTPS disabled: bad cert (' + e.message + ')');
  }

http.createServer((req, res) => {
      const hostno = (req.headers.host || 'localhost').split(':')[0] || 'localhost';
      const isLocal = hostno === 'localhost' || hostno === '127.0.0.1' || hostno === '::1';
      if (isLocal) return handleRequest(req, res);
      let p = '';
      try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (e) { p = '/'; }
      if (p === '/ca.pem' || p === '/setup') return handleRequest(req, res);
      // Файл-шлюз: проверяет, доверяет ли браузер нашему сертификату.
      // Если да — перенаправляет на HTTPS, если нет — на страницу /setup.
      const safeHost = hostno.replace(/[^a-zA-Z0-9.\-:]/g, '');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(gatewayHtml(safeHost, sslPort));
    }).listen(port, host, () => {
    console.log('  HTTP:    http://localhost:' + port + '  (приложение; микрофон/wake работают)');
    console.log('  HTTP:    http://<LAN IP>:' + port + '  -> redirects to HTTPS');
  });
} else {
  http.createServer(handleRequest).listen(port, host, startLogs);
}

// если HTTPS активен, печатаем лог после запуска
if (httpsEnabled) {
  setTimeout(startLogs, 100);
}

/* ---------------- Telegram-бот (мост к ассистенту) ---------------- */

const tgToken = (config.telegram && config.telegram.token) || process.env.TELEGRAM_TOKEN || '';
if (tgToken) {
  telegram.start({
    token: tgToken,
    allowed: (config.telegram && config.telegram.allowed) || [],
    cli: path.join(ROOT, 'assist-cli.js'),
    dbPath: path.join(DATA_DIR, 'db.json'),
    log: (m) => console.log('[telegram] ' + m),
    ask: async (text) => {
      const wantCardify = intentCardify(text);
      const prompt = (config.ai.systemPrompt || 'Ты полезный ИИ-ассистент.') +
        '\nОтвечай по-русски, кратко и по делу. Пользователь пишет из Telegram.' +
        (wantCardify ? CARDIFY_RULE : '') +
        '\n\nПользователь: ' + String(text) + '\n\nАссистент:';
      let reply = '';
      const before = snapshotFiles(getProjectsDir());
      await runOpencode({ model: config.ai.model || 'opencode/big-pickle', prompt, files: [] }, (t) => { reply += t; });
      const created = diffFiles(before, snapshotFiles(getProjectsDir()));
      if (wantCardify) { const r = await applyCardify(reply); reply = r.text; }
      if (!reply.trim()) reply = '⚠️ Модель не ответила.';
      return created && created.length ? reply + '\n\nФайлы: ' + created.map(f => f.path).join(', ') : reply;
    }
  });
}