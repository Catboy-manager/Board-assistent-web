'use strict';

module.exports = (deps) => {
  const { dataDir, json, uploadsDir } = deps;
  const fs = require('fs');
  const path = require('path');

  const FILE = path.join(dataDir, 'sounds.json');
  let config = { default: { enabled: true, volume: 0.6, src: '/sounds/notify.mp3' }, rules: [] };
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (d && typeof d === 'object') config = Object.assign(config, d);
  } catch (e) {}

  function save() {
    try { fs.writeFileSync(FILE, JSON.stringify(config, null, 2)); } catch (e) {}
  }

  function resolveSrc(src) {
    if (!src) return '/sounds/notify.mp3';
    if (src.startsWith('/uploads/')) return src;
    if (src.startsWith('/sounds/')) return src;
    return '/uploads/sounds/' + path.basename(src);
  }

  async function handle(p, url, req, res) {
    if (req.method === 'GET' && p === '/api/sounds/config') {
      return json(res, 200, { config });
    }
    if (req.method === 'POST' && p === '/api/sounds/config') {
      let body = {};
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => {
        try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) {}
        if (body.default) config.default = Object.assign(config.default, body.default);
        if (Array.isArray(body.rules)) config.rules = body.rules;
        save();
        json(res, 200, { ok: true, config });
      });
      return true;
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
