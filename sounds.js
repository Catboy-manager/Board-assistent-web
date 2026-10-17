'use strict';

module.exports = (deps) => {
  const { dataDir, json, uploadsDir } = deps;
  const fs = require('fs');
  const path = require('path');

  const FILE = path.join(dataDir, 'sounds.json');
  const SOUNDS_DIR = path.join(uploadsDir, 'sounds');
  const MAX_BYTES = 12 * 1024 * 1024;
  const AUDIO_MIME = {
    'audio/mpeg': '.mp3', 'audio/mp3': '.mp3',
    'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/wave': '.wav',
    'audio/ogg': '.ogg', 'audio/opus': '.ogg',
    'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.m4a',
    'audio/webm': '.webm', 'audio/flac': '.flac', 'audio/x-flac': '.flac'
  };
  const AUDIO_EXT = ['.mp3', '.wav', '.ogg', '.oga', '.opus', '.m4a', '.aac', '.webm', '.flac'];

  /* Встроенные примеры: файлы лежат в public/sounds, отдаются как /sounds/<file> */
  const BUILTINS = [
    { file: 'notify.mp3', label: 'Звонкий (по умолчанию)' },
    { file: 'soft.mp3', label: 'Мягкий' },
    { file: 'bell.mp3', label: 'Колокольчик' },
    { file: 'message.mp3', label: 'Сообщение' },
    { file: 'pop.mp3', label: 'Поп' },
    { file: 'drop.mp3', label: 'Капля' },
    { file: 'success.mp3', label: 'Успех' },
    { file: 'alert.mp3', label: 'Внимание' },
    { file: 'urgent.mp3', label: 'Срочно' },
    { file: 'arpeggio.mp3', label: 'Арпеджио' }
  ];

  let config = { default: { enabled: true, volume: 0.6, src: '/sounds/notify.mp3' }, rules: [] };
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (d && typeof d === 'object') config = Object.assign(config, d);
  } catch (e) {}

  try { fs.mkdirSync(SOUNDS_DIR, { recursive: true }); } catch (e) {}

  function save() {
    try { fs.writeFileSync(FILE, JSON.stringify(config, null, 2)); } catch (e) {}
  }

  function resolveSrc(src) {
    if (!src) return '/sounds/notify.mp3';
    if (src.startsWith('/uploads/')) return src;
    if (src.startsWith('/sounds/')) return src;
    return '/uploads/sounds/' + path.basename(src);
  }

  function uploadedList() {
    let names = [];
    try {
      names = fs.readdirSync(SOUNDS_DIR)
        .filter(f => AUDIO_EXT.includes(path.extname(f).toLowerCase()))
        .sort((a, b) => a.localeCompare(b));
    } catch (e) {}
    return names.map(f => ({ name: f, src: '/uploads/sounds/' + f, builtin: false, label: f }));
  }

  function builtinList() {
    return BUILTINS.map(b => {
      const p = path.join(__dirname, 'public', 'sounds', b.file);
      let exists = false;
      try { exists = fs.existsSync(p); } catch (e) {}
      return { name: b.file, src: '/sounds/' + b.file, builtin: true, label: b.label, exists };
    }).filter(b => b.exists);
  }

  function listAll() {
    return builtinList().concat(uploadedList());
  }

  function readBody(req) {
    return new Promise((resolve) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', () => resolve(Buffer.alloc(0)));
    });
  }

  function safeName(name) {
    let base = path.basename(String(name || 'sound')).replace(/[^\w.\- ()]+/g, '_').slice(0, 80);
    if (!AUDIO_EXT.includes(path.extname(base).toLowerCase())) base += '.mp3';
    return base || ('sound-' + Date.now() + '.mp3');
  }

  async function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/sounds/config') {
      return json(res, 200, { config });
    }
    if (req.method === 'GET' && p === '/api/sounds/list') {
      return json(res, 200, { sounds: listAll(), builtins: builtinList(), uploads: uploadedList() });
    }
    if (req.method === 'POST' && p === '/api/sounds/config') {
      const buf = await readBody(req);
      let body = {};
      try { body = JSON.parse(buf.toString() || '{}'); } catch (e) {}
      if (body.default) config.default = Object.assign(config.default, body.default);
      if (body.default && body.default.src) config.default.src = resolveSrc(config.default.src);
      if (Array.isArray(body.rules)) {
        config.rules = body.rules.map(r => Object.assign({}, r, { src: resolveSrc(r && r.src) }));
      }
      save();
      return json(res, 200, { ok: true, config });
    }
    if (req.method === 'POST' && p === '/api/sounds/upload') {
      const buf = await readBody(req);
      let body = {};
      try { body = JSON.parse(buf.toString() || '{}'); } catch (e) {}
      const dataUrl = String(body.data || '');
      const m = dataUrl.match(/^data:([^;,]+);base64,(.+)$/s);
      if (!m) return json(res, 400, { error: 'Нужен аудиофайл (data URL)' });
      const mime = m[1].toLowerCase();
      const ext = AUDIO_MIME[mime] || (AUDIO_EXT.includes(path.extname(body.name || '').toLowerCase()) ? path.extname(body.name).toLowerCase() : null);
      if (!ext) return json(res, 400, { error: 'Неподдерживаемый формат звука: ' + mime });
      let bin;
      try { bin = Buffer.from(m[2], 'base64'); } catch (e) { return json(res, 400, { error: 'Повреждённый файл' }); }
      if (!bin.length) return json(res, 400, { error: 'Пустой файл' });
      if (bin.length > MAX_BYTES) return json(res, 413, { error: 'Файл слишком большой (максимум 12 МБ)' });
      let name = safeName(body.name || ('sound-' + Date.now() + ext));
      if (path.extname(name).toLowerCase() !== ext) name = name.replace(/\.[^.]*$/, '') + ext;
      let target = path.join(SOUNDS_DIR, name);
      if (fs.existsSync(target)) name = name.replace(/(\.[^.]*)$/, '-' + Date.now().toString(36) + '$1'), target = path.join(SOUNDS_DIR, name);
      try { fs.writeFileSync(target, bin); } catch (e) { return json(res, 500, { error: 'Не удалось сохранить файл' }); }
      return json(res, 200, { ok: true, sound: { name, src: '/uploads/sounds/' + name, builtin: false, label: name } });
    }
    if (req.method === 'POST' && p === '/api/sounds/delete') {
      const buf = await readBody(req);
      let body = {};
      try { body = JSON.parse(buf.toString() || '{}'); } catch (e) {}
      const src = String(body.src || '');
      if (!src.startsWith('/uploads/sounds/')) return json(res, 400, { error: 'Удалять можно только свои загруженные звуки' });
      const name = path.basename(src);
      const target = path.join(SOUNDS_DIR, name);
      if (!target.startsWith(SOUNDS_DIR)) return json(res, 403, { error: 'forbidden' });
      try { if (fs.existsSync(target)) fs.unlinkSync(target); } catch (e) { return json(res, 500, { error: 'Не удалось удалить' }); }
      return json(res, 200, { ok: true });
    }
    return false;
  }

  function pick(app, title, text, user, chat) {
    const s = String(app || '') + '|' + String(title || '') + '|' + String(text || '') + '|' + String(user || '') + '|' + String(chat || '');
    const low = s.toLowerCase();
    for (const r of config.rules || []) {
      if (!r || !r.enabled) continue;
      const pat = String(r.pattern || '').toLowerCase();
      if (!pat) continue;
      if (low.indexOf(pat) !== -1 || s.indexOf(r.pattern) !== -1) {
        return { enabled: r.enabled !== false, volume: r.volume || config.default.volume || 0.6, src: resolveSrc(r.src || config.default.src) };
      }
    }
    return { enabled: config.default.enabled !== false, volume: config.default.volume || 0.6, src: resolveSrc(config.default.src) };
  }

  return { handle, pick, config() { return config; } };
};
